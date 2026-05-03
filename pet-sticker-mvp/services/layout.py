"""Sticker sheet layout helpers."""

from __future__ import annotations

import math
import random

from PIL import Image

from config import Settings, get_settings
from utils.image_utils import ensure_rgba


class LayoutError(ValueError):
    """Raised when a sticker sheet cannot be composed."""


def _choose_grid(
    sticker_count: int,
    canvas_width: int,
    canvas_height: int,
    margin_px: int,
    gap_px: int,
) -> tuple[int, int, int, int]:
    """Choose rows/columns and cell size for a simple non-overlapping grid."""
    best: tuple[float, int, int, int, int] | None = None

    for columns in range(1, sticker_count + 1):
        rows = math.ceil(sticker_count / columns)
        available_width = canvas_width - (margin_px * 2) - (gap_px * (columns - 1))
        available_height = canvas_height - (margin_px * 2) - (gap_px * (rows - 1))

        if available_width <= 0 or available_height <= 0:
            continue

        cell_width = available_width // columns
        cell_height = available_height // rows
        if cell_width <= 0 or cell_height <= 0:
            continue

        fill_penalty = (rows * columns) - sticker_count
        score = min(cell_width, cell_height) - (fill_penalty * 5)
        if best is None or score > best[0]:
            best = (score, rows, columns, cell_width, cell_height)

    if best is None:
        raise LayoutError("Could not find a layout for the uploaded stickers.")

    _, rows, columns, cell_width, cell_height = best
    return rows, columns, cell_width, cell_height


def _fit_for_cell(sticker: Image.Image, cell_width: int, cell_height: int) -> Image.Image:
    """Resize a sticker to fit inside a layout cell."""
    fitted = ensure_rgba(sticker).copy()
    max_size = (max(1, int(cell_width * 0.86)), max(1, int(cell_height * 0.86)))
    fitted.thumbnail(max_size, Image.Resampling.LANCZOS)
    return fitted


def compose_a6_sheet(
    stickers: list[Image.Image],
    *,
    settings: Settings | None = None,
    seed: int | None = None,
) -> Image.Image:
    """Compose stickers onto a white A6 300 DPI canvas."""
    if not stickers:
        raise LayoutError("Upload at least one image to create a sticker sheet.")

    resolved = settings or get_settings()
    canvas_width = resolved.a6_width_px
    canvas_height = resolved.a6_height_px
    canvas = Image.new("RGBA", (canvas_width, canvas_height), (255, 255, 255, 255))

    rows, columns, cell_width, cell_height = _choose_grid(
        len(stickers),
        canvas_width,
        canvas_height,
        resolved.layout_margin_px,
        resolved.layout_gap_px,
    )

    rng = random.Random(seed)
    for index, sticker in enumerate(stickers):
        row = index // columns
        column = index % columns
        cell_x = resolved.layout_margin_px + column * (cell_width + resolved.layout_gap_px)
        cell_y = resolved.layout_margin_px + row * (cell_height + resolved.layout_gap_px)

        fitted = _fit_for_cell(sticker, cell_width, cell_height)
        angle = rng.uniform(-resolved.max_rotation_degrees, resolved.max_rotation_degrees)
        rotated = fitted.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            expand=True,
            fillcolor=(0, 0, 0, 0),
        )
        rotated.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)

        paste_x = cell_x + ((cell_width - rotated.width) // 2)
        paste_y = cell_y + ((cell_height - rotated.height) // 2)
        canvas.alpha_composite(rotated, (paste_x, paste_y))

    return canvas.convert("RGB")
