import { NextResponse } from "next/server";

import { getModelInfo } from "@/lib/ml-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getModelInfo());
}
