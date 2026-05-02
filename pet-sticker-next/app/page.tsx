"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const MAX_UPLOADS = 5;
const STICKERS_PER_SHEET = 10;
const A6_WIDTH = 1240;
const A6_HEIGHT = 1748;
const BORDER_PX = 12;
const SAFE_MARGIN_PX = 64;
const PACK_CELL_PX = 8;
const MASK_GAP_CELLS = 1;
const CONTENT_WIDTH = A6_WIDTH - SAFE_MARGIN_PX * 2;
const CONTENT_HEIGHT = A6_HEIGHT - SAFE_MARGIN_PX * 2;
const BASE_STICKER_AREA = (CONTENT_WIDTH * CONTENT_HEIGHT) / 8.25;
const PACK_SCALES = [1.2, 1.12, 1.04, 0.98, 0.92, 0.86, 0.8, 0.74];
const PACK_ANCHORS = [
  { x: 232, y: 188, rotation: -7, weight: 1.18 },
  { x: 622, y: 166, rotation: 10, weight: 1 },
  { x: 984, y: 194, rotation: 4, weight: 1.1 },
  { x: 318, y: 500, rotation: -82, weight: 1.22 },
  { x: 842, y: 522, rotation: 66, weight: 1.2 },
  { x: 230, y: 850, rotation: -4, weight: 1.18 },
  { x: 618, y: 862, rotation: 180, weight: 1 },
  { x: 1000, y: 850, rotation: 5, weight: 1.12 },
  { x: 330, y: 1336, rotation: -3, weight: 1.35 },
  { x: 876, y: 1342, rotation: -172, weight: 1.35 },
];

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
  const padding = BORDER_PX + 4;
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
  mask: StickerMask;
  x: number;
  y: number;
  anchorIndex: number;
};

type StickerMask = {
  widthCells: number;
  heightCells: number;
  points: Array<[number, number]>;
};

type UnplacedSticker = {
  canvas: HTMLCanvasElement;
  mask: StickerMask;
  anchorIndex: number;
  anchorX: number;
  anchorY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function targetSizeForImage(image: DrawableImage, area: number) {
  const aspect = image.width / image.height;
  let width = Math.sqrt(area * aspect);
  let height = width / aspect;
  const maxSide = Math.min(CONTENT_WIDTH * 0.62, CONTENT_HEIGHT * 0.36);

  if (Math.max(width, height) > maxSide) {
    const scale = maxSide / Math.max(width, height);
    width *= scale;
    height *= scale;
  }

  return { width, height };
}

function rotateStickerCanvas(canvas: HTMLCanvasElement, angle: number) {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = Math.ceil(canvas.width * cos + canvas.height * sin);
  const height = Math.ceil(canvas.width * sin + canvas.height * cos);
  const rotated = document.createElement("canvas");
  rotated.width = width;
  rotated.height = height;
  const context = rotated.getContext("2d");
  if (!context) return rotated;

  context.translate(width / 2, height / 2);
  context.rotate(angle);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

function createMask(canvas: HTMLCanvasElement): StickerMask {
  const context = canvas.getContext("2d");
  const widthCells = Math.ceil(canvas.width / PACK_CELL_PX);
  const heightCells = Math.ceil(canvas.height / PACK_CELL_PX);
  if (!context) return { widthCells, heightCells, points: [] };

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const occupied = new Set<string>();

  for (let y = 0; y < canvas.height; y += PACK_CELL_PX) {
    for (let x = 0; x < canvas.width; x += PACK_CELL_PX) {
      let hasInk = false;

      for (let sampleY = y; sampleY < Math.min(y + PACK_CELL_PX, canvas.height); sampleY += 2) {
        for (let sampleX = x; sampleX < Math.min(x + PACK_CELL_PX, canvas.width); sampleX += 2) {
          const alpha = pixels.data[(sampleY * canvas.width + sampleX) * 4 + 3];
          if (alpha > 10) {
            hasInk = true;
            break;
          }
        }
        if (hasInk) break;
      }

      if (hasInk) {
        const cellX = Math.floor(x / PACK_CELL_PX);
        const cellY = Math.floor(y / PACK_CELL_PX);

        for (let gapY = -MASK_GAP_CELLS; gapY <= MASK_GAP_CELLS; gapY += 1) {
          for (let gapX = -MASK_GAP_CELLS; gapX <= MASK_GAP_CELLS; gapX += 1) {
            const nextX = cellX + gapX;
            const nextY = cellY + gapY;
            if (nextX >= 0 && nextY >= 0 && nextX < widthCells && nextY < heightCells) {
              occupied.add(`${nextX},${nextY}`);
            }
          }
        }
      }
    }
  }

  return {
    widthCells,
    heightCells,
    points: Array.from(occupied, (key) => {
      const [x, y] = key.split(",").map(Number);
      return [x, y] as [number, number];
    }),
  };
}

function canPlace(
  occupancy: Uint8Array,
  cols: number,
  rows: number,
  mask: StickerMask,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x + mask.widthCells >= cols || y + mask.heightCells >= rows) {
    return false;
  }

  for (const [pointX, pointY] of mask.points) {
    if (occupancy[(y + pointY) * cols + x + pointX]) {
      return false;
    }
  }

  return true;
}

function markPlaced(
  occupancy: Uint8Array,
  cols: number,
  mask: StickerMask,
  x: number,
  y: number,
) {
  for (const [pointX, pointY] of mask.points) {
    occupancy[(y + pointY) * cols + x + pointX] = 1;
  }
}

function candidatePositions(sticker: UnplacedSticker, cols: number, rows: number) {
  const minX = Math.ceil(SAFE_MARGIN_PX / PACK_CELL_PX);
  const minY = Math.ceil(SAFE_MARGIN_PX / PACK_CELL_PX);
  const maxX = Math.floor((A6_WIDTH - SAFE_MARGIN_PX - sticker.canvas.width) / PACK_CELL_PX);
  const maxY = Math.floor((A6_HEIGHT - SAFE_MARGIN_PX - sticker.canvas.height) / PACK_CELL_PX);
  const anchorX = clamp(
    Math.round((sticker.anchorX - sticker.canvas.width / 2) / PACK_CELL_PX),
    minX,
    maxX,
  );
  const anchorY = clamp(
    Math.round((sticker.anchorY - sticker.canvas.height / 2) / PACK_CELL_PX),
    minY,
    maxY,
  );
  const seen = new Set<string>();
  const candidates: Array<{ x: number; y: number; score: number }> = [];

  function add(x: number, y: number) {
    if (x < minX || y < minY || x > maxX || y > maxY) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);

    const centerX = x + sticker.mask.widthCells / 2;
    const centerY = y + sticker.mask.heightCells / 2;
    const targetCenterX = sticker.anchorX / PACK_CELL_PX;
    const targetCenterY = sticker.anchorY / PACK_CELL_PX;
    const pageCenterX = cols / 2;
    const pageCenterY = rows / 2;
    const anchorDistance = Math.hypot(centerX - targetCenterX, centerY - targetCenterY);
    const centerPull = Math.hypot(centerX - pageCenterX, centerY - pageCenterY) * 0.08;
    candidates.push({ x, y, score: anchorDistance + centerPull });
  }

  const maxRadius = Math.max(cols, rows);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let offset = -radius; offset <= radius; offset += 2) {
      add(anchorX + offset, anchorY - radius);
      add(anchorX + offset, anchorY + radius);
      add(anchorX - radius, anchorY + offset);
      add(anchorX + radius, anchorY + offset);
    }
  }

  for (let y = minY; y <= maxY; y += 3) {
    for (let x = minX; x <= maxX; x += 3) {
      add(x, y);
    }
  }

  return candidates.sort((a, b) => a.score - b.score);
}

