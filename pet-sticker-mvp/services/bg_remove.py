"""Background removal provider abstractions."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from time import sleep
from typing import Protocol, runtime_checkable

import requests
from PIL import Image, UnidentifiedImageError

from config import Settings, get_settings
from utils.image_utils import validate_image_path


class BackgroundRemovalError(RuntimeError):
    """Raised when an external background-removal request fails."""


class MissingApiKeyError(BackgroundRemovalError):
    """Raised when no remove.bg API key is configured."""


class RateLimitError(BackgroundRemovalError):
    """Raised when remove.bg rejects requests due to rate limiting."""


@runtime_checkable
class BackgroundRemovalProvider(Protocol):
    """Interface for replaceable background-removal providers."""

    def remove_background(self, image_path: Path) -> Image.Image:
        """Return an RGBA cutout for the source image."""


class RemoveBgProvider:
    """Background-removal provider backed by the remove.bg API."""

    def __init__(
        self,
        api_key: str | None,
        endpoint: str,
        timeout_seconds: int,
        max_retries: int = 2,
        retry_delay_seconds: float = 5.0,
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.endpoint = endpoint
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, max_retries)
        self.retry_delay_seconds = max(0.0, retry_delay_seconds)

    def remove_background(self, image_path: Path) -> Image.Image:
        """Call remove.bg and return the transparent PNG response as RGBA."""
        if not self.api_key:
            raise MissingApiKeyError(
                "Missing REMOVE_BG_API_KEY. Add it to .env or export it before generating stickers."
            )

        source_path = validate_image_path(Path(image_path))

        response = self._post_with_retries(source_path)

        if response.status_code != requests.codes.ok:
            detail = response.text.strip()[:500] or response.reason
            if response.status_code == 429:
                raise RateLimitError(
                    "remove.bg rate limit exceeded. Wait a bit, upload fewer images, "
                    "or check your remove.bg plan/credits."
                )
            raise BackgroundRemovalError(
                f"remove.bg returned HTTP {response.status_code}: {detail}"
            )

        try:
            return Image.open(BytesIO(response.content)).convert("RGBA")
        except UnidentifiedImageError as exc:
            raise BackgroundRemovalError("remove.bg response was not a valid image.") from exc

    def _post_with_retries(self, source_path: Path) -> requests.Response:
        """Post an image to remove.bg, retrying short-lived 429 responses."""
        last_response: requests.Response | None = None
        for attempt in range(self.max_retries + 1):
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

            if response.status_code != 429 or attempt >= self.max_retries:
                return response

            last_response = response
            sleep(self._retry_delay(response, attempt))

        if last_response is None:
            raise BackgroundRemovalError("remove.bg request did not return a response.")
        return last_response

    def _retry_delay(self, response: requests.Response, attempt: int) -> float:
        """Choose retry delay using Retry-After when available."""
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                pass
        return self.retry_delay_seconds * (attempt + 1)


def build_background_removal_provider(
    settings: Settings | None = None,
) -> BackgroundRemovalProvider:
    """Build the configured background-removal provider."""
    resolved = settings or get_settings()
    return RemoveBgProvider(
        api_key=resolved.remove_bg_api_key,
        endpoint=resolved.remove_bg_endpoint,
        timeout_seconds=resolved.remove_bg_timeout_seconds,
        max_retries=resolved.remove_bg_max_retries,
        retry_delay_seconds=resolved.remove_bg_retry_delay_seconds,
    )
