"""챔피언 모델 승격기.

신규 후보(.candidate)의 macro-F1 이 현재 챔피언보다 (min-delta 이상) 좋을 때만 챔피언으로
승격한다. 승격 시 이전 챔피언을 model_history/ 에 보관해 롤백을 지원하고, MLflow 레지스트리
alias(@champion)도 best-effort 로 갱신한다. 강의의 model_promoter 패턴을 따른다.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from . import config
from .champion_export import (
    METADATA_FILENAME,
    MODEL_FILENAME,
    build_metadata,
    load_metadata,
)

PROMOTION_METRIC = "macro_f1"


def archive_current_champion() -> Path | None:
    """현재 챔피언을 model_history/v{n}/ 에 보관."""
    metadata = load_metadata(config.CHAMPION_DIR)
    if metadata is None:
        return None
    version = metadata.get("version", 0)
    dest = config.MODEL_HISTORY_DIR / f"v{version}"
    dest.mkdir(parents=True, exist_ok=True)
    for name in (MODEL_FILENAME, METADATA_FILENAME):
        src = config.CHAMPION_DIR / name
        if src.exists():
            shutil.copy2(src, dest / name)
    return dest


def _set_registry_alias(run_id: str | None) -> bool:
    """run_id 에 해당하는 레지스트리 버전을 찾아 @champion alias 갱신 (실패해도 무시)."""
    if not run_id:
        return False
    try:
        import mlflow
        from mlflow.tracking import MlflowClient

        mlflow.set_tracking_uri(config.mlflow_tracking_uri())
        client = MlflowClient()
        versions = client.search_model_versions(f"name='{config.MODEL_NAME}'")
        matched = [int(v.version) for v in versions if v.run_id == run_id]
        if not matched:
            return False
        client.set_registered_model_alias(
            config.MODEL_NAME, config.CHAMPION_ALIAS, str(max(matched))
        )
        return True
    except Exception as exc:  # noqa: BLE001 - 파일스토어 등에서 alias 미지원 시
        print(f"[promote] 레지스트리 alias 갱신 경고(무시): {exc}")
        return False


def promote(min_delta: float = 0.0, candidate_dir: Path | None = None, force: bool = False) -> dict:
    """후보를 평가해 승격 여부 결정. 결과 dict 반환."""
    candidate_dir = Path(candidate_dir) if candidate_dir else config.CANDIDATE_DIR
    candidate_meta = load_metadata(candidate_dir)
    if candidate_meta is None:
        raise FileNotFoundError(
            f"후보 모델이 없습니다: {candidate_dir}. 먼저 `python -m pet_sticker_ml.train` 실행."
        )

    champion_meta = load_metadata(config.CHAMPION_DIR)
    candidate_metric = candidate_meta["metrics"].get(PROMOTION_METRIC, 0.0)
    champion_metric = (
        champion_meta["metrics"].get(PROMOTION_METRIC, -1.0) if champion_meta else -1.0
    )
    improved = candidate_metric >= champion_metric + min_delta
    promote_now = force or champion_meta is None or improved

    decision = {
        "metric": PROMOTION_METRIC,
        "candidate_metric": candidate_metric,
        "champion_metric": champion_metric if champion_meta else None,
        "min_delta": min_delta,
        "promoted": promote_now,
        "forced": force,
    }

    if not promote_now:
        decision["reason"] = (
            f"후보 {PROMOTION_METRIC}={candidate_metric} 가 챔피언 {champion_metric} + "
            f"min_delta({min_delta}) 미만 → 챔피언 유지"
        )
        print(json.dumps(decision, ensure_ascii=False, indent=2))
        return decision

    archived = archive_current_champion()
    new_version = (champion_meta.get("version", 0) + 1) if champion_meta else 1
    new_meta = build_metadata(
        version=new_version,
        run_id=candidate_meta.get("runId"),
        data_version=candidate_meta.get("dataVersion", "unknown"),
        metrics=candidate_meta["metrics"],
        params=candidate_meta.get("params", {}),
        extra={"promotedFrom": candidate_meta.get("runId")},
    )
    # 모델 파일 교체
    config.CHAMPION_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(candidate_dir / MODEL_FILENAME, config.CHAMPION_DIR / MODEL_FILENAME)
    (config.CHAMPION_DIR / METADATA_FILENAME).write_text(
        json.dumps(new_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    alias_ok = _set_registry_alias(new_meta.get("runId"))

    decision.update(
        {
            "new_version": new_version,
            "archived_previous": str(archived) if archived else None,
            "registry_alias_updated": alias_ok,
            "reason": "후보 모델이 더 우수하여 챔피언으로 승격",
        }
    )
    print(json.dumps(decision, ensure_ascii=False, indent=2))
    return decision


def main() -> None:
    parser = argparse.ArgumentParser(description="챔피언 모델 승격기")
    parser.add_argument("--min-delta", type=float, default=0.0, help="승격 최소 개선폭")
    parser.add_argument("--candidate-dir", default=None)
    parser.add_argument("--force", action="store_true", help="비교 없이 강제 승격")
    args = parser.parse_args()
    promote(min_delta=args.min_delta, candidate_dir=args.candidate_dir, force=args.force)


if __name__ == "__main__":
    main()
