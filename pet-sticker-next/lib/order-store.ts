// 주문 저장소 추상화 (서버 전용).
// 현재 구현은 파일시스템(orders/) 기반이며, 읽기/목록/상태변경/저장을 한 곳에서 관리한다.
// 이 추상화 덕분에 추후 DB(Supabase/Postgres 등)로 교체해도 호출부는 변경되지 않는다.
import { promises as fs } from "fs";
import path from "path";

import type { MlReport } from "./ml-client";
import { DEFAULT_STATUS, type OrderStatus } from "./order-status";

export type Order = {
  orderId: string;
  name?: string;
  phone?: string;
  address?: string;
  memo?: string;
  createdAt?: string;
  status?: OrderStatus;
  photos?: string[];
  mlReport?: MlReport;
};

const ORDERS_DIR = path.join(process.cwd(), "orders");
const SAMPLE_DIR = path.join(process.cwd(), "sample-orders");

function isSafeOrderId(orderId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(orderId);
}

async function readOrdersFrom(dir: string): Promise<Order[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const orders: Order[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await fs.readFile(path.join(dir, entry.name, "order.json"), "utf-8");
        const order = JSON.parse(raw) as Order;
        order.status = order.status ?? DEFAULT_STATUS;
        orders.push(order);
      } catch {
        // 손상/누락 주문은 건너뜀
      }
    }
    return orders;
  } catch {
    return [];
  }
}

export async function listOrders(): Promise<{ orders: Order[]; usingSamples: boolean }> {
  const runtime = await readOrdersFrom(ORDERS_DIR);
  const samples = runtime.length ? [] : await readOrdersFrom(SAMPLE_DIR);
  const usingSamples = runtime.length === 0 && samples.length > 0;
  const orders = [...runtime, ...samples].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  return { orders, usingSamples };
}

export async function saveOrder(order: Order): Promise<void> {
  if (!isSafeOrderId(order.orderId)) throw new Error("invalid orderId");
  const dir = path.join(ORDERS_DIR, order.orderId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "order.json"),
    JSON.stringify({ status: DEFAULT_STATUS, ...order }, null, 2),
    "utf-8",
  );
}

// 런타임 주문(orders/)만 상태 변경 가능. 샘플 주문은 읽기 전용 → null 반환.
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<Order | null> {
  if (!isSafeOrderId(orderId)) return null;
  const file = path.join(ORDERS_DIR, orderId, "order.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    const order = JSON.parse(raw) as Order;
    order.status = status;
    await fs.writeFile(file, JSON.stringify(order, null, 2), "utf-8");
    return order;
  } catch {
    return null;
  }
}
