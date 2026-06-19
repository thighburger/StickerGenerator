# Pet Sticker Next MVP

Next.js MVP for removing dog photo backgrounds with remove.bg and generating one A6 PNG sticker sheet in the browser.

## Flow

1. Upload up to 5 images.
2. Server API route calls remove.bg for each image.
3. Browser repeats the returned cutouts until the sheet has 10 stickers.
4. Browser draws white sticker borders, rotation, and A6 layout on Canvas.
5. The ML quality model scores the generated sheet and stores prediction/feedback logs.
6. User previews and downloads the final PNG.

## Setup

```bash
npm install
cp .env.example .env.local
```

Add your remove.bg key:

```env
REMOVE_BG_API_KEY=...
```

## Run

```bash
npm run dev
```

Open http://localhost:3000.

The dev script clears the local `.next` cache before starting. If Next dev still reports a missing `.next/server` chunk, stop the server and restart:

```bash
npm run dev
```

## Deploy

Deploy `pet-sticker-next/` as the Vercel project root and set `REMOVE_BG_API_KEY` in Vercel environment variables.

Note: local order file storage under `orders/` is for local MVP testing only. Use external storage such as Supabase Storage for production order files on Vercel.

## ML quality model

The app reads the current champion model from:

```text
lib/ml/sticker-quality-model.json
```

Local prediction logs are written to `logs/quality-predictions.csv` and feedback logs are written to `logs/quality-feedback.csv`. On Vercel, the default log path is `/tmp/pet-sticker-quality-logs`.

Retrain the model from the repository root:

```bash
python -m pip install -r pet-sticker-ml/requirements.txt
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.train
```

Rollback to a known registry version:

```bash
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.rollback --version 2026-06-19-bootstrap
```
