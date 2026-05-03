"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const MAX_UPLOADS = 5;
const STICKERS_PER_SHEET = 10;
const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/s7CYBeti";
const A6_WIDTH = 1240;
const A6_HEIGHT = 1748;
const BORDER_PX = 12;
const SAFE_MARGIN_PX = 64;
const STICKER_GAP_PX = 24;
const PACK_CELL_PX = 12;
const COVERAGE_CELL_PX = 12;
const MASK_GAP_CELLS = Math.ceil(STICKER_GAP_PX / PACK_CELL_PX);
const CONTENT_WIDTH = A6_WIDTH - SAFE_MARGIN_PX * 2;
const CONTENT_HEIGHT = A6_HEIGHT - SAFE_MARGIN_PX * 2;
const BASE_STICKER_AREA = (CONTENT_WIDTH * CONTENT_HEIGHT) / 8.25;
const MIN_SHEET_FILL_RATIO = 0.7;
const PACK_SCALES = [
  1.12, 1.06, 1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4,
];
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
const DENSE_LAYOUT_BOXES = [
  { x: 64, y: 64, width: 720, height: 340, rotation: 90 },
  { x: 816, y: 64, width: 360, height: 340, rotation: -5 },
  { x: 64, y: 440, width: 580, height: 370, rotation: 90 },
  { x: 676, y: 440, width: 500, height: 370, rotation: -5 },
  { x: 64, y: 846, width: 570, height: 370, rotation: 90 },
  { x: 662, y: 846, width: 230, height: 370, rotation: 0 },
  { x: 920, y: 846, width: 256, height: 370, rotation: 0 },
  { x: 64, y: 1252, width: 530, height: 432, rotation: 90 },
  { x: 626, y: 1252, width: 280, height: 432, rotation: 0 },
  { x: 938, y: 1252, width: 238, height: 432, rotation: 0 },
];
const FALLBACK_BOXES = [
  { x: 76, y: 64, width: 330, height: 300, rotation: -5 },
  { x: 456, y: 64, width: 330, height: 300, rotation: 8 },
  { x: 834, y: 64, width: 330, height: 300, rotation: 4 },
  { x: 76, y: 386, width: 500, height: 330, rotation: -78 },
  { x: 664, y: 386, width: 500, height: 330, rotation: 68 },
  { x: 76, y: 748, width: 330, height: 330, rotation: -3 },
  { x: 456, y: 748, width: 330, height: 330, rotation: 180 },
  { x: 834, y: 748, width: 330, height: 330, rotation: 3 },
  { x: 86, y: 1124, width: 500, height: 560, rotation: -3 },
  { x: 654, y: 1124, width: 500, height: 560, rotation: -172 },
];

type Cutout = {
  url: string;
  name: string;
};

