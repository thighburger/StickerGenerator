"use client";

import { useState } from "react";

import styles from "../page.module.css";

const QUALITY_CLASSES = ["제작 적합", "보정 권장", "재촬영 권장"];

type Props = {
  requestId: string;
  predictedClass: string;
  orderId?: string;
};

// ML 품질 판정에 대한 사용자 피드백 위젯.
// "정확해요"는 예측=정답, "다른 판정"은 사용자가 고른 클래스로 교정한다.
// /api/feedback → ML /feedback → 피드백 로그(재학습 데이터). human-in-the-loop.
export default function MlFeedback({ requestId, predictedClass, orderId }: Props) {
  const [done, setDone] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(correctedClass: string) {
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          predictedClass,
          correctedClass,
          orderId,
          note: correctedClass === predictedClass ? "사용자 확인" : "사용자 교정",
        }),
      });
    } catch {
      // 피드백 실패는 사용자 흐름을 막지 않음
    }
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <div className={styles.feedbackDone}>
        피드백 감사합니다 — 모델 개선(재학습)에 반영됩니다.
      </div>
    );
  }

  return (
    <div className={styles.feedback}>
      <span className={styles.feedbackLabel}>이 품질 판정이 정확한가요?</span>
      {!correcting ? (
        <div className={styles.feedbackButtons}>
          <button
            type="button"
            className={styles.feedbackYes}
            onClick={() => send(predictedClass)}
            disabled={busy}
          >
            👍 정확해요
          </button>
          <button
            type="button"
            className={styles.feedbackNo}
            onClick={() => setCorrecting(true)}
            disabled={busy}
          >
            ✏️ 다른 판정
          </button>
        </div>
      ) : (
        <div className={styles.feedbackButtons}>
          {QUALITY_CLASSES.filter((c) => c !== predictedClass).map((c) => (
            <button
              key={c}
              type="button"
              className={styles.feedbackNo}
              onClick={() => send(c)}
              disabled={busy}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
