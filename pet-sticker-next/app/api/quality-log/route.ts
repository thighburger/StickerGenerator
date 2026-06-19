import { appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LOG_DIR =
  process.env.QUALITY_LOG_DIR ??
  (process.env.VERCEL ? "/tmp/pet-sticker-quality-logs" : join(process.cwd(), "logs"));

type QualityPayload = {
  eventType?: "prediction" | "feedback";
  report?: {
    score?: number;
    label?: string;
    modelVersion?: string;
    imageCount?: number;
    featureVector?: {
      sheet_fill_ratio?: number;
    };
  };
  feedback?: {
    label?: string;
    note?: string;
  };
};

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function appendCsv(fileName: string, header: string[], row: unknown[]) {
  await mkdir(LOG_DIR, { recursive: true });
  const path = join(LOG_DIR, fileName);
  const exists = await stat(path)
    .then(() => true)
    .catch(() => false);
  const line = `${row.map(csv).join(",")}\n`;

  await appendFile(
    path,
    `${exists ? "" : `${header.map(csv).join(",")}\n`}${line}`,
    "utf8"
  );
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as QualityPayload | null;

  if (!payload?.eventType || !payload.report) {
    return NextResponse.json({ error: "Invalid quality log payload." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const report = payload.report;

  if (payload.eventType === "prediction") {
    await appendCsv(
      "quality-predictions.csv",
      ["timestamp", "modelVersion", "score", "label", "imageCount", "sheetFillRatio"],
      [
        timestamp,
        report.modelVersion,
        report.score,
        report.label,
        report.imageCount,
        report.featureVector?.sheet_fill_ratio,
      ]
    );
    return NextResponse.json({ status: "logged" });
  }

  await appendCsv(
    "quality-feedback.csv",
    ["timestamp", "modelVersion", "score", "label", "feedbackLabel", "feedbackNote"],
    [
      timestamp,
      report.modelVersion,
      report.score,
      report.label,
      payload.feedback?.label,
      String(payload.feedback?.note ?? "").slice(0, 200),
    ]
  );
  return NextResponse.json({ status: "logged" });
}