type OrderForm = {
  name: string;
  phone: string;
  address: string;
  memo: string;
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

function imageSize(image: DrawableImage) {
  if (image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  return {
    width: image.width,
    height: image.height,
  };
}

function removeSolidEdgeMatte(image: HTMLImageElement) {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return image;

  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
  let hasTransparency = false;

  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] < 250) {
      hasTransparency = true;
      break;
    }
  }

  if (hasTransparency) return source;

  const cornerIndexes = [
    0,
    source.width - 1,
    (source.height - 1) * source.width,
    source.height * source.width - 1,
  ].map((pixelIndex) => pixelIndex * 4);
  const cornerColors = cornerIndexes.map((index) => [
    pixels.data[index],
    pixels.data[index + 1],
    pixels.data[index + 2],
  ]);
  const backgroundThreshold = 26;

  function isBackground(pixelIndex: number) {
    const red = pixels.data[pixelIndex];
    const green = pixels.data[pixelIndex + 1];
    const blue = pixels.data[pixelIndex + 2];

    return cornerColors.some(
      ([cornerRed, cornerGreen, cornerBlue]) =>
        Math.abs(red - cornerRed) <= backgroundThreshold &&
        Math.abs(green - cornerGreen) <= backgroundThreshold &&
        Math.abs(blue - cornerBlue) <= backgroundThreshold
    );
  }

  const visited = new Uint8Array(source.width * source.height);
  const queue: number[] = [];

  function enqueue(x: number, y: number) {
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return;
    const point = y * source.width + x;
    if (visited[point]) return;
    const pixelIndex = point * 4;
    if (!isBackground(pixelIndex)) return;
    visited[point] = 1;
    queue.push(point);
  }

  for (let x = 0; x < source.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, source.height - 1);
  }

  for (let y = 0; y < source.height; y += 1) {
    enqueue(0, y);
    enqueue(source.width - 1, y);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    const x = point % source.width;
    const y = Math.floor(point / source.width);
    pixels.data[point * 4 + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  sourceContext.putImageData(pixels, 0, 0);
  return source;
}

function trimTransparentPadding(image: DrawableImage) {
  const size = imageSize(image);
  const source = document.createElement("canvas");
  source.width = size.width;
  source.height = size.height;
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
    trimmed.height
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
  color: string
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

function createStickerCanvas(
  image: DrawableImage,
  width: number,
  height: number
) {
  const padding = BORDER_PX + 4;
  const sticker = document.createElement("canvas");
  sticker.width = Math.ceil(width + padding * 2);
  sticker.height = Math.ceil(height + padding * 2);
  const context = sticker.getContext("2d");
  if (!context) return sticker;

  drawSilhouette(
    context,
    image,
    padding,
    padding,
    width,
    height,
    BORDER_PX,
    "#ffffff"
  );
  context.drawImage(image, padding, padding, width, height);

  return sticker;
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

function createOrderId() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `STK-${date}-${suffix}`;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not export sticker sheet."));
      }
    }, "image/png");
  });
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
  const occupied = new Uint8Array(widthCells * heightCells);

  for (let y = 0; y < canvas.height; y += PACK_CELL_PX) {
    for (let x = 0; x < canvas.width; x += PACK_CELL_PX) {
      let hasInk = false;

      for (
        let sampleY = y;
        sampleY < Math.min(y + PACK_CELL_PX, canvas.height);
        sampleY += 4
      ) {
        for (
          let sampleX = x;
          sampleX < Math.min(x + PACK_CELL_PX, canvas.width);
          sampleX += 4
        ) {
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
            if (
              nextX >= 0 &&
              nextY >= 0 &&
              nextX < widthCells &&
              nextY < heightCells
            ) {
              occupied[nextY * widthCells + nextX] = 1;
            }
          }
        }
      }
    }
  }

  const points: Array<[number, number]> = [];
  for (let y = 0; y < heightCells; y += 1) {
    for (let x = 0; x < widthCells; x += 1) {
      if (occupied[y * widthCells + x]) {
        points.push([x, y]);
      }
    }
  }

  return {
    widthCells,
    heightCells,
    points,
  };
}

