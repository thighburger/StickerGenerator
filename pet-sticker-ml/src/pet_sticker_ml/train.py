"""MLflow 기반 학습 파이프라인.

흐름: 데이터 로드 → 학습/평가 → MLflow run 기록(param·metric·artifact·model)
→ 레지스트리 등록(best-effort) → 후보 모델 export(.candidate) → (옵션) 챔피언 부트스트랩.

순수 학습 함수(:func:`train_model`)는 MLflow 부작용이 없어 테스트/재학습에서 재사용된다.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402
from sklearn.metrics import (  # noqa: E402
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from . import config  # noqa: E402
from .champion_export import build_metadata, export_model, load_metadata  # noqa: E402
from .dataset import load_dataset  # noqa: E402
from .features import FEATURE_NAMES  # noqa: E402

CANDIDATE_DIR = config.CANDIDATE_DIR


@dataclass
class TrainResult:
    pipeline: Pipeline
    metrics: dict
    params: dict
    classes: list[str]
    y_test: np.ndarray
    y_pred: np.ndarray
    report_text: str


def build_pipeline(seed: int, n_estimators: int) -> Pipeline:
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=n_estimators,
                    random_state=seed,
                    class_weight="balanced",
                    n_jobs=-1,
                ),
            ),
        ]
    )


def train_model(
    data_version: str = "v1",
    seed: int = 42,
    n_estimators: int = 200,
    test_size: float = 0.2,
) -> TrainResult:
    """순수 학습 함수 (MLflow 부작용 없음). 테스트/재학습에서 재사용."""
    frame = load_dataset(data_version)
    features = frame[FEATURE_NAMES].to_numpy(dtype=float)
    labels = frame["label"].to_numpy()
    quality_score = frame["quality_score"].to_numpy(dtype=float)

    indices = np.arange(len(frame))
    train_idx, test_idx = train_test_split(
        indices, test_size=test_size, random_state=seed, stratify=labels
    )
    pipeline = build_pipeline(seed, n_estimators)
    pipeline.fit(features[train_idx], labels[train_idx])
    y_pred = pipeline.predict(features[test_idx])
    y_test = labels[test_idx]

    classes = list(pipeline.classes_)
    accuracy = accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average="macro")
    per_class_f1 = f1_score(y_test, y_pred, average=None, labels=config.QUALITY_CLASSES)

    # 클래스 확률 → 0~100 점수, 실제 quality_score 와 MAE
    proba = pipeline.predict_proba(features[test_idx])
    score_weights = np.array([config.CLASS_SCORE_WEIGHTS[c] for c in classes])
    derived_score = proba @ score_weights
    score_mae = float(np.mean(np.abs(derived_score - quality_score[test_idx])))

    metrics = {
        "accuracy": round(float(accuracy), 4),
        "macro_f1": round(float(macro_f1), 4),
        "score_mae": round(score_mae, 4),
    }
    for label, value in zip(config.QUALITY_CLASSES, per_class_f1, strict=True):
        metrics[f"f1_{label}"] = round(float(value), 4)

    params = {
        "data_version": data_version,
        "seed": seed,
        "n_estimators": n_estimators,
        "test_size": test_size,
        "model_type": "RandomForestClassifier",
        "feature_count": len(FEATURE_NAMES),
        "n_samples": len(frame),
        "n_train": len(train_idx),
        "n_test": len(test_idx),
    }
    report_text = classification_report(
        y_test, y_pred, labels=config.QUALITY_CLASSES, zero_division=0
    )
    return TrainResult(pipeline, metrics, params, classes, y_test, y_pred, report_text)


def _log_artifacts(result: TrainResult, data_version: str) -> None:
    import mlflow

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        (tmp_dir / "features.json").write_text(
            json.dumps(FEATURE_NAMES, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (tmp_dir / "classification_report.txt").write_text(
            result.report_text, encoding="utf-8"
        )
        (tmp_dir / "dataset_version.txt").write_text(data_version, encoding="utf-8")

        matrix = confusion_matrix(
            result.y_test, result.y_pred, labels=config.QUALITY_CLASSES
        )
        display = ConfusionMatrixDisplay(matrix, display_labels=config.QUALITY_CLASSES)
        fig, ax = plt.subplots(figsize=(5, 4))
        display.plot(ax=ax, cmap="Blues", colorbar=False)
        ax.set_title(f"Confusion Matrix ({data_version})")
        fig.tight_layout()
        fig.savefig(tmp_dir / "confusion_matrix.png", dpi=120)
        plt.close(fig)

        for name in (
            "features.json",
            "classification_report.txt",
            "dataset_version.txt",
            "confusion_matrix.png",
        ):
            mlflow.log_artifact(str(tmp_dir / name))

    csv_file = config.DATA_DIR / f"sticker_quality_{data_version}.csv"
    if csv_file.exists():
        mlflow.log_artifact(str(csv_file), artifact_path="dataset")


def run_training(
    data_version: str = "v1",
    seed: int = 42,
    n_estimators: int = 200,
    test_size: float = 0.2,
    tracking_uri: str | None = None,
    experiment: str | None = None,
    register: bool = True,
    bootstrap_champion: bool = False,
    candidate_dir: Path = CANDIDATE_DIR,
) -> dict:
    """학습 + MLflow 기록 + 후보 export. run 요약 dict 반환."""
    import mlflow
    import mlflow.sklearn

    config.ensure_dirs()
    mlflow.set_tracking_uri(tracking_uri or config.mlflow_tracking_uri())
    mlflow.set_experiment(experiment or config.EXPERIMENT_NAME)

    result = train_model(data_version, seed, n_estimators, test_size)

    run_id = None
    registry_version = None
    with mlflow.start_run(run_name=f"quality-rf-{data_version}") as run:
        run_id = run.info.run_id
        mlflow.set_tags({"data_version": data_version, "model_type": "RandomForestClassifier"})
        mlflow.log_params(result.params)
        mlflow.log_metrics(result.metrics)
        _log_artifacts(result, data_version)
        try:
            if register:
                info = mlflow.sklearn.log_model(
                    result.pipeline,
                    artifact_path="model",
                    registered_model_name=config.MODEL_NAME,
                )
                registry_version = _maybe_register_version(info, run_id)
            else:
                info = mlflow.sklearn.log_model(result.pipeline, artifact_path="model")
        except Exception as exc:  # noqa: BLE001 - 레지스트리 미지원 환경에서도 학습은 성공
            print(f"[train] 모델 로깅/등록 경고: {exc}")

    # 후보 export (model_promoter 가 비교)
    current = load_metadata(config.CHAMPION_DIR)
    next_version = (current.get("version", 0) + 1) if current else 1
    metadata = build_metadata(
        version=registry_version or next_version,
        run_id=run_id,
        data_version=data_version,
        metrics=result.metrics,
        params=result.params,
    )
    export_model(result.pipeline, metadata, candidate_dir)

    promoted = False
    if bootstrap_champion or load_metadata(config.CHAMPION_DIR) is None:
        champion_meta = build_metadata(
            version=1,
            run_id=run_id,
            data_version=data_version,
            metrics=result.metrics,
            params=result.params,
        )
        export_model(result.pipeline, champion_meta, config.CHAMPION_DIR)
        promoted = True

    summary = {
        "run_id": run_id,
        "tracking_uri": mlflow.get_tracking_uri(),
        "experiment": experiment or config.EXPERIMENT_NAME,
        "data_version": data_version,
        "metrics": result.metrics,
        "params": result.params,
        "registry_version": registry_version,
        "candidate_dir": str(candidate_dir),
        "champion_bootstrapped": promoted,
    }
    print("[train] run 요약:")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def _maybe_register_version(model_info, run_id: str) -> int | None:
    """등록된 모델 버전 번호 조회 (실패해도 None)."""
    try:
        from mlflow.tracking import MlflowClient

        client = MlflowClient()
        versions = client.search_model_versions(f"name='{config.MODEL_NAME}'")
        run_versions = [int(v.version) for v in versions if v.run_id == run_id]
        return max(run_versions) if run_versions else None
    except Exception as exc:  # noqa: BLE001
        print(f"[train] 레지스트리 버전 조회 경고: {exc}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="스티커 품질 모델 MLflow 학습")
    parser.add_argument("--data-version", default="v1")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-estimators", type=int, default=200)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--tracking-uri", default=None)
    parser.add_argument("--experiment", default=None)
    parser.add_argument("--no-register", action="store_true", help="레지스트리 등록 생략")
    parser.add_argument(
        "--bootstrap-champion",
        action="store_true",
        help="챔피언이 없거나 강제로 v1 챔피언을 만들 때",
    )
    args = parser.parse_args()
    run_training(
        data_version=args.data_version,
        seed=args.seed,
        n_estimators=args.n_estimators,
        test_size=args.test_size,
        tracking_uri=args.tracking_uri,
        experiment=args.experiment,
        register=not args.no_register,
        bootstrap_champion=args.bootstrap_champion,
    )


if __name__ == "__main__":
    main()