function packStickers(stickers: UnplacedSticker[]) {
  const cols = Math.ceil(A6_WIDTH / PACK_CELL_PX);
  const rows = Math.ceil(A6_HEIGHT / PACK_CELL_PX);
  const occupancy = new Uint8Array(cols * rows);
  const placed: StickerAsset[] = [];
  const sorted = [...stickers].sort((a, b) => b.mask.points.length - a.mask.points.length);

  for (const sticker of sorted) {
    const candidates = candidatePositions(sticker, cols, rows);
    const position = candidates.find((candidate) => (
      canPlace(occupancy, cols, rows, sticker.mask, candidate.x, candidate.y)
    ));

    if (!position) {
      return null;
    }

    markPlaced(occupancy, cols, sticker.mask, position.x, position.y);
    placed.push({
      canvas: sticker.canvas,
      mask: sticker.mask,
      x: position.x * PACK_CELL_PX,
      y: position.y * PACK_CELL_PX,
      anchorIndex: sticker.anchorIndex,
    });
  }

  return placed.sort((a, b) => a.anchorIndex - b.anchorIndex);
}

async function createStickerAssets(cutouts: Cutout[]) {
  const stickers = repeatedCutouts(cutouts);
  const images = await Promise.all(stickers.map(async (cutout) => (
    trimTransparentPadding(await loadImage(cutout.url))
  )));

  for (const globalScale of PACK_SCALES) {
    const unplaced = images.map((image, index) => {
      const anchor = PACK_ANCHORS[index];
      const targetArea = BASE_STICKER_AREA * anchor.weight * globalScale * globalScale;
      const { width, height } = targetSizeForImage(image, targetArea);
      const stickerCanvas = createStickerCanvas(image, width, height);
      const rotated = rotateStickerCanvas(stickerCanvas, anchor.rotation * (Math.PI / 180));

      return {
        canvas: rotated,
        mask: createMask(rotated),
        anchorIndex: index,
        anchorX: anchor.x,
        anchorY: anchor.y,
      };
    });
    const packed = packStickers(unplaced);
    if (packed) return packed;
  }

  throw new Error("Could not fit 10 stickers on the sheet. Try images with transparent backgrounds.");
}

async function drawSheet(canvas: HTMLCanvasElement, cutouts: Cutout[]) {
  const context = canvas.getContext("2d");
  if (!context || cutouts.length === 0) return;

  canvas.width = A6_WIDTH;
  canvas.height = A6_HEIGHT;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, A6_WIDTH, A6_HEIGHT);

  const assets = await createStickerAssets(cutouts);

  for (const sticker of assets) {
    context.drawImage(sticker.canvas, sticker.x, sticker.y);
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
