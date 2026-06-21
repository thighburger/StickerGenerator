import { NextResponse } from "next/server";

import { sendFeedback } from "@/lib/ml-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const result = await sendFeedback(body as Record<string, unknown>);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
