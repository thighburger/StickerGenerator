import Link from "next/link";

import {
  type LogSummary,
  type ModelInfo,
  getLogSummary,
  getModelInfo,
  mlServiceUrl,
} from "@/lib/ml-client";
import { DEFAULT_STATUS } from "@/lib/order-status";
import { listOrders } from "@/lib/order-store";
import LogoutButton from "./LogoutButton";
import OrderStatusControl from "./OrderStatusControl";
import RetrainButton from "./RetrainButton";
import styles from "./admin.module.css";

const QUALITY_CLASSES = ["제작 적합", "보정 권장", "재촬영 권장"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classTone(qualityClass: string): string {
  if (qualityClass === "제작 적합") return styles.pass;
  if (qualityClass === "보정 권장") return styles.retouch;
  return styles.reshoot;
}

export default async function AdminPage() {
  const { orders, usingSamples } = await listOrders();

  const [modelInfo, logSummary] = await Promise.all([
    getModelInfo(),
    getLogSummary(),
  ]);

  // 주문 mlReport 기반 통계 (ML 서비스 미가동에도 동작)
  const okReports = orders.flatMap((order) =>
    order.mlReport && order.mlReport.status === "ok" ? [order.mlReport] : [],
  );
  const classDist: Record<string, number> = {};
  let scoreSum = 0;
  for (const report of okReports) {
    classDist[report.qualityClass] = (classDist[report.qualityClass] ?? 0) + 1;
    scoreSum += report.score;
  }
  const meanScore = okReports.length
    ? Math.round((scoreSum / okReports.length) * 10) / 10
    : null;

  const info: ModelInfo = modelInfo;
  const logs: LogSummary = logSummary;

  // 모니터링 차트 데이터: 예측 로그(class_counts) 우선, 없으면 주문 mlReport 기반
  const logsOk = logs.status === "ok" ? (logs as Record<string, unknown>) : null;
  const logCounts = (logsOk?.class_counts as Record<string, number> | undefined) ?? null;
  const chartCounts: Record<string, number> = logCounts ?? classDist;
  const chartMax = Math.max(1, ...QUALITY_CLASSES.map((c) => chartCounts[c] ?? 0));
  const chartTotal = QUALITY_CLASSES.reduce((sum, c) => sum + (chartCounts[c] ?? 0), 0);
  const chartMeanScore =
    logsOk && typeof logsOk.mean_score === "number" ? (logsOk.mean_score as number) : meanScore;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>운영 관리자 대시보드</h1>
          <p className={styles.subtitle}>
            주문별 ML 품질 점수 · 챔피언 모델 버전 · 예측/피드백 로그
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.homeLink} href="/">
            ← 생성기로
          </Link>
          <LogoutButton className={styles.logoutButton} />
        </div>
      </header>

      {/* 챔피언 모델 정보 */}
      <section className={styles.card}>
        <h2>챔피언 모델</h2>
        {info.status === "ok" ? (
          <div className={styles.modelGrid}>
            <div>
              <span className={styles.label}>모델</span>
              <strong>{info.modelName}</strong>
            </div>
            <div>
              <span className={styles.label}>버전</span>
              <strong className={styles.modelVersion}>{info.modelVersion}</strong>
            </div>
            <div>
              <span className={styles.label}>데이터</span>
              <strong>{info.dataVersion}</strong>
            </div>
            <div>
              <span className={styles.label}>macro-F1</span>
              <strong>{info.metrics?.macro_f1 ?? "-"}</strong>
            </div>
            <div>
              <span className={styles.label}>정확도</span>
              <strong>{info.metrics?.accuracy ?? "-"}</strong>
            </div>
            <div>
              <span className={styles.label}>학습 시각</span>
              <strong className={styles.small}>{info.trainedAt}</strong>
            </div>
          </div>
        ) : (
          <p className={styles.unavailable}>
            ML 서비스에 연결하지 못했습니다 ({info.reason}). 서비스 주소:{" "}
            <code>{mlServiceUrl()}</code>
          </p>
        )}
      </section>

      {/* 주문 ML 통계 */}
      <section className={styles.statRow}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{orders.length}</span>
          <span className={styles.statLabel}>주문 수</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{meanScore ?? "-"}</span>
          <span className={styles.statLabel}>평균 품질점수</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{classDist["제작 적합"] ?? 0}</span>
          <span className={styles.statLabel}>제작 적합</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{classDist["보정 권장"] ?? 0}</span>
          <span className={styles.statLabel}>보정 권장</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{classDist["재촬영 권장"] ?? 0}</span>
          <span className={styles.statLabel}>재촬영 권장</span>
        </div>
      </section>

      {/* ML 모니터링 + 재학습 트리거 */}
      <section className={styles.card}>
        <div className={styles.monitorHead}>
          <h2>ML 모니터링 · 재학습</h2>
          <RetrainButton
            className={styles.retrain}
            buttonClassName={styles.retrainButton}
            resultClassName={styles.retrainResult}
          />
        </div>
        <div className={styles.chartGrid}>
          <div>
            <div className={styles.chartTitle}>품질 판정 분포 ({chartTotal}건)</div>
            <div className={styles.bars}>
              {QUALITY_CLASSES.map((c) => {
                const count = chartCounts[c] ?? 0;
                const pct = Math.round((count / chartMax) * 100);
                return (
                  <div className={styles.barRow} key={c}>
                    <span className={styles.barLabel}>{c}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${classTone(c)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.barCount}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.scoreBox}>
            <span className={styles.label}>평균 품질점수</span>
            <strong className={styles.scoreBig}>{chartMeanScore ?? "-"}</strong>
            <span className={styles.small}>
              챔피언 {info.status === "ok" ? info.modelVersion : "-"}
            </span>
          </div>
        </div>
      </section>

      {/* 주문 목록 */}
      <section className={styles.card}>
        <h2>
          주문 목록 {usingSamples && <span className={styles.sampleTag}>샘플 데이터</span>}
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>주문번호</th>
                <th>이름</th>
                <th>생성시각</th>
                <th>품질판정</th>
                <th>점수</th>
                <th>모델버전</th>
                <th>주문상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const report = order.mlReport;
                const ok = report?.status === "ok";
                return (
                  <tr key={order.orderId}>
                    <td className={styles.mono}>{order.orderId}</td>
                    <td>{order.name ?? "-"}</td>
                    <td className={styles.small}>{order.createdAt ?? "-"}</td>
                    <td>
                      {ok ? (
                        <span className={`${styles.badge} ${classTone(report.qualityClass)}`}>
                          {report.qualityClass}
                        </span>
                      ) : (
                        <span className={styles.badgeMuted}>미분석</span>
                      )}
                    </td>
                    <td>{ok ? Math.round(report.score) : "-"}</td>
                    <td className={styles.mono}>{ok ? report.modelVersion : "-"}</td>
                    <td>
                      <OrderStatusControl
                        orderId={order.orderId}
                        status={order.status ?? DEFAULT_STATUS}
                        readOnly={usingSamples}
                        className={styles.statusSelect}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 예측/피드백 로그 요약 */}
      <section className={styles.card}>
        <h2>운영 로그 요약 (예측 · 피드백)</h2>
        {logs.status === "ok" ? (
          <div className={styles.modelGrid}>
            <div>
              <span className={styles.label}>예측 요청</span>
              <strong>{String(logs.prediction_count ?? 0)}건</strong>
            </div>
            <div>
              <span className={styles.label}>평균 점수</span>
              <strong>{String(logs.mean_score ?? "-")}</strong>
            </div>
            <div>
              <span className={styles.label}>피드백</span>
              <strong>{String(logs.feedback_count ?? 0)}건</strong>
            </div>
            <div>
              <span className={styles.label}>정정 건수</span>
              <strong>{String(logs.correction_count ?? 0)}</strong>
            </div>
          </div>
        ) : (
          <p className={styles.unavailable}>
            예측 로그 요약을 불러오지 못했습니다 ({logs.reason}). ML 서비스
            <code> {mlServiceUrl()}/logs/summary </code>
            가 동작 중인지 확인하세요. 위 주문 통계는 저장된 주문 파일로 계산됩니다.
          </p>
        )}
      </section>
    </main>
  );
}
