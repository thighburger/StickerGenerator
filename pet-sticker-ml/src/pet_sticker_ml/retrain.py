"""재학습 CLI (데이터 변경 → 학습 → 평가 → 승격 한 번에).

사용 예: 사용자 피드백을 반영한 데이터 v2 로 재학습 후, 더 좋으면 챔피언 자동 교체.
    python -m pet_sticker_ml.retrain --data-version v2 --min-delta 0.0
"""

from __future__ import annotations

import argparse
import json

from .dataset import csv_path, generate_dataset, write_csv
from .model_promoter import promote
from .train import run_training


def retrain(
    data_version: str = "v2",
    min_delta: float = 0.0,
    regenerate: bool = True,
    tracking_uri: str | None = None,
    force: bool = False,
) -> dict:
    """데이터 재생성 → 학습 → 승격 판정."""
    if regenerate:
        frame = generate_dataset(data_version)
        path = write_csv(frame, csv_path(data_version))
        print(f"[retrain] 데이터 재생성: {path} ({len(frame)} rows)")

    train_summary = run_training(
        data_version=data_version,
        tracking_uri=tracking_uri,
        bootstrap_champion=False,
    )
    promote_decision = promote(min_delta=min_delta, force=force)
    result = {"train": train_summary, "promotion": promote_decision}
    print("[retrain] 완료:")
    print(json.dumps(promote_decision, ensure_ascii=False, indent=2))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="재학습 CLI")
    parser.add_argument("--data-version", default="v2")
    parser.add_argument("--min-delta", type=float, default=0.0)
    parser.add_argument("--tracking-uri", default=None)
    parser.add_argument("--no-regenerate", action="store_true", help="기존 CSV 사용")
    parser.add_argument("--force", action="store_true", help="비교 없이 강제 승격")
    args = parser.parse_args()
    retrain(
        data_version=args.data_version,
        min_delta=args.min_delta,
        regenerate=not args.no_regenerate,
        tracking_uri=args.tracking_uri,
        force=args.force,
    )


if __name__ == "__main__":
    main()
