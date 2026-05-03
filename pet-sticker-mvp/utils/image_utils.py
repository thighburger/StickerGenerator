"""Shared image utility helpers."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from config import SUPPORTED_IMAGE_EXTENSIONS


class ImageValidationError(ValueError):
    """Raised when an uploaded image cannot be processed."""


def validate_image_path(image_path: Path) -> Path:
    """Validate that a path points to a supported image file."""
    resolved = Path(image_path)
    if not resolved.exists() or not resolved.is_file():
        raise ImageValidationError(f"Image file does not exist: {resolved}")

    if resolved.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_IMAGE_EXTENSIONS))
        raise ImageValidationError(
            f"Unsupported image type '{resolved.suffix}'. Supported types: {supported}."
        )

    return resolved


def load_image(image_path: Path) -> Image.Image:
    """Load an image with EXIF orientation applied."""
    resolved = validate_image_path(image_path)
    try:
        with Image.open(resolved) as image:
            return ImageOps.exif_transpose(image).convert("RGBA")
    except UnidentifiedImageError as exc:
        raise ImageValidationError(f"Could not read image: {resolved.name}") from exc


def ensure_rgba(image: Image.Image) -> Image.Image:
    """Return an RGBA copy of an image."""
    return image.convert("RGBA")


def trim_transparent_padding(image: Image.Image) -> Image.Image:
    """Crop transparent padding from an RGBA image."""
    rgba = ensure_rgba(image)
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        return rgba
    return rgba.crop(bbox)


def resize_to_fit(
    image: Image.Image,
    max_width_px: int,
    max_height_px: int,
) -> Image.Image:
    """Resize an image in-place proportion while fitting within max bounds."""
    resized = ensure_rgba(image).copy()
    resized.thumbnail((max_width_px, max_height_px), Image.Resampling.LANCZOS)
    return resized