function canPlace(
  occupancy: Uint8Array,
  cols: number,
  rows: number,
  mask: StickerMask,
  x: number,
  y: number
) {
  if (
    x < 0 ||
    y < 0 ||
    x + mask.widthCells >= cols ||
    y + mask.heightCells >= rows
  ) {
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
  y: number
) {
  for (const [pointX, pointY] of mask.points) {
    occupancy[(y + pointY) * cols + x + pointX] = 1;
  }
}

function findPosition(
  occupancy: Uint8Array,
  cols: number,
  rows: number,
  sticker: UnplacedSticker
) {
  const minX = Math.ceil(SAFE_MARGIN_PX / PACK_CELL_PX);
  const minY = Math.ceil(SAFE_MARGIN_PX / PACK_CELL_PX);
  const maxX = Math.floor(
    (A6_WIDTH - SAFE_MARGIN_PX - sticker.canvas.width) / PACK_CELL_PX
  );
  const maxY = Math.floor(
    (A6_HEIGHT - SAFE_MARGIN_PX - sticker.canvas.height) / PACK_CELL_PX
  );

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const anchorX = clamp(
    Math.round((sticker.anchorX - sticker.canvas.width / 2) / PACK_CELL_PX),
    minX,
    maxX
  );
  const anchorY = clamp(
    Math.round((sticker.anchorY - sticker.canvas.height / 2) / PACK_CELL_PX),
    minY,
    maxY
  );
  const seen = new Set<string>();

  function test(x: number, y: number) {
    if (x < minX || y < minY || x > maxX || y > maxY) return null;
    const key = `${x},${y}`;
    if (seen.has(key)) return null;
    seen.add(key);

    if (canPlace(occupancy, cols, rows, sticker.mask, x, y)) {
      return { x, y };
    }

    return null;
  }

  const maxRadius = Math.max(cols, rows);
  for (let radius = 0; radius <= maxRadius; radius += 2) {
    for (let offset = -radius; offset <= radius; offset += 2) {
      const top = test(anchorX + offset, anchorY - radius);
      if (top) return top;
      const bottom = test(anchorX + offset, anchorY + radius);
      if (bottom) return bottom;
      const left = test(anchorX - radius, anchorY + offset);
      if (left) return left;
      const right = test(anchorX + radius, anchorY + offset);
      if (right) return right;
    }
  }

  for (let y = minY; y <= maxY; y += 2) {
    for (let x = minX; x <= maxX; x += 2) {
      const position = test(x, y);
      if (position) return position;
    }
  }

  return null;
}

function packStickers(stickers: UnplacedSticker[]) {
  const cols = Math.ceil(A6_WIDTH / PACK_CELL_PX);
  const rows = Math.ceil(A6_HEIGHT / PACK_CELL_PX);
  const occupancy = new Uint8Array(cols * rows);
  const placed: StickerAsset[] = [];
  const sorted = [...stickers].sort(
    (a, b) => b.mask.points.length - a.mask.points.length
  );

  for (const sticker of sorted) {
    const position = findPosition(occupancy, cols, rows, sticker);

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

function createFallbackAsset(
  image: DrawableImage,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  },
  anchorIndex: number
) {
  const angle = box.rotation * (Math.PI / 180);
  let low = 0.1;
  let high = Math.max(box.width / image.width, box.height / image.height) * 2;
  let bestCanvas = rotateStickerCanvas(
    createStickerCanvas(image, image.width * low, image.height * low),
    angle
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const scale = (low + high) / 2;
    const stickerCanvas = createStickerCanvas(
      image,
      image.width * scale,
      image.height * scale
    );
    const rotated = rotateStickerCanvas(stickerCanvas, angle);

    if (rotated.width <= box.width && rotated.height <= box.height) {
      low = scale;
      bestCanvas = rotated;
    } else {
      high = scale;
    }
  }

  return {
    canvas: bestCanvas,
    mask: createMask(bestCanvas),
    x: box.x + (box.width - bestCanvas.width) / 2,
    y: box.y + (box.height - bestCanvas.height) / 2,
    anchorIndex,
  };
}

function createFallbackAssets(images: DrawableImage[]) {
  return images.map((image, index) =>
    createFallbackAsset(image, FALLBACK_BOXES[index], index)
  );
}

function createDenseAssets(images: DrawableImage[]) {
  return images.map((image, index) =>
    createFallbackAsset(image, DENSE_LAYOUT_BOXES[index], index)
  );
}

function imageAspect(image: DrawableImage) {
  const size = imageSize(image);
  return size.width / size.height;
}

function balancedUsageCounts(imageCount: number) {
  const baseCount = Math.floor(STICKERS_PER_SHEET / imageCount);
  const remainder = STICKERS_PER_SHEET % imageCount;

  return Array.from(
    { length: imageCount },
    (_, index) => baseCount + (index < remainder ? 1 : 0)
  );
}

function chooseImagesForDenseLayout(sourceImages: DrawableImage[]) {
  const remainingCounts = balancedUsageCounts(sourceImages.length);

  return DENSE_LAYOUT_BOXES.map((box) => {
    const boxAspect = box.width / box.height;
    const rotation = Math.abs(box.rotation) % 180;
    const isSidewaysSlot = rotation >= 55 && rotation <= 125;
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < sourceImages.length; index += 1) {
      if (remainingCounts[index] === 0) continue;

      const aspect = imageAspect(sourceImages[index]);
      const effectiveAspect = isSidewaysSlot ? 1 / aspect : aspect;
      const aspectScore = Math.abs(Math.log(effectiveAspect / boxAspect));

      if (aspectScore < bestScore) {
        bestScore = aspectScore;
        bestIndex = index;
      }
    }

    remainingCounts[bestIndex] -= 1;
    return sourceImages[bestIndex];
  });
}

function estimateSheetFill(assets: StickerAsset[]) {
  const cols = Math.ceil(CONTENT_WIDTH / COVERAGE_CELL_PX);
  const rows = Math.ceil(CONTENT_HEIGHT / COVERAGE_CELL_PX);
  const occupied = new Uint8Array(cols * rows);

  for (const asset of assets) {
    const left = clamp(asset.x, SAFE_MARGIN_PX, A6_WIDTH - SAFE_MARGIN_PX);
    const top = clamp(asset.y, SAFE_MARGIN_PX, A6_HEIGHT - SAFE_MARGIN_PX);
    const right = clamp(
      asset.x + asset.canvas.width,
      SAFE_MARGIN_PX,
      A6_WIDTH - SAFE_MARGIN_PX
    );
    const bottom = clamp(
      asset.y + asset.canvas.height,
      SAFE_MARGIN_PX,
      A6_HEIGHT - SAFE_MARGIN_PX
    );
    const startX = Math.floor((left - SAFE_MARGIN_PX) / COVERAGE_CELL_PX);
    const startY = Math.floor((top - SAFE_MARGIN_PX) / COVERAGE_CELL_PX);
    const endX = Math.ceil((right - SAFE_MARGIN_PX) / COVERAGE_CELL_PX);
    const endY = Math.ceil((bottom - SAFE_MARGIN_PX) / COVERAGE_CELL_PX);

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        if (x >= 0 && y >= 0 && x < cols && y < rows) {
          occupied[y * cols + x] = 1;
        }
      }
    }
  }

  const filled = occupied.reduce((total, cell) => total + cell, 0);
  return filled / occupied.length;
}

