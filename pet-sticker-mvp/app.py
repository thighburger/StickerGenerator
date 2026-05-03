"""Gradio entrypoint for the pet sticker sheet MVP."""

from __future__ import annotations

from itertools import cycle, islice
from pathlib import Path
from time import sleep

import gradio as gr
from PIL import Image

from config import ensure_runtime_dirs, get_settings
from services.bg_remove import (
    BackgroundRemovalError,
    MissingApiKeyError,
    RateLimitError,
    build_background_removal_provider,
)
from services.export import export_png
from services.layout import LayoutError, compose_a6_sheet
from services.sticker import create_sticker
from utils.image_utils import ImageValidationError, validate_image_path


UploadedFile = str | Path | dict | object


class PipelineError(RuntimeError):
    """Raised when the sticker sheet pipeline cannot complete."""


def _coerce_uploaded_path(file: UploadedFile) -> Path:
    """Convert Gradio upload values into a local filesystem path."""
    if isinstance(file, (str, Path)):
        return Path(file)

    if isinstance(file, dict):
        for key in ("path", "name"):
            value = file.get(key)
            if value:
                return Path(value)

    for attr in ("path", "name"):
        value = getattr(file, attr, None)
        if value:
            return Path(value)

    raise ImageValidationError("Could not read one uploaded file path.")


def _collect_uploaded_paths(
    files: list[UploadedFile] | UploadedFile | None,
    max_upload_images: int,
) -> list[Path]:
    """Normalize Gradio file input into validated paths."""
    if not files:
        raise ImageValidationError("Upload at least one dog photo.")

    file_items = list(files) if isinstance(files, (list, tuple)) else [files]
    if len(file_items) > max_upload_images:
        raise ImageValidationError(f"Upload up to {max_upload_images} images.")

    return [validate_image_path(_coerce_uploaded_path(file)) for file in file_items]


def _repeat_stickers_for_sheet(
    stickers: list[Image.Image],
    stickers_per_sheet: int,
) -> list[Image.Image]:
    """Repeat uploaded sticker assets until the sheet has the target count."""
    if not stickers:
        raise PipelineError("No stickers were generated.")
    if stickers_per_sheet <= 0:
        raise PipelineError("STICKERS_PER_SHEET must be greater than zero.")

    return [sticker.copy() for sticker in islice(cycle(stickers), stickers_per_sheet)]


def generate_sticker_sheet(files: list[UploadedFile] | UploadedFile | None) -> tuple[Image.Image, str]:
    """Generate a sticker sheet preview and downloadable PNG path."""
    settings = get_settings()
    ensure_runtime_dirs(settings)
    if not (settings.remove_bg_api_key or "").strip():
        raise MissingApiKeyError(
            "Missing REMOVE_BG_API_KEY. Add it to .env or export it before generating stickers."
        )

    provider = build_background_removal_provider(settings)
    image_paths = _collect_uploaded_paths(files, settings.max_upload_images)

    stickers: list[Image.Image] = []
    for index, image_path in enumerate(image_paths, start=1):
        try:
            if index > 1 and settings.remove_bg_request_delay_seconds > 0:
                sleep(settings.remove_bg_request_delay_seconds)
            cutout = provider.remove_background(image_path)
            stickers.append(create_sticker(cutout, settings=settings))
        except RateLimitError as exc:
            raise PipelineError(
                f"Image {index} ({image_path.name}) failed: {exc}"
            ) from exc
        except (BackgroundRemovalError, ImageValidationError) as exc:
            raise PipelineError(f"Image {index} ({image_path.name}) failed: {exc}") from exc

    sheet_stickers = _repeat_stickers_for_sheet(stickers, settings.stickers_per_sheet)
    sheet = compose_a6_sheet(sheet_stickers, settings=settings)
    output_path = export_png(sheet, settings.output_dir)
    return sheet, str(output_path)


def _generate_for_ui(files: list[str | Path] | None) -> tuple[Image.Image | None, str | None, str]:
    """Gradio wrapper that keeps UI errors readable."""
    try:
        preview, output_path = generate_sticker_sheet(files or [])
    except MissingApiKeyError as exc:
        raise gr.Error(str(exc)) from exc
    except (ImageValidationError, BackgroundRemovalError, LayoutError, PipelineError) as exc:
        raise gr.Error(str(exc)) from exc
    except gr.Error:
        raise
    except Exception as exc:
        raise gr.Error(f"Could not generate sticker sheet: {exc}") from exc

    return preview, output_path, "Sticker sheet ready."


def build_app() -> gr.Blocks:
    """Build the Gradio interface."""
    with gr.Blocks(title="Pet Sticker Sheet Generator") as demo:
        gr.Markdown("# Pet Sticker Sheet Generator")

        with gr.Row():
            files = gr.File(
                label="Dog photos (up to 5)",
                file_count="multiple",
                file_types=["image"],
                type="filepath",
            )
            with gr.Column():
                generate_button = gr.Button("Generate sticker sheet", variant="primary")
                status = gr.Textbox(label="Status", interactive=False)

        preview = gr.Image(label="PNG preview", type="pil")
        download = gr.File(label="Download final PNG")

        generate_button.click(
            fn=_generate_for_ui,
            inputs=[files],
            outputs=[preview, download, status],
        )

    return demo

def main() -> None:
    """Start the application."""
    ensure_runtime_dirs(get_settings())
    build_app().launch()


if __name__ == "__main__":
    main()
