"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { className?: string; buttonClassName?: string; resultClassName?: string };

// 관리자 재학습 트리거. /api/admin/retrain → ML /admin/retrain(데이터 v2 학습→승격→챔피언 reload).
export default function RetrainButton({ className, buttonClassName, resultClassName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function retrain() {
    setBusy(true);
    setResult("재학습 실행 중... (모델 학습·평가에 수십 초 소요될 수 있어요)");
    try {
      const response = await fetch("/api/admin/retrain", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (response.ok && data) {
        setResult(
          data.promoted
            ? `재학습 완료 — 챔피언 교체됨 (v${data.champion_version}, macro-F1 ${data.previous_macro_f1} → ${data.new_macro_f1})`
            : `재학습 완료 — 기존 챔피언 유지(개선 없음, macro-F1 ${data.new_macro_f1})`,
        );
        router.refresh();
      } else {
        setResult(`재학습 실패: ${data?.error ?? response.status}`);
      }
    } catch {
      setResult("재학습 요청 실패 — ML 서비스 상태를 확인하세요.");
    }
    setBusy(false);
  }

  return (
    <div className={className}>
      <button
        type="button"
        className={buttonClassName}
        onClick={retrain}
        disabled={busy}
      >
        {busy ? "재학습 중..." : "🔁 재학습 트리거"}
      </button>
      {result && <span className={resultClassName}>{result}</span>}
    </div>
  );
}
