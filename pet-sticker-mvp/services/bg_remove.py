"""Background removal provider abstractions."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Protocol, runtime_checkable

import requests
from PIL import Image, UnidentifiedImageError

from config import Settings, get_settings


class BackgroundRemovalError(RuntimeError):
    """Raised when an external background-removal request fails."""


class MissingApiKeyError(BackgroundRemovalError):
    """Raised when no remove.bg API key is configured."""


@runtime_checkable
class BackgroundRemovalProvider(Protocol):
    """Interface for replaceable background-removal providers."""

    def remove_background(self, image_path: Path) -> Image.Image:
        """Return an RGBA cutout for the source image."""


class RemoveBgProvider:
    """Background-removal provider backed by the remove.bg API."""

    def __init__(self, api_key: str | None, endpoint: str, timeout_seconds: int) -> None:
        self.api_key = (api_key or "").strip()
        self.endpoint = endpoint
        self.timeout_seconds = timeout_seconds

    def remove_background(self, image_path: Path) -> Image.Image:
        """Call remove.bg and return the transparent PNG response as RGBA."""
        if not self.api_key:
            raise MissingApiKeyError(
                "Missing REMOVE_BG_API_KEY. Add it to .env or export it before generating stickers."
            )

        source_path = Path(image_path)
        if not source_path.exists() or not source_path.is_file():
            raise BackgroundRemovalError(f"Image file does not exist: {source_path}")

        try:
            with source_path.open("rb") as image_file:
                response = requests.post(
                    self.endpoint,
                    headers={"X-Api-Key": self.api_key},
                    files={"image_file": (source_path.name, image_file)},
                    data={"size": "auto", "format": "png"},
                    timeout=self.timeout_seconds,
                )
        except requests.RequestException as exc:
            raise BackgroundRemovalError(f"remove.bg request failed: {exc}") from exc

        if response.status_code != requests.codes.ok:
            detail = response.text.strip()[:500] or response.reason
            raise BackgroundRemovalError(
                f"remove.bg returned HTTP {response.status_code}: {detail}"
            )

        try:
            return Image.open(BytesIO(response.content)).convert("RGBA")
        except UnidentifiedImageError as exc:
            raise BackgroundRemovalError("remove.bg response was not a valid image.") from exc


def build_background_removal_provider(
    settings: Settings | None = None,
) -> BackgroundRemovalProvider:
    """Build the configured background-removal provider."""
    resolved = settings or get_settings()
    return RemoveBgProvider(
        api_key=resolved.remove_bg_api_key,
        endpoint=resolved.remove_bg_endpoint,
        timeout_seconds=resolved.remove_bg_timeout_seconds,
    )
