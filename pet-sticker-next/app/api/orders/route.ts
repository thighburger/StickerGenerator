import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ORDERS_DIR =
  process.env.ORDER_STORAGE_DIR ??
  (process.env.VERCEL ? "/tmp/pet-sticker-orders" : join(process.cwd(), "orders"));

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function parseQualityReport(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as {
      score?: unknown;
      label?: unknown;
      modelVersion?: unknown;
      imageCount?: unknown;
      recommendations?: unknown;
      featureVector?: unknown;
      createdAt?: unknown;
    };

    if (typeof parsed.score !== "number") return null;
    if (typeof parsed.label !== "string") return null;
    if (typeof parsed.modelVersion !== "string") return null;

    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      label: parsed.label.slice(0, 40),
      modelVersion: parsed.modelVersion.slice(0, 80),
      imageCount:
        typeof parsed.imageCount === "number"
          ? Math.max(0, Math.min(5, Math.round(parsed.imageCount)))
          : undefined,
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 3).map((item) => String(item).slice(0, 160))
        : [],
      featureVector:
        parsed.featureVector && typeof parsed.featureVector === "object"
          ? parsed.featureVector
          : undefined,
      createdAt:
        typeof parsed.createdAt === "string" ? parsed.createdAt.slice(0, 40) : undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const orderId = String(form.get("orderId") ?? "");
  const name = String(form.get("name") ?? "");
  const phone = String(form.get("phone") ?? "");
  const address = String(form.get("address") ?? "");
  const memo = String(form.get("memo") ?? "");
  const qualityReport = parseQualityReport(form.get("qualityReport"));
  const sheet = form.get("sheet");
  const photos = form.getAll("photos");

  if (!/^STK-\d{8}-[A-Z0-9]{4}$/.test(orderId)) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  if (!name.trim() || !phone.trim() || !address.trim()) {
    return NextResponse.json(
      { error: "Name, phone, and address are required." },
      { status: 400 }
    );
  }

  if (!(sheet instanceof File)) {
    return NextResponse.json(
      { error: "Generated sticker sheet is required." },
      { status: 400 }
    );
  }

  const orderDir = join(ORDERS_DIR, orderId);
  const photosDir = join(orderDir, "photos");
  await mkdir(photosDir, { recursive: true });

  await writeFile(
    join(orderDir, "order.json"),
    JSON.stringify(
      {
        orderId,
        name,
        phone,
        address,
        memo,
        status: "payment_pending",
        qualityReport,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  await writeFile(
    join(orderDir, "sticker-sheet-a6.png"),
    Buffer.from(await sheet.arrayBuffer())
  );

  let photoIndex = 1;
  for (const photo of photos) {
    if (!(photo instanceof File)) continue;
    const fileName = sanitizeFileName(photo.name || `photo-${photoIndex}.png`);
    await writeFile(
      join(photosDir, `${String(photoIndex).padStart(2, "0")}-${fileName}`),
      Buffer.from(await photo.arrayBuffer())
    );
    photoIndex += 1;
  }

  return NextResponse.json({
    orderId,
    savedPhotos: photoIndex - 1,
    status: "payment_pending",
  });
}
