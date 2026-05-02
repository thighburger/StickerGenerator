"""Gradio entrypoint for the pet sticker sheet MVP."""

from __future__ import annotations

from pathlib import Path

import gradio as gr
from PIL import Image

from config import ensure_runtime_dirs, get_settings
from services.bg_remove import build_background_removal_provider
from services.export import export_png
from services.layout import compose_a6_sheet
from services.sticker import create_sticker


def generate_sticker_sheet(files: list[str | Path]) -> tuple[Image.Image | None, str | None]:
    """Generate a sticker sheet preview and downloadable PNG path."""
    if not files:
        raise gr.Error("Upload at least one dog photo.")

    settings = get_settings()
    ensure_runtime_dirs(settings)
    provider = build_background_removal_provider(settings)

    stickers: list[Image.Image] = []
    for file_path in files:
        cutout = provider.remove_background(Path(file_path))
        stickers.append(create_sticker(cutout, settings=settings))

    sheet = compose_a6_sheet(stickers, settings=settings)
    output_path = export_png(sheet, settings.output_dir)
    return sheet, str(output_path)


def _generate_for_ui(files: list[str | Path] | None) -> tuple[Image.Image | None, str | None, str]:
    """Gradio wrapper that keeps UI errors readable."""
    try:
        preview, output_path = generate_sticker_sheet(files or [])
    except gr.Error:
        raise
    except Exception as exc:
        raise gr.Error(str(exc)) from exc

    return preview, output_path, "Sticker sheet ready."


def build_app() -> gr.Blocks:
    """Build the Gradio interface."""
    with gr.Blocks(title="Pet Sticker Sheet Generator") as demo:
        gr.Markdown("# Pet Sticker Sheet Generator")

        with gr.Row():
            files = gr.File(
                label="Dog photos",
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
