import { NextResponse } from "next/server";

import { isOrderStatus } from "@/lib/order-status";
import { updateOrderStatus } from "@/lib/order-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 전용(미들웨어로 /api/admin/* 보호). 주문 상태를 변경한다.
export async function POST(
  request: Request,
  { params }: { params: { orderId: string } },
) {
  const body = await request.json().catch(() => null);
  if (!isOrderStatus(body?.status)) {
    return NextResponse.json({ error: "유효하지 않은 상태입니다." }, { status: 400 });
  }
  const updated = await updateOrderStatus(params.orderId, body.status);
  if (!updated) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다(샘플 주문은 변경 불가)." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, status: updated.status });
}
