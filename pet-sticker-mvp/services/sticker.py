"""Sticker border and cutline helpers."""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

from config import Settings, get_settings
from utils.image_utils import ensure_rgba, resize_to_fit, trim_transparent_padding

WHITE = (255, 255, 255, 255)


def _dilate_alpha(alpha: np.ndarray, radius_px: int) -> np.ndarray:
    """Expand an alpha mask by a radius using an elliptical kernel."""
    if radius_px <= 0:
        return alpha

    kernel_size = (radius_px * 2) + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    return cv2.dilate(alpha, kernel, iterations=1)


def _solid_layer_from_alpha(
    alpha: np.ndarray,
    color: tuple[int, int, int, int],
) -> Image.Image:
    """Create a solid RGBA layer using an alpha mask."""
    layer = np.zeros((alpha.shape[0], alpha.shape[1], 4), dtype=np.uint8)
    layer[:, :, 0] = color[0]
    layer[:, :, 1] = color[1]
    layer[:, :, 2] = color[2]
    layer[:, :, 3] = np.minimum(alpha, color[3]).astype(np.uint8)
    return Image.fromarray(layer, mode="RGBA")


def create_sticker(
    cutout: Image.Image,
    *,
    border_px: int | None = None,
    cutline_px: int | None = None,
    cutline_color: tuple[int, int, int, int] | None = None,
    max_width_px: int | None = None,
    max_height_px: int | None = None,
    settings: Settings | None = None,
) -> Image.Image:
    """Create a transparent sticker asset with border and cutline."""
    resolved = settings or get_settings()
    border = border_px if border_px is not None else resolved.sticker_border_px
    cutline = cutline_px if cutline_px is not None else resolved.sticker_cutline_px
    color = cutline_color or resolved.sticker_cutline_color
    max_width = max_width_px or resolved.max_sticker_width_px
    max_height = max_height_px or resolved.max_sticker_height_px

    dog = resize_to_fit(trim_transparent_padding(ensure_rgba(cutout)), max_width, max_height)
    padding = border + cutline + 4
    base = Image.new("RGBA", (dog.width + padding * 2, dog.height + padding * 2), (0, 0, 0, 0))
    base.alpha_composite(dog, (padding, padding))

    alpha = np.array(base.getchannel("A"))
    border_alpha = _dilate_alpha(alpha, border)
    cutline_alpha = _dilate_alpha(alpha, border + cutline)

    sticker = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sticker.alpha_composite(_solid_layer_from_alpha(cutline_alpha, color))
    sticker.alpha_composite(_solid_layer_from_alpha(border_alpha, WHITE))
    sticker.alpha_composite(base)

    return trim_transparent_padding(sticker)
