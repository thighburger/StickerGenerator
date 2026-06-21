import { NextResponse } from "next/server";

import { mlServiceUrl } from "@/lib/ml-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 전용(미들웨어로 /api/admin/* 보호). ML 서비스 재학습을 트리거한다.
export async function POST() {
  try {
    const response = await fetch(`${mlServiceUrl()}/admin/retrain`, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => null);
    return NextResponse.json(data ?? { error: "ML 응답 없음" }, {
      status: response.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "재학습 트리거 실패";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
