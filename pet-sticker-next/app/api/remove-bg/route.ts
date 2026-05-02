import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "REMOVE_BG_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Upload an image file." }, { status: 400 });
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Use an image under 12 MB." },
      { status: 400 },
    );
  }

  const removeBgFormData = new FormData();
  removeBgFormData.append("image_file", image, image.name || "upload.png");
  removeBgFormData.append("size", "auto");
  removeBgFormData.append("format", "png");

  let response: Response;
  try {
    response = await fetch(REMOVE_BG_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: removeBgFormData,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach remove.bg." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    const message =
      response.status === 429
        ? "remove.bg rate limit exceeded. Wait and try fewer images."
        : `remove.bg failed with HTTP ${response.status}.`;

    return NextResponse.json(
      { error: message, detail: detail.slice(0, 500) },
      { status: response.status },
    );
  }

  const png = await response.arrayBuffer();
  return new NextResponse(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

