"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const MAX_UPLOADS = 5;
const STICKERS_PER_SHEET = 10;
const A6_WIDTH = 1240;
const A6_HEIGHT = 1748;
const BORDER_PX = 28;
const SHEET_MARGIN = 24;
const STICKER_GAP = 8;
const ROTATION_DEGREES = [-10, 7, -5, 9, -7, 5, -8, 8, -6, 10];
const LAYOUT_SCALES = [
  2.2, 2.08, 1.96, 1.84, 1.72, 1.6, 1.48, 1.36, 1.24, 1.12, 1.0, 0.9, 0.8, 0.7,
];
const MAX_IMAGE_SCALE = 2.6;

type Cutout = {
  url: string;
  name: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load generated cutout."));
    image.src = src;
  });
}

type DrawableImage = HTMLImageElement | HTMLCanvasElement;

function trimTransparentPadding(image: HTMLImageElement) {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return image;

  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
  let left = source.width;
  let right = 0;
  let top = source.height;
  let bottom = 0;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const alpha = pixels.data[(y * source.width + x) * 4 + 3];
      if (alpha > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right <= left || bottom <= top) return image;

  const trimmed = document.createElement("canvas");
  trimmed.width = right - left + 1;
  trimmed.height = bottom - top + 1;
  const trimmedContext = trimmed.getContext("2d");
  if (!trimmedContext) return image;
  trimmedContext.drawImage(
    source,
    left,
    top,
    trimmed.width,
    trimmed.height,
    0,
    0,
    trimmed.width,
    trimmed.height,
  );
  return trimmed;
}

function drawSilhouette(
  context: CanvasRenderingContext2D,
  image: DrawableImage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  const layer = document.createElement("canvas");
  layer.width = context.canvas.width;
  layer.height = context.canvas.height;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;

  const steps = Math.max(24, radius * 4);
  for (let index = 0; index < steps; index += 1) {
    const angle = (Math.PI * 2 * index) / steps;
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;
    layerContext.drawImage(image, x + offsetX, y + offsetY, width, height);
  }

  layerContext.globalCompositeOperation = "source-in";
  layerContext.fillStyle = color;
  layerContext.fillRect(0, 0, A6_WIDTH, A6_HEIGHT);
  context.drawImage(layer, 0, 0);
}

function createStickerCanvas(image: DrawableImage, width: number, height: number) {
  const padding = BORDER_PX + 8;
  const sticker = document.createElement("canvas");
  sticker.width = Math.ceil(width + padding * 2);
  sticker.height = Math.ceil(height + padding * 2);
  const context = sticker.getContext("2d");
  if (!context) return sticker;

  drawSilhouette(context, image, padding, padding, width, height, BORDER_PX, "#ffffff");
  context.drawImage(image, padding, padding, width, height);

  return sticker;
}

function repeatedCutouts(cutouts: Cutout[]) {
  return Array.from({ length: STICKERS_PER_SHEET }, (_, index) => {
    return cutouts[index % cutouts.length];
  });
}

type StickerAsset = {
  canvas: HTMLCanvasElement;
  angle: number;
  width: number;
  height: number;
};

type PlacedSticker = StickerAsset & {
  x: number;
  y: number;
};

