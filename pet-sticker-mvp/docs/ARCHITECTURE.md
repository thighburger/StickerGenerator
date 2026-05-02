# Architecture

## Components
- `app.py`: Gradio UI and request pipeline.
- `config.py`: Environment variables and rendering constants.
- `services/bg_remove.py`: Provider interface and remove.bg implementation.
- `services/sticker.py`: White border and pink cutline generation.
- `services/layout.py`: A6 sheet composition with non-overlapping placement.
- `services/export.py`: PNG file output.
- `utils/image_utils.py`: Shared image loading, conversion, and sizing helpers.

## Pipeline
Upload files are passed to the configured background-removal provider. The provider returns transparent PNG cutouts as Pillow images. Each cutout is resized, bordered, and cutlined locally without changing the dog pixels. The layout service places each sticker on an A6 white canvas and returns a preview/export image.

## Provider Boundary
The app depends on the `BackgroundRemovalProvider` protocol instead of calling remove.bg directly from UI or sticker code. Replacing remove.bg later should only require adding another provider class and changing provider construction.

## Rendering Defaults
- A6 portrait: 105 mm by 148 mm.
- Print density: 300 DPI.
- Canvas pixels: 1240 by 1748.
- Output format: PNG.
- Background: white.

## Constraints
The application must not use GPU inference, local AI models, or generative image transformations. It should preserve the dog cutout returned by the external provider as faithfully as possible.

