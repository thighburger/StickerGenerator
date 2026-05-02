# Pet Sticker MVP

Fast Python/Gradio MVP that turns multiple dog photos into one A6 300 DPI sticker sheet PNG.

## What It Does

- Accepts multiple dog photo uploads.
- Sends each image to remove.bg for background removal.
- Preserves the returned dog cutout without generative transformation.
- Adds a white sticker border and subtle pink cutline.
- Places stickers on a white A6 portrait canvas.
- Shows a PNG preview and download link.

## What It Does Not Do

This MVP does not include authentication, database storage, payments, GPU inference, local AI models, SAM2, BiRefNet, inpainting, outpainting, quality scoring, an advanced editor, PDF export, or a queue system.

## Setup

```bash
cd pet-sticker-mvp
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set:

```bash
REMOVE_BG_API_KEY=your_remove_bg_api_key_here
```

The app uses the remove.bg API endpoint documented at https://www.remove.bg/api.

## Run

```bash
python app.py
```

Use `python3` instead of `python` if your system does not provide a `python` command.

Open the local Gradio URL, upload dog photos, generate the sheet, then download the PNG.

## Validation

```bash
python -m compileall .
python app.py
```

The happy path requires a valid `REMOVE_BG_API_KEY`. Without a key, the app still starts and shows a friendly generation error.

## Project Structure

```text
pet-sticker-mvp/
├─ app.py
├─ config.py
├─ requirements.txt
├─ services/
│  ├─ bg_remove.py
│  ├─ sticker.py
│  ├─ layout.py
│  └─ export.py
├─ utils/
│  └─ image_utils.py
├─ docs/
├─ temp/
└─ outputs/
```

## Safety Notes

- Never commit `.env` or API keys.
- `temp/` and `outputs/` are ignored except for `.gitkeep`.
- Generated PNGs, caches, and virtual environments are ignored.
- Background removal is isolated behind `BackgroundRemovalProvider` so the provider can be replaced later.
