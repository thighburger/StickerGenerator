"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";

type Props = {
  orderId: string;
  status: OrderStatus;
  readOnly?: boolean;
  className?: string;
};

// 관리자 주문 상태 변경 셀렉트. 샘플 주문(readOnly)은 뱃지로만 표시.
export default function OrderStatusControl({ orderId, status, readOnly, className }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(status);
  const [busy, setBusy] = useState(false);

  if (readOnly) {
    return <span className={className}>{status}</span>;
  }

  async function change(next: OrderStatus) {
    const previous = value;
    setBusy(true);
    setValue(next);
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
      if (response.ok) {
        router.refresh();
      } else {
        setValue(previous);
      }
    } catch {
      setValue(previous);
    }
    setBusy(false);
  }

  return (
    <select
      className={className}
      value={value}
      disabled={busy}
      onChange={(event) => change(event.target.value as OrderStatus)}
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
