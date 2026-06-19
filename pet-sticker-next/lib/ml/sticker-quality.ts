import model from "./sticker-quality-model.json";

type ModelExport = {
  modelName: string;
  version: string;
  featureNames: string[];
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
  thresholds: {
    good: number;
    warning: number;
  };
  metrics: {
    mae: number;
    rmse: number;
    r2: number;
  };
};

type CutoutInput = {
  url: string;
  name: string;
};

export type StickerQualityFeatures = {
  resolution_score: number;
  aspect_balance: number;
  brightness_balance: number;
  contrast_score: number;
  edge_score: number;
  alpha_balance: number;
  sheet_fill_ratio: number;
};

export type StickerQualityReport = {
  score: number;
  label: "제작 적합" | "보정 권장" | "재촬영 권장";
  modelName: string;
  modelVersion: string;
  featureVector: StickerQualityFeatures;
  recommendations: string[];
  imageCount: number;
  createdAt: string;
};

const qualityModel = model as ModelExport;
const ANALYSIS_SIZE = 128;

function clamp(value: number, lower = 0, upper = 1) {
  return Math.max(lower, Math.min(upper, value));
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function loadQualityImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not analyze quality image."));
    image.src = src;
  });
}

function averageFeatureVectors(vectors: StickerQualityFeatures[]): StickerQualityFeatures {
  const total = vectors.reduce<StickerQualityFeatures>(
    (accumulator, vector) => ({
      resolution_score: accumulator.resolution_score + vector.resolution_score,
      aspect_balance: accumulator.aspect_balance + vector.aspect_balance,
      brightness_balance: accumulator.brightness_balance + vector.brightness_balance,
      contrast_score: accumulator.contrast_score + vector.contrast_score,
      edge_score: accumulator.edge_score + vector.edge_score,
      alpha_balance: accumulator.alpha_balance + vector.alpha_balance,
      sheet_fill_ratio: accumulator.sheet_fill_ratio + vector.sheet_fill_ratio,
    }),
    {
      resolution_score: 0,
      aspect_balance: 0,
      brightness_balance: 0,
      contrast_score: 0,
      edge_score: 0,
      alpha_balance: 0,
      sheet_fill_ratio: 0,
    }
  );
  const count = Math.max(1, vectors.length);

  return {
    resolution_score: round(total.resolution_score / count),
    aspect_balance: round(total.aspect_balance / count),
    brightness_balance: round(total.brightness_balance / count),
    contrast_score: round(total.contrast_score / count),
    edge_score: round(total.edge_score / count),
    alpha_balance: round(total.alpha_balance / count),
    sheet_fill_ratio: round(total.sheet_fill_ratio / count),
  };
}

function getCanvasFeatures(
  image: HTMLImageElement,
  sheetFillRatio: number
): StickerQualityFeatures {
  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return {
      resolution_score: 0,
      aspect_balance: 0,
      brightness_balance: 0,
      contrast_score: 0,
      edge_score: 0,
      alpha_balance: 0,
      sheet_fill_ratio: clamp(sheetFillRatio),
    };
  }

  const scale = Math.min(
    ANALYSIS_SIZE / image.naturalWidth,
    ANALYSIS_SIZE / image.naturalHeight
  );
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const drawX = Math.floor((ANALYSIS_SIZE - drawWidth) / 2);
  const drawY = Math.floor((ANALYSIS_SIZE - drawHeight) / 2);

  context.clearRect(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  const pixels = context.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const luminance = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
  luminance.fill(-1);

  let visiblePixels = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3];
    if (alpha <= 8) continue;

    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const value = red * 0.299 + green * 0.587 + blue * 0.114;
    const pixelIndex = index / 4;

    luminance[pixelIndex] = value;
    visiblePixels += 1;
    sum += value;
    sumSquares += value * value;
  }

  if (visiblePixels === 0) {
    return {
      resolution_score: 0,
      aspect_balance: 0,
      brightness_balance: 0,
      contrast_score: 0,
      edge_score: 0,
      alpha_balance: 0,
      sheet_fill_ratio: clamp(sheetFillRatio),
    };
  }

  let edgeSum = 0;
  let edgePairs = 0;
  for (let y = 0; y < ANALYSIS_SIZE; y += 1) {
    for (let x = 0; x < ANALYSIS_SIZE; x += 1) {
      const current = luminance[y * ANALYSIS_SIZE + x];
      if (current < 0) continue;

      if (x + 1 < ANALYSIS_SIZE) {
        const right = luminance[y * ANALYSIS_SIZE + x + 1];
        if (right >= 0) {
          edgeSum += Math.abs(current - right);
          edgePairs += 1;
        }
      }
      if (y + 1 < ANALYSIS_SIZE) {
        const down = luminance[(y + 1) * ANALYSIS_SIZE + x];
        if (down >= 0) {
          edgeSum += Math.abs(current - down);
          edgePairs += 1;
        }
      }
    }
  }

  const mean = sum / visiblePixels;
  const variance = Math.max(0, sumSquares / visiblePixels - mean * mean);
  const contrast = Math.sqrt(variance);
  const edgeMean = edgePairs > 0 ? edgeSum / edgePairs : 0;
  const alphaCoverage = visiblePixels / (ANALYSIS_SIZE * ANALYSIS_SIZE);
  const aspectRatio = image.naturalWidth / image.naturalHeight;
  const megapixels = (image.naturalWidth * image.naturalHeight) / 1_000_000;

  return {
    resolution_score: round(clamp(megapixels / 1.2)),
    aspect_balance: round(1 - clamp(Math.abs(Math.log(aspectRatio)) / 0.95)),
    brightness_balance: round(1 - clamp(Math.abs(mean - 140) / 115)),
    contrast_score: round(clamp(contrast / 64)),
    edge_score: round(clamp(edgeMean / 28)),
    alpha_balance: round(1 - clamp(Math.abs(alphaCoverage - 0.45) / 0.4)),
    sheet_fill_ratio: round(clamp(sheetFillRatio)),
  };
}