async function createStickerAssets(cutouts: Cutout[]) {
  const sourceImages = await Promise.all(
    cutouts.map(async (cutout) =>
      trimTransparentPadding(removeSolidEdgeMatte(await loadImage(cutout.url)))
    )
  );
  const repeatedImages = Array.from(
    { length: STICKERS_PER_SHEET },
    (_, index) => sourceImages[index % sourceImages.length]
  );
  const images = chooseImagesForDenseLayout(sourceImages);

  const denseAssets = createDenseAssets(images);
  if (estimateSheetFill(denseAssets) >= MIN_SHEET_FILL_RATIO) {
    return denseAssets;
  }

  for (const globalScale of PACK_SCALES) {
    const unplaced = repeatedImages.map((image, index) => {
      const anchor = PACK_ANCHORS[index];
      const targetArea =
        BASE_STICKER_AREA * anchor.weight * globalScale * globalScale;
      const { width, height } = targetSizeForImage(image, targetArea);
      const stickerCanvas = createStickerCanvas(image, width, height);
      const rotated = rotateStickerCanvas(
        stickerCanvas,
        anchor.rotation * (Math.PI / 180)
      );

      return {
        canvas: rotated,
        mask: createMask(rotated),
        anchorIndex: index,
        anchorX: anchor.x,
        anchorY: anchor.y,
      };
    });
    const packed = packStickers(unplaced);
    if (packed && estimateSheetFill(packed) >= MIN_SHEET_FILL_RATIO) return packed;
  }

  return denseAssets.length
    ? denseAssets
    : createFallbackAssets(repeatedImages);
}

