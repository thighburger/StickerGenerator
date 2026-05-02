# Pet Sticker Next MVP

Next.js MVP for removing dog photo backgrounds with remove.bg and generating one A6 PNG sticker sheet in the browser.

## Flow

1. Upload up to 5 images.
2. Server API route calls remove.bg for each image.
3. Browser repeats the returned cutouts until the sheet has 10 stickers.
4. Browser draws white sticker borders, rotation, and A6 layout on Canvas.
5. User previews and downloads the final PNG.

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

If Next dev reports a missing `.next/server` chunk, restart with a clean cache:

```bash
npm run dev:clean
```

## Deploy

Deploy `pet-sticker-next/` as the Vercel project root and set `REMOVE_BG_API_KEY` in Vercel environment variables.
