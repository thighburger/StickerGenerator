import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";

type StoredOrder = {
  orderId: string;
  name: string;
  phone: string;
  address: string;
  memo: string;
  status: string;
  qualityReport?: {
    score: number;
    label: string;
    modelVersion: string;
    recommendations?: string[];
  } | null;
  createdAt: string;
};

const ORDERS_DIR =
  process.env.ORDER_STORAGE_DIR ??
  (process.env.VERCEL ? "/tmp/pet-sticker-orders" : join(process.cwd(), "orders"));
const ORDER_STATUSES = [
  ["payment_pending", "결제대기"],
  ["making", "제작중"],
  ["shipped", "배송완료"],
];

async function readOrders() {
  try {
    const entries = await readdir(ORDERS_DIR, { withFileTypes: true });
    const orders = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const data = await readFile(
              join(ORDERS_DIR, entry.name, "order.json"),
              "utf8"
            );
            return JSON.parse(data) as StoredOrder;
          } catch {
            return null;
          }
        })
    );

    return orders
      .filter((order): order is StoredOrder => Boolean(order))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function updateOrderStatus(formData: FormData) {
  "use server";

  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowedStatuses = ORDER_STATUSES.map(([value]) => value);

  if (!/^STK-\d{8}-[A-Z0-9]{4}$/.test(orderId)) return;
  if (!allowedStatuses.includes(status)) return;

  const orderPath = join(ORDERS_DIR, orderId, "order.json");
  const data = JSON.parse(await readFile(orderPath, "utf8")) as StoredOrder;
  await writeFile(
    orderPath,
    JSON.stringify({ ...data, status, updatedAt: new Date().toISOString() }, null, 2)
  );
  revalidatePath("/admin/orders");
}

export default async function AdminOrdersPage() {
  const orders = await readOrders();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Admin</span>
          <h1>주문 확인</h1>
        </div>
        <span className={styles.count}>{orders.length}건</span>
      </header>

      {orders.length === 0 ? (
        <section className={styles.empty}>
          아직 저장된 주문이 없습니다.
        </section>
      ) : (
        <section className={styles.list}>
          {orders.map((order) => (
            <article className={styles.order} key={order.orderId}>
              <div className={styles.orderHeader}>
                <strong>{order.orderId}</strong>
                <span>{order.status}</span>
              </div>
              <dl>
                <div>
                  <dt>이름</dt>
                  <dd>{order.name}</dd>
                </div>
                <div>
                  <dt>연락처</dt>
                  <dd>{order.phone}</dd>
                </div>
                <div>
                  <dt>배송주소</dt>
                  <dd>{order.address}</dd>
                </div>
                <div>
                  <dt>요청사항</dt>
                  <dd>{order.memo || "-"}</dd>
                </div>
                <div>
                  <dt>생성일</dt>
                  <dd>{new Date(order.createdAt).toLocaleString("ko-KR")}</dd>
                </div>
                <div>
                  <dt>AI 품질 점수</dt>
                  <dd>
                    {order.qualityReport
                      ? `${order.qualityReport.score}점 · ${order.qualityReport.label}`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>모델 버전</dt>
                  <dd>{order.qualityReport?.modelVersion ?? "-"}</dd>
                </div>
              </dl>
              {order.qualityReport?.recommendations &&
                order.qualityReport.recommendations.length > 0 && (
                  <div className={styles.qualityNote}>
                    {order.qualityReport.recommendations.join(" / ")}
                  </div>
                )}
              <p className={styles.path}>
                파일 위치: orders/{order.orderId}
              </p>
              <form action={updateOrderStatus} className={styles.statusForm}>
                <input type="hidden" name="orderId" value={order.orderId} />
                <select name="status" defaultValue={order.status}>
                  {ORDER_STATUSES.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit">상태 변경</button>
              </form>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
