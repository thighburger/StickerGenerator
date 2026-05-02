"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const MAX_UPLOADS = 5;
const STICKERS_PER_SHEET = 10;
const A6_WIDTH = 1240;
const A6_HEIGHT = 1748;
const BORDER_PX = 12;
const SAFE_MARGIN_PX = 56;
const SLOT_GAP_PX = 24;
const SMALL_SLOT_WIDTH = 360;
const MID_SLOT_X = SAFE_MARGIN_PX + SMALL_SLOT_WIDTH + SLOT_GAP_PX;
const RIGHT_SLOT_X = A6_WIDTH - SAFE_MARGIN_PX - SMALL_SLOT_WIDTH;
const WIDE_SLOT_WIDTH = 540;
const RIGHT_WIDE_SLOT_X = A6_WIDTH - SAFE_MARGIN_PX - WIDE_SLOT_WIDTH;
const STICKER_SLOTS = [
  { x: SAFE_MARGIN_PX, y: 56, width: SMALL_SLOT_WIDTH, height: 340, rotation: -6 },
  { x: MID_SLOT_X, y: 56, width: SMALL_SLOT_WIDTH, height: 340, rotation: 7 },
  { x: RIGHT_SLOT_X, y: 56, width: SMALL_SLOT_WIDTH, height: 340, rotation: 4 },
  { x: SAFE_MARGIN_PX, y: 404, width: WIDE_SLOT_WIDTH, height: 390, rotation: -82 },
  { x: RIGHT_WIDE_SLOT_X, y: 404, width: WIDE_SLOT_WIDTH, height: 390, rotation: 68 },
  { x: SAFE_MARGIN_PX, y: 802, width: SMALL_SLOT_WIDTH, height: 360, rotation: -3 },
  { x: MID_SLOT_X, y: 802, width: SMALL_SLOT_WIDTH, height: 360, rotation: 180 },
  { x: RIGHT_SLOT_X, y: 802, width: SMALL_SLOT_WIDTH, height: 360, rotation: 3 },
  { x: SAFE_MARGIN_PX, y: 1170, width: WIDE_SLOT_WIDTH, height: 522, rotation: -4 },
  { x: RIGHT_WIDE_SLOT_X, y: 1170, width: WIDE_SLOT_WIDTH, height: 522, rotation: -172 },
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
  angle: number;
  cx: number;
  cy: number;
};

function rotatedBounds(width: number, height: number, angle: number) {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function fitImageToRotatedSlot(
  image: DrawableImage,
  angle: number,
  slot: { width: number; height: number },
) {
  let low = 0.1;
  let high = Math.min(slot.width / image.width, slot.height / image.height) * 3;
  const padding = (BORDER_PX + 4) * 2;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const scale = (low + high) / 2;
    const stickerWidth = image.width * scale + padding;
    const stickerHeight = image.height * scale + padding;
    const bounds = rotatedBounds(stickerWidth, stickerHeight, angle);

    if (bounds.width <= slot.width && bounds.height <= slot.height) {
      low = scale;
    } else {
      high = scale;
    }
  }

  return {
    width: image.width * low,
    height: image.height * low,
  };
}

async function createStickerAssets(cutouts: Cutout[]) {
  const assets: StickerAsset[] = [];
  const stickers = repeatedCutouts(cutouts);

  for (let index = 0; index < stickers.length; index += 1) {
    const cutout = stickers[index];
    const image = trimTransparentPadding(await loadImage(cutout.url));
    const slot = STICKER_SLOTS[index];
    const angle = slot.rotation * (Math.PI / 180);
    const { width, height } = fitImageToRotatedSlot(image, angle, slot);
    const stickerCanvas = createStickerCanvas(image, width, height);
    assets.push({
      canvas: stickerCanvas,
      angle,
      cx: slot.x + slot.width / 2,
      cy: slot.y + slot.height / 2,
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

  const assets = await createStickerAssets(cutouts);

  for (const sticker of assets) {
    context.save();
    context.translate(sticker.cx, sticker.cy);
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
