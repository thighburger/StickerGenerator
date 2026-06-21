// 주문 상태 정의 (클라이언트/서버 공용 — Node 모듈 import 없음).
export const ORDER_STATUSES = [
  "접수됨",
  "결제확인",
  "제작중",
  "배송중",
  "배송완료",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DEFAULT_STATUS: OrderStatus = "접수됨";

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
