"""Train and export the pet sticker quality model with MLflow."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mlflow
import mlflow.sklearn
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from pet_sticker_ml.features import DatasetConfig, FEATURE_NAMES, generate_bootstrap_dataset

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PACKAGE_ROOT.parent
DEFAULT_MODEL_OUT = REPO_ROOT / "pet-sticker-next" / "lib" / "ml" / "sticker-quality-model.json"
DEFAULT_REGISTRY_DIR = PACKAGE_ROOT / "model-registry" / "sticker-quality"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tracking-uri", default=f"file:{PACKAGE_ROOT / 'mlruns'}")
    parser.add_argument("--experiment-name", default="pet-sticker-quality")
    parser.add_argument("--registered-model-name", default="pet-sticker-quality")
    parser.add_argument("--model-out", type=Path, default=DEFAULT_MODEL_OUT)
    parser.add_argument("--registry-dir", type=Path, default=DEFAULT_REGISTRY_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-samples", type=int, default=900)
    parser.add_argument("--alpha", type=float, default=0.4)
    parser.add_argument("--min-delta", type=float, default=0.0)
    return parser.parse_args()


def build_export_payload(
    *,
    pipeline: Pipeline,
    metrics: dict[str, float],
    run_id: str,
    version: str,
    seed: int,
    n_samples: int,
) -> dict[str, Any]:
    """Convert a fitted sklearn pipeline into app-readable JSON."""
    scaler: StandardScaler = pipeline.named_steps["scaler"]
    regressor: Ridge = pipeline.named_steps["regressor"]

    return {
        "modelName": "pet-sticker-quality",
        "modelType": "standardized-linear-regression",
        "version": version,
        "alias": "champion",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "runId": run_id,
        "featureNames": FEATURE_NAMES,
        "means": scaler.mean_.round(8).tolist(),
        "scales": scaler.scale_.round(8).tolist(),
        "coefficients": regressor.coef_.round(8).tolist(),
        "intercept": round(float(regressor.intercept_), 8),
        "thresholds": {"good": 82, "warning": 65},
        "metrics": metrics,
        "training": {
            "seed": seed,
            "nSamples": n_samples,
            "dataSource": "bootstrap-synthetic-v1",
        },
    }


def load_champion(registry_dir: Path) -> dict[str, Any] | None:
    champion_path = registry_dir / "champion.json"
    if not champion_path.exists():
        return None
    return json.loads(champion_path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    x, y = generate_bootstrap_dataset(
        DatasetConfig(n_samples=args.n_samples, seed=args.seed)
    )
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.25, random_state=args.seed
    )

    pipeline = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("regressor", Ridge(alpha=args.alpha)),
        ]
    )

    mlflow.set_tracking_uri(args.tracking_uri)
    mlflow.set_experiment(args.experiment_name)

    with mlflow.start_run(run_name=f"quality-ridge-{version}") as run:
        pipeline.fit(x_train, y_train)
        predictions = np.clip(pipeline.predict(x_test), 0.0, 100.0)
        metrics = {
            "mae": round(float(mean_absolute_error(y_test, predictions)), 6),
            "rmse": round(float(mean_squared_error(y_test, predictions) ** 0.5), 6),
            "r2": round(float(r2_score(y_test, predictions)), 6),
        }

        mlflow.log_params(
            {
                "seed": args.seed,
                "n_samples": args.n_samples,
                "alpha": args.alpha,
                "feature_count": len(FEATURE_NAMES),
            }
        )
        mlflow.log_metrics(metrics)
        mlflow.log_dict({"featureNames": FEATURE_NAMES}, "features.json")
        mlflow.sklearn.log_model(
            pipeline,
            name="model",
            registered_model_name=args.registered_model_name,
        )

        payload = build_export_payload(
            pipeline=pipeline,
            metrics=metrics,
            run_id=run.info.run_id,
            version=version,
            seed=args.seed,
            n_samples=args.n_samples,
        )
        version_path = args.registry_dir / f"{version}.json"
        write_json(version_path, payload)
        mlflow.log_artifact(version_path)

    champion = load_champion(args.registry_dir)
    current_r2 = -1.0 if champion is None else float(champion.get("metrics", {}).get("r2", -1.0))
    promoted = metrics["r2"] >= current_r2 + args.min_delta

    if promoted:
        write_json(args.model_out, payload)
        write_json(
            args.registry_dir / "champion.json",
            {
                "alias": "champion",
                "version": payload["version"],
                "modelPath": f"{payload['version']}.json",
                "servedBy": str(args.model_out.relative_to(REPO_ROOT)),
                "metrics": payload["metrics"],
                "runId": payload["runId"],
                "promotedAt": datetime.now(timezone.utc).isoformat(),
            },
        )

    print(json.dumps({"version": version, "metrics": metrics, "promoted": promoted}, indent=2))


if __name__ == "__main__":
    main()
