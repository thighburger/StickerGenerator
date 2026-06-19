"""Rollback the app-facing model to a previous registry version."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PACKAGE_ROOT.parent
DEFAULT_MODEL_OUT = REPO_ROOT / "pet-sticker-next" / "lib" / "ml" / "sticker-quality-model.json"
DEFAULT_REGISTRY_DIR = PACKAGE_ROOT / "model-registry" / "sticker-quality"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--model-out", type=Path, default=DEFAULT_MODEL_OUT)
    parser.add_argument("--registry-dir", type=Path, default=DEFAULT_REGISTRY_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = args.registry_dir / f"{args.version}.json"
    if not source.exists():
        raise SystemExit(f"Unknown model version: {args.version}")

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, args.model_out)
    model = json.loads(source.read_text(encoding="utf-8"))
    champion = {
        "alias": "champion",
        "version": args.version,
        "modelPath": source.name,
        "servedBy": str(args.model_out.relative_to(REPO_ROOT)),
        "metrics": model.get("metrics", {}),
        "runId": model.get("runId", ""),
        "rolledBackAt": datetime.now(timezone.utc).isoformat(),
    }
    (args.registry_dir / "champion.json").write_text(
        json.dumps(champion, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(champion, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
