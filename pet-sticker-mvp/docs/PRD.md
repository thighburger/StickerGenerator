# Product Requirements

## Goal
Create a fast MVP that lets a user upload multiple dog photos and download one A6 sticker sheet PNG.

## Users
Dog owners, small pet shops, and creators who want a quick printable sticker sheet preview.

## Core Flow
1. User uploads multiple dog photos.
2. App removes the background for each image through remove.bg.
3. App generates transparent dog cutouts.
4. App adds a white sticker border and subtle pink cutline.
5. App places stickers on a white A6 300 DPI canvas.
6. App shows a preview and download link.

## MVP Must Haves
- Multi-image upload.
- External background-removal API integration.
- Replaceable background-removal provider abstraction.
- Transparent PNG support.
- White sticker border and pink cutline.
- A6 300 DPI PNG export.
- Automatic non-overlapping layout.
- Slight random rotation.
- Gradio preview and download.

## Out Of Scope
Authentication, database, payments, GPU inference, local background-removal models, SAM2, BiRefNet, inpainting, outpainting, quality scoring, advanced editing, PDF export, and queueing.

## Success Criteria
- The app starts locally with `python app.py`.
- With `REMOVE_BG_API_KEY` set, a user can upload dog photos and download a composed PNG.
- With no API key, the app starts and reports a helpful generation error.