export function predictStickerQuality(features: StickerQualityFeatures) {
  let score = qualityModel.intercept;

  qualityModel.featureNames.forEach((name, index) => {
    const value = features[name as keyof StickerQualityFeatures];
    const scale = qualityModel.scales[index] || 1;
    score +=
      ((value - qualityModel.means[index]) / scale) *
      qualityModel.coefficients[index];
  });

  const roundedScore = Math.round(clamp(score, 0, 100));
  const label =
    roundedScore >= qualityModel.thresholds.good
      ? "제작 적합"
      : roundedScore >= qualityModel.thresholds.warning
        ? "보정 권장"
        : "재촬영 권장";

  return {
    score: roundedScore,
    label,
  } as const;
}

function buildRecommendations(features: StickerQualityFeatures, score: number) {
  const recommendations: string[] = [];

  if (features.resolution_score < 0.55) {
    recommendations.push("더 큰 원본 사진을 사용하면 인쇄 선명도가 좋아져요.");
  }
  if (features.brightness_balance < 0.55) {
    recommendations.push("너무 어둡거나 밝지 않은 사진을 추천해요.");
  }
  if (features.edge_score < 0.45 || features.contrast_score < 0.45) {
    recommendations.push("흔들림이 적고 털 윤곽이 또렷한 사진이 좋아요.");
  }
  if (features.alpha_balance < 0.45) {
    recommendations.push("반려동물 얼굴과 몸이 화면에 적당히 크게 나온 사진이 좋아요.");
  }
  if (features.sheet_fill_ratio < 0.7) {
    recommendations.push("다른 사진을 추가하면 A6 시안을 더 꽉 채울 수 있어요.");
  }
  if (recommendations.length === 0 && score >= 82) {
    recommendations.push("현재 사진 조합으로 바로 제작하기 좋아요.");
  }

  return recommendations.slice(0, 3);
}

export async function analyzeStickerQuality(
  cutouts: CutoutInput[],
  sheetFillRatio: number
): Promise<StickerQualityReport> {
  const vectors = await Promise.all(
    cutouts.map(async (cutout) =>
      getCanvasFeatures(await loadQualityImage(cutout.url), sheetFillRatio)
    )
  );
  const featureVector = averageFeatureVectors(vectors);
  featureVector.sheet_fill_ratio = round(clamp(sheetFillRatio));
  const prediction = predictStickerQuality(featureVector);

  return {
    score: prediction.score,
    label: prediction.label,
    modelName: qualityModel.modelName,
    modelVersion: qualityModel.version,
    featureVector,
    recommendations: buildRecommendations(featureVector, prediction.score),
    imageCount: cutouts.length,
    createdAt: new Date().toISOString(),
  };
}
