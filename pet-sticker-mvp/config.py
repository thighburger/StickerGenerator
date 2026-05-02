"""Application configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
OUTPUT_DIR = BASE_DIR / "outputs"

A6_WIDTH_MM = 105
A6_HEIGHT_MM = 148
PRINT_DPI = 300

REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg"
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def mm_to_px(mm: int | float, dpi: int = PRINT_DPI) -> int:
    """Convert millimeters to pixels at the configured print density."""
    return round(float(mm) / 25.4 * dpi)


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from environment variables."""

    remove_bg_api_key: str | None
    remove_bg_endpoint: str
    remove_bg_timeout_seconds: int
    remove_bg_max_retries: int
    remove_bg_retry_delay_seconds: float
    remove_bg_request_delay_seconds: float
    temp_dir: Path
    output_dir: Path
    a6_width_px: int
    a6_height_px: int
    sticker_border_px: int
    sticker_cutline_px: int
    sticker_cutline_color: tuple[int, int, int, int]
    max_sticker_width_px: int
    max_sticker_height_px: int
    layout_margin_px: int
    layout_gap_px: int
    max_rotation_degrees: float


def get_settings() -> Settings:
    """Load settings from `.env` and process environment."""
    load_dotenv(BASE_DIR / ".env")

    a6_width_px = mm_to_px(A6_WIDTH_MM)
    a6_height_px = mm_to_px(A6_HEIGHT_MM)

    return Settings(
        remove_bg_api_key=os.getenv("REMOVE_BG_API_KEY"),
        remove_bg_endpoint=os.getenv("REMOVE_BG_ENDPOINT", REMOVE_BG_ENDPOINT),
        remove_bg_timeout_seconds=int(os.getenv("REMOVE_BG_TIMEOUT_SECONDS", "60")),
        remove_bg_max_retries=int(os.getenv("REMOVE_BG_MAX_RETRIES", "2")),
        remove_bg_retry_delay_seconds=float(os.getenv("REMOVE_BG_RETRY_DELAY_SECONDS", "5")),
        remove_bg_request_delay_seconds=float(os.getenv("REMOVE_BG_REQUEST_DELAY_SECONDS", "1.5")),
        temp_dir=TEMP_DIR,
        output_dir=OUTPUT_DIR,
        a6_width_px=a6_width_px,
        a6_height_px=a6_height_px,
        sticker_border_px=int(os.getenv("STICKER_BORDER_PX", "28")),
        sticker_cutline_px=int(os.getenv("STICKER_CUTLINE_PX", "7")),
        sticker_cutline_color=(255, 154, 190, 255),
        max_sticker_width_px=int(os.getenv("MAX_STICKER_WIDTH_PX", "420")),
        max_sticker_height_px=int(os.getenv("MAX_STICKER_HEIGHT_PX", "420")),
        layout_margin_px=int(os.getenv("LAYOUT_MARGIN_PX", "80")),
        layout_gap_px=int(os.getenv("LAYOUT_GAP_PX", "36")),
        max_rotation_degrees=float(os.getenv("MAX_ROTATION_DEGREES", "8")),
    )


def ensure_runtime_dirs(settings: Settings | None = None) -> None:
    """Create local temp/output folders used at runtime."""
    resolved = settings or get_settings()
    resolved.temp_dir.mkdir(parents=True, exist_ok=True)
    resolved.output_dir.mkdir(parents=True, exist_ok=True)
