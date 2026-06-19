import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { type MlReport, requestQualityPrediction } from "@/lib/ml-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDERS_DIR = path.join(process.cwd(), "orders");

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 폼 데이터입니다." }, { status: 400 });
  }

  const orderId = String(form.get("orderId") ?? "").trim();
  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return NextResponse.json({ error: "유효한 orderId 가 필요합니다." }, { status: 400 });
  }

  const order = {
    orderId,
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    address: String(form.get("address") ?? ""),
    memo: String(form.get("memo") ?? ""),
    createdAt: new Date().toISOString(),
    photos: [] as string[],
    mlReport: { status: "unavailable", reason: "예측 미수행" } as MlReport,
  };

  const orderDir = path.join(ORDERS_DIR, orderId);
  const photosDir = path.join(orderDir, "photos");

  try {
    await fs.mkdir(photosDir, { recursive: true });

    const sheet = form.get("sheet");
    if (sheet instanceof File) {
      const sheetBuffer = Buffer.from(await sheet.arrayBuffer());
      await fs.writeFile(path.join(orderDir, "sheet.png"), sheetBuffer);
    }

    const photos = form.getAll("photos");
    let firstPhoto: Buffer | null = null;
    for (let i = 0; i < photos.length; i += 1) {
      const photo = photos[i];
      if (photo instanceof File) {
        const buffer = Buffer.from(await photo.arrayBuffer());
        const filename = `photo-${i + 1}-${sanitize(photo.name)}`;
        await fs.writeFile(path.join(photosDir, filename), buffer);
        order.photos.push(filename);
        if (firstPhoto === null) {
          firstPhoto = buffer;
        }
      }
    }

    // ML 품질 예측: 업로드한 첫 사진 기준 (없으면 시안 PNG)
    if (firstPhoto) {
      order.mlReport = await requestQualityPrediction(
        new Blob([firstPhoto], { type: "image/png" }),
        `${orderId}-photo.png`,
      );
    } else {
      const sheet = form.get("sheet");
      if (sheet instanceof File) {
        order.mlReport = await requestQualityPrediction(
          new Blob([await sheet.arrayBuffer()], { type: "image/png" }),
          `${orderId}-sheet.png`,
        );
      }
    }

    await fs.writeFile(
      path.join(orderDir, "order.json"),
      JSON.stringify(order, null, 2),
      "utf-8",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "주문 저장 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { orderId, mlReport: order.mlReport },
    { status: 201 },
  );
}
