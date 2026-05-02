# API Contract

## Background Removal

```python
class BackgroundRemovalProvider(Protocol):
    def remove_background(self, image_path: Path) -> Image.Image:
        ...
```

Implementations return an RGBA Pillow image with transparency preserved.

## Sticker Generation

```python
create_sticker(cutout: Image.Image, *, border_px: int, cutline_px: int) -> Image.Image
```

Returns an RGBA sticker asset containing the original cutout pixels, white border, and pink cutline.

## Layout

```python
compose_a6_sheet(stickers: list[Image.Image]) -> Image.Image
```

Returns an RGB A6 300 DPI Pillow image with stickers placed without overlap.

## Export

```python
export_png(sheet: Image.Image, output_dir: Path) -> Path
```

Writes a PNG file and returns the output path.

## UI Pipeline

```python
generate_sticker_sheet(files) -> tuple[Image.Image | None, str | None]
```

Returns a preview image and downloadable file path for Gradio.