async function drawSheet(canvas: HTMLCanvasElement, cutouts: Cutout[]) {
  const context = canvas.getContext("2d");
  if (!context || cutouts.length === 0) return 0;

  canvas.width = A6_WIDTH;
  canvas.height = A6_HEIGHT;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, A6_WIDTH, A6_HEIGHT);

  const assets = await createStickerAssets(cutouts);

  for (const sticker of assets) {
    context.drawImage(sticker.canvas, sticker.x, sticker.y);
  }

  return estimateSheetFill(assets);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [cutouts, setCutouts] = useState<Cutout[]>([]);
  const [status, setStatus] = useState("Upload up to 5 dog photos.");
  const [error, setError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");
  const [orderForm, setOrderForm] = useState<OrderForm>({
    name: "",
    phone: "",
    address: "",
    memo: "",
  });
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const previewUrls = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files]
  );
  const selectedCount = files.length;
  const previewReady = cutouts.length > 0;

  function applyFiles(nextFiles: File[]) {
    const imageFiles = nextFiles.filter((file) =>
      file.type.startsWith("image/")
    );
    const selected = imageFiles.slice(0, MAX_UPLOADS);
    setFiles(selected);
    setCutouts([]);
    setError(imageFiles.length === 0 ? "Drop or choose image files." : "");
    setOrderNotice("");
    setStatus(
      selected.length
        ? `${selected.length} image(s) selected.`
        : "Upload up to 5 dog photos."
    );
  }

  function handleTestFiles(event: ChangeEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_UPLOADS);
    setTestFiles(imageFiles);
    setCutouts([]);
    setError("");
    setOrderNotice("");
    setStatus(
      imageFiles.length
        ? `${imageFiles.length} transparent test image(s) selected.`
        : "Upload up to 5 dog photos."
    );
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    applyFiles(Array.from(event.target.files ?? []));
  }

  function updateOrderForm(field: keyof OrderForm, value: string) {
    setOrderForm((current) => ({ ...current, [field]: value }));
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
      throw new Error(
        payload?.error ?? `Background removal failed for ${file.name}.`
      );
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
      const nextCutouts = await Promise.all(
        files.map((file) => removeBackground(file))
      );

      setStatus("Drawing 10 stickers...");
      setCutouts(nextCutouts);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      const fill = await drawSheet(canvas, nextCutouts);
      setStatus(`Sticker sheet ready. Fill ${Math.round(fill * 100)}%.`);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Could not generate sticker sheet.";
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
      const fill = await drawSheet(canvas, nextCutouts);
      setStatus(`Test sticker sheet ready. Fill ${Math.round(fill * 100)}%.`);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Could not generate test sticker sheet.";
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

  async function purchase() {
    const canvas = canvasRef.current;
    if (!canvas || cutouts.length === 0) return;
    if (!orderForm.name.trim() || !orderForm.phone.trim() || !orderForm.address.trim()) {
      setOrderNotice("이름, 연락처, 배송주소를 입력한 뒤 구매하기를 눌러주세요.");
      return;
    }

    const orderId = createOrderId();
    setIsSubmittingOrder(true);
    setOrderNotice("주문 파일을 저장하는 중입니다...");

    try {
      const sheetBlob = await canvasToPngBlob(canvas);
      const orderData = new FormData();
      orderData.append("orderId", orderId);
      orderData.append("name", orderForm.name);
      orderData.append("phone", orderForm.phone);
      orderData.append("address", orderForm.address);
      orderData.append("memo", orderForm.memo);
      orderData.append("sheet", sheetBlob, `${orderId}-sheet.png`);
      files.forEach((file) => orderData.append("photos", file, file.name));

      const response = await fetch("/api/orders", {
        method: "POST",
        body: orderData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not save order files.");
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not save order files.";
      setOrderNotice(`주문 저장에 실패했습니다. ${message}`);
      setIsSubmittingOrder(false);
      return;
    }

    const message = [
      `주문번호: ${orderId}`,
      "A6 스티커 1장 구매 문의합니다.",
      "원본 사진과 고화질 시안 PNG가 저장되었습니다.",
    ].join("\n");

    const kakaoWindow = window.open(
      KAKAO_OPEN_CHAT_URL,
      "_blank",
      "noopener,noreferrer"
    );

    download();
    setOrderNotice(
      `${orderId} 주문번호가 생성됐어요. 카카오톡 채팅방에 붙여넣어 주세요.`
    );

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      setOrderNotice(
        `${orderId} 주문번호가 생성됐어요. 복사가 막히면 이 번호를 카카오톡에 직접 보내주세요.`
      );
    }

    if (!kakaoWindow) {
      setOrderNotice(
        `${orderId} 주문번호가 생성됐어요. 팝업이 막히면 카카오톡 문의 버튼을 다시 눌러주세요.`
      );
    }

    setIsSubmittingOrder(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logoMark}>멍</span>
          <span>멍스티커</span>
        </div>
        <nav className={styles.nav}>
          <a>내 시안</a>
          <a>주문 내역</a>
          <a>제작 가이드</a>
        </nav>
        <div className={styles.profile}>
          <span className={styles.bell}>3</span>
          <span className={styles.avatar}>멍</span>
          <span>멍멍이맘</span>
          <span className={styles.chevron}>⌄</span>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.uploadPanel}>
          <div className={styles.panelHeader}>
            <h2>사진 업로드</h2>
            <span className={styles.countBadge}>
              {selectedCount} / {MAX_UPLOADS}장
            </span>
          </div>

          <label
            className={`${styles.dropzone} ${
              isDragging ? styles.dropzoneActive : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className={styles.uploadIcon}>⇧</span>
            <span className={styles.dropTitle}>
              여기에 반려동물 사진을 업로드하세요
            </span>
            <span className={styles.dropHint}>
              JPG, PNG, WEBP / 최대 {MAX_UPLOADS}장
            </span>
            <input
              className={styles.fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFiles}
            />
          </label>

          {previewUrls.length > 0 && (
            <div className={styles.thumbs}>
              {previewUrls.map((url, index) => (
                <div className={styles.thumb} key={`${url}-${index}`}>
                  <img src={url} alt={`Upload ${index + 1}`} />
                  <span className={styles.thumbCheck}>✓</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={isGenerating || files.length === 0}
              onClick={generate}
            >
              {isGenerating ? "시안 생성 중" : "시안 생성하기"}
            </button>
            <button
              className={styles.secondary}
              disabled={selectedCount === 0}
              onClick={() => {
                setFiles([]);
                setCutouts([]);
                setError("");
                setOrderNotice("");
                setStatus("Upload up to 5 dog photos.");
              }}
            >
              사진 다시 선택
            </button>
          </div>

          <div className={`${styles.status} ${error ? styles.error : ""}`}>
            {error || status}
          </div>

          <div className={styles.testPanel}>
            <div className={styles.testTitle}>배경제거 완료 이미지 테스트</div>
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
              테스트 시안 생성
            </button>
          </div>
        </section>

        <section className={styles.progressPanel}>
          <div className={styles.progressCopy}>
            <p>우리 아이의 스티커를</p>
            <h1>정성스럽게 만들고 있어요</h1>
            <span>잠시만 기다려 주세요.</span>
            <small>귀여운 시안이 곧 완성돼요.</small>
          </div>
          <div className={styles.progressRing}>
            <div className={styles.ringInner}>발</div>
          </div>
          <div className={styles.progressBar}>
            <span
              style={{
                width: isGenerating ? "82%" : previewReady ? "100%" : "18%",
              }}
            />
          </div>
          <div className={styles.progressMeta}>
            {isGenerating
              ? "예상 완료 시간 18초"
              : previewReady
                ? "시안 생성 완료"
                : "사진을 올리고 시안을 생성하세요"}
          </div>
          <div className={styles.decorOne}>✦</div>
          <div className={styles.decorTwo}>발</div>
          <div className={styles.groundDog} />
        </section>

        <aside className={styles.previewPanel}>
          <div className={styles.panelHeader}>
            <h2>실시간 시안 미리보기</h2>
            <button className={styles.selectButton}>A6 스티커 1장⌄</button>
          </div>

          <div className={styles.previewFrame}>
            {!previewReady && (
              <div className={styles.empty}>
                시안 생성 후 이곳에 미리보기가 표시됩니다.
              </div>
            )}
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              style={{ display: previewReady ? "block" : "none" }}
            />
          </div>

          <div className={styles.zoomControls}>
            <button>−</button>
            <span>100%</span>
            <button>＋</button>
            <button>원본 크기</button>
          </div>

          <div className={styles.orderBox}>
            <div>
              <strong>A6 스티커 1장</strong>
              <b>₩9,900</b>
              <small>배송비 ₩2,500 · 3만원 이상 무료</small>
            </div>
            <div className={styles.quantity}>
              <span>수량 선택</span>
              <div>
                <button>−</button>
                <strong>1</strong>
                <button>＋</button>
              </div>
            </div>
            <div className={styles.total}>
              <span>총 결제금액</span>
              <strong>₩9,900</strong>
            </div>
            <div className={styles.orderForm}>
              <input
                value={orderForm.name}
                onChange={(event) => updateOrderForm("name", event.target.value)}
                placeholder="받는 분 이름"
              />
              <input
                value={orderForm.phone}
                onChange={(event) => updateOrderForm("phone", event.target.value)}
                placeholder="연락처"
              />
              <textarea
                value={orderForm.address}
                onChange={(event) => updateOrderForm("address", event.target.value)}
                placeholder="배송주소"
                rows={3}
              />
              <textarea
                value={orderForm.memo}
                onChange={(event) => updateOrderForm("memo", event.target.value)}
                placeholder="요청사항"
                rows={2}
              />
            </div>
            <button
              className={styles.buyButton}
              disabled={!previewReady || isSubmittingOrder}
              onClick={purchase}
            >
              {isSubmittingOrder ? "주문 저장 중" : "구매하기"}
            </button>
            {orderNotice && (
              <div className={styles.orderNotice}>{orderNotice}</div>
            )}
          </div>
        </aside>
      </div>

      <section className={styles.afterFlow}>
        <h2>주문 후 진행 과정</h2>
        <div className={styles.processCards}>
          {[
            ["구매하기", "시안 PNG가 저장되고 주문번호가 복사돼요.", "green"],
            ["카카오톡 문의", "열린 채팅방에 주문번호를 붙여넣어 주세요.", "blue"],
            ["입금 확인", "결제 확인 후 스티커 제작을 시작해요.", "yellow"],
            ["배송 출발", "안전하게 포장하여 빠르게 배송해 드려요.", "purple"],
          ].map(([title, text, tone], index) => (
            <div
              className={`${styles.processCard} ${styles[tone]}`}
              key={title}
            >
              <span className={styles.processIcon}>{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
