import { NextResponse } from "next/server";

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";

export async function POST(request: Request) {
  const apiKey = process.env.REMOVE_BG_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing REMOVE_BG_API_KEY in .env.local." },
      { status: 500 },
    );
  }

  const incomingForm = await request.formData();
  const image = incomingForm.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Upload one image file." },
      { status: 400 },
    );
  }

  const removeBgForm = new FormData();
  removeBgForm.append("image_file", image, image.name || "dog-photo.png");
  removeBgForm.append("size", "auto");
  removeBgForm.append("format", "png");

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: removeBgForm,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `remove.bg failed: ${detail || response.statusText}` },
      { status: response.status },
    );
  }

  const cutout = await response.arrayBuffer();

  return new Response(cutout, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
