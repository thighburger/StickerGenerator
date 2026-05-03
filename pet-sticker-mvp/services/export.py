"""PNG export helpers."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from PIL import Image

from config import PRINT_DPI


def export_png(sheet: Image.Image, output_dir: Path) -> Path:
    """Write a sticker sheet PNG and return its path."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"pet_sticker_sheet_{timestamp}_{uuid4().hex[:8]}.png"
    sheet.convert("RGB").save(output_path, format="PNG", dpi=(PRINT_DPI, PRINT_DPI))
    return output_path
