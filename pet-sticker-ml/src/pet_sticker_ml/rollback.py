"""모델 롤백 CLI.

이전 챔피언은 승격 시 model_history/v{n}/ 에 보관된다. 본 CLI 로 보관된 버전 목록을 보고,
특정 버전을 다시 챔피언으로 되돌린다(현재 챔피언도 보관 후 교체). 강의의 "코드는 그대로,
모델만 되돌리는" 롤백 패턴을 구현한다.
"""

from __future__ import annotations

import argparse
import json
import shutil

from . import config
from .champion_export import METADATA_FILENAME, MODEL_FILENAME, load_metadata
from .model_promoter import _set_registry_alias, archive_current_champion


def list_versions() -> dict:
    """현재 챔피언 + 보관된 이전 버전 목록."""
    champion = load_metadata(config.CHAMPION_DIR)
    history = []
    if config.MODEL_HISTORY_DIR.exists():
        for child in sorted(config.MODEL_HISTORY_DIR.glob("v*")):
            meta = load_metadata(child)
            if meta:
                history.append(
                    {
                        "version": meta.get("version"),
                        "dataVersion": meta.get("dataVersion"),
                        "macro_f1": meta.get("metrics", {}).get("macro_f1"),
                        "path": str(child),
                    }
                )
    return {
        "champion": {
            "version": champion.get("version") if champion else None,
            "macro_f1": champion.get("metrics", {}).get("macro_f1") if champion else None,
        },
        "history": history,
    }


def rollback(to_version: int) -> dict:
    """보관된 버전을 챔피언으로 복원."""
    source = config.MODEL_HISTORY_DIR / f"v{to_version}"
    if not (source / MODEL_FILENAME).exists():
        raise FileNotFoundError(
            f"보관된 버전 v{to_version} 가 없습니다: {source}. `--list` 로 목록 확인."
        )
    # 현재 챔피언을 먼저 보관 (롤포워드 가능하도록)
    archive_current_champion()

    config.CHAMPION_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / MODEL_FILENAME, config.CHAMPION_DIR / MODEL_FILENAME)
    meta = load_metadata(source) or {}
    meta["rolledBack"] = True
    (config.CHAMPION_DIR / METADATA_FILENAME).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    alias_ok = _set_registry_alias(meta.get("runId"))
    result = {
        "rolled_back_to": to_version,
        "champion_version": meta.get("version"),
        "macro_f1": meta.get("metrics", {}).get("macro_f1"),
        "registry_alias_updated": alias_ok,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="모델 롤백 CLI")
    parser.add_argument("--list", action="store_true", help="버전 목록 출력")
    parser.add_argument("--to", type=int, default=None, help="복원할 버전 번호")
    args = parser.parse_args()
    if args.list or args.to is None:
        print(json.dumps(list_versions(), ensure_ascii=False, indent=2))
        if args.to is None:
            return
    rollback(args.to)


if __name__ == "__main__":
    main()