function rotatedBounds(width: number, height: number, angle: number) {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function overlaps(a: PlacedSticker, b: PlacedSticker) {
  return !(
    a.x + a.width + STICKER_GAP <= b.x ||
    b.x + b.width + STICKER_GAP <= a.x ||
    a.y + a.height + STICKER_GAP <= b.y ||
    b.y + b.height + STICKER_GAP <= a.y
  );
}

function candidateScore(candidate: PlacedSticker, placed: PlacedSticker[]) {
  const edgeDistance = Math.min(
    candidate.x - SHEET_MARGIN,
    candidate.y - SHEET_MARGIN,
    A6_WIDTH - SHEET_MARGIN - (candidate.x + candidate.width),
    A6_HEIGHT - SHEET_MARGIN - (candidate.y + candidate.height),
  );

  if (placed.length === 0) {
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    return Math.hypot(centerX - A6_WIDTH / 2, centerY - A6_HEIGHT / 2) - edgeDistance * 0.18;
  }

  const nearest = Math.min(
    ...placed.map((sticker) => {
      const dx =
        Math.max(sticker.x, candidate.x) -
        Math.min(sticker.x + sticker.width, candidate.x + candidate.width);
      const dy =
        Math.max(sticker.y, candidate.y) -
        Math.min(sticker.y + sticker.height, candidate.y + candidate.height);
      return Math.hypot(Math.max(0, dx), Math.max(0, dy));
    }),
  );
  const centerX = candidate.x + candidate.width / 2;
  const centerY = candidate.y + candidate.height / 2;
  const centerDistance = Math.hypot(centerX - A6_WIDTH / 2, centerY - A6_HEIGHT / 2);
  return nearest + centerDistance * 0.05 - edgeDistance * 0.16;
}

function createCandidatePositions(asset: StickerAsset) {
  const maxX = A6_WIDTH - SHEET_MARGIN - asset.width;
  const maxY = A6_HEIGHT - SHEET_MARGIN - asset.height;
  const usableWidth = Math.max(1, maxX - SHEET_MARGIN);
  const usableHeight = Math.max(1, maxY - SHEET_MARGIN);
  const positions: Array<{ x: number; y: number }> = [];

  const step = 22;
  for (let y = SHEET_MARGIN; y <= maxY; y += step) {
    for (let x = SHEET_MARGIN; x <= maxX; x += step) {
      positions.push({ x, y });
    }
  }

  positions.push({
    x: SHEET_MARGIN + usableWidth / 2,
    y: SHEET_MARGIN + usableHeight / 2,
  });

  return positions;
}

function packStickers(assets: StickerAsset[], orderOffset: number) {
  const placed: PlacedSticker[] = [];
  const orderedAssets = [...assets].sort((a, b) => b.width * b.height - a.width * a.height);
  const rotatedAssets = [
    ...orderedAssets.slice(orderOffset % orderedAssets.length),
    ...orderedAssets.slice(0, orderOffset % orderedAssets.length),
  ];

  for (const asset of rotatedAssets) {
    let best: PlacedSticker | null = null;
    for (const position of createCandidatePositions(asset)) {
      const candidate = { ...asset, x: position.x, y: position.y };
      if (placed.some((sticker) => overlaps(candidate, sticker))) continue;
      if (!best || candidateScore(candidate, placed) < candidateScore(best, placed)) {
        best = candidate;
      }
    }

    if (best) {
      placed.push(best);
    }
  }

  return placed;
}

async function createStickerAssets(cutouts: Cutout[], layoutScale: number) {
  const assets: StickerAsset[] = [];
  const stickers = repeatedCutouts(cutouts);
  const targetArea = ((A6_WIDTH - SHEET_MARGIN * 2) * (A6_HEIGHT - SHEET_MARGIN * 2)) / 10;

  for (let index = 0; index < stickers.length; index += 1) {
    const cutout = stickers[index];
    const image = trimTransparentPadding(await loadImage(cutout.url));
    const angle = ROTATION_DEGREES[index % ROTATION_DEGREES.length] * (Math.PI / 180);
    const imageArea = image.width * image.height;
    const scale = Math.min(Math.sqrt(targetArea / imageArea) * layoutScale, MAX_IMAGE_SCALE);
    const width = image.width * Math.max(0.1, scale);
    const height = image.height * Math.max(0.1, scale);
    const stickerCanvas = createStickerCanvas(image, width, height);
    const bounds = rotatedBounds(stickerCanvas.width, stickerCanvas.height, angle);
    assets.push({
      canvas: stickerCanvas,
      angle,
      width: bounds.width,
      height: bounds.height,
    });
  }

  return assets;
}

async function drawSheet(canvas: HTMLCanvasElement, cutouts: Cutout[]) {
  const context = canvas.getContext("2d");
  if (!context || cutouts.length === 0) return;

  canvas.width = A6_WIDTH;
  canvas.height = A6_HEIGHT;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, A6_WIDTH, A6_HEIGHT);

  let placed: PlacedSticker[] = [];
  let bestCoverage = 0;
  for (const layoutScale of LAYOUT_SCALES) {
    const assets = await createStickerAssets(cutouts, layoutScale);
    const candidates = assets.map((_, offset) => packStickers(assets, offset));
    const bestForScale = candidates.sort(
      (a, b) =>
        b.length - a.length ||
        b.reduce((sum, sticker) => sum + sticker.width * sticker.height, 0) -
          a.reduce((sum, sticker) => sum + sticker.width * sticker.height, 0),
    )[0];
    const coverage = bestForScale.reduce((sum, sticker) => sum + sticker.width * sticker.height, 0);
    if (
      bestForScale.length > placed.length ||
      (bestForScale.length === placed.length && coverage > bestCoverage)
    ) {
      placed = bestForScale;
      bestCoverage = coverage;
    }
  }

  for (const sticker of placed) {
    context.save();
    context.translate(sticker.x + sticker.width / 2, sticker.y + sticker.height / 2);
    context.rotate(sticker.angle);
    context.drawImage(sticker.canvas, -sticker.canvas.width / 2, -sticker.canvas.height / 2);
    context.restore();
  }
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [cutouts, setCutouts] = useState<Cutout[]>([]);
  const [status, setStatus] = useState("Upload up to 5 dog photos.");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  function applyFiles(nextFiles: File[]) {
    const imageFiles = nextFiles.filter((file) => file.type.startsWith("image/"));
    const selected = imageFiles.slice(0, MAX_UPLOADS);
    setFiles(selected);
    setCutouts([]);
    setError(imageFiles.length === 0 ? "Drop or choose image files." : "");
    setStatus(
      selected.length
        ? `${selected.length} image(s) selected.`
        : "Upload up to 5 dog photos.",
    );
  }

  function handleTestFiles(event: ChangeEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_UPLOADS);
    setTestFiles(imageFiles);
    setCutouts([]);
    setError("");
    setStatus(
      imageFiles.length
        ? `${imageFiles.length} transparent test image(s) selected.`
        : "Upload up to 5 dog photos.",
    );
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    applyFiles(Array.from(event.target.files ?? []));
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    applyFiles(Array.from(event.dataTransfer.files));
  }

  async function removeBackground(file: File) {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/remove-bg", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? `Background removal failed for ${file.name}.`);
    }

    const blob = await response.blob();
    return {
      name: file.name,
      url: URL.createObjectURL(blob),
    };
  }

  async function generate() {
    if (files.length === 0) {
      setError("Upload at least one image.");
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      setStatus(`Removing backgrounds 1-${files.length}/${files.length}...`);
      const nextCutouts = await Promise.all(files.map((file) => removeBackground(file)));

      setStatus("Drawing 10 stickers...");
      setCutouts(nextCutouts);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      await drawSheet(canvas, nextCutouts);
      setStatus("Sticker sheet ready.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not generate sticker sheet.";
      setError(message);
      setStatus("Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateFromTransparentImages() {
    if (testFiles.length === 0) {
      setError("Choose at least one transparent PNG test image.");
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const nextCutouts = testFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }));
      setStatus("Drawing 10 stickers from transparent test images...");
      setCutouts(nextCutouts);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      await drawSheet(canvas, nextCutouts);
      setStatus("Test sticker sheet ready.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not generate test sticker sheet.";
      setError(message);
      setStatus("Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || cutouts.length === 0) return;

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "pet-sticker-sheet-a6.png";
    link.click();
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Pet Sticker Sheet</h1>
          <p className={styles.subtitle}>Upload dog photos, remove backgrounds, and make one A6 page with 10 stickers.</p>

          <label
            className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className={styles.dropTitle}>Drop images here</span>
            <span className={styles.dropHint}>or choose files from your computer</span>
            <input
              className={styles.fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFiles}
            />
          </label>

          <div className={styles.meta}>Maximum {MAX_UPLOADS} images. The uploaded dogs repeat until the sheet has {STICKERS_PER_SHEET} stickers.</div>

          {previewUrls.length > 0 && (
            <div className={styles.thumbs}>
              {previewUrls.map((url, index) => (
                <div className={styles.thumb} key={`${url}-${index}`}>
                  <img src={url} alt={`Upload ${index + 1}`} />
                </div>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.primary} disabled={isGenerating || files.length === 0} onClick={generate}>
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            <button className={styles.secondary} disabled={cutouts.length === 0} onClick={download}>
              Download PNG
            </button>
          </div>

          <div className={`${styles.status} ${error ? styles.error : ""}`}>{error || status}</div>

          <div className={styles.testPanel}>
            <div className={styles.testTitle}>Test with transparent PNGs</div>
            <input
              className={styles.fileInput}
              type="file"
              accept="image/png,image/webp"
              multiple
              onChange={handleTestFiles}
            />
            <button
              className={styles.secondary}
              disabled={isGenerating || testFiles.length === 0}
              onClick={generateFromTransparentImages}
            >
              Generate test sheet
            </button>
          </div>
        </section>

        <section className={styles.previewArea}>
          <div className={styles.previewFrame}>
            {cutouts.length === 0 && <div className={styles.empty}>Preview appears here after generation.</div>}
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              style={{ display: cutouts.length === 0 ? "none" : "block" }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
