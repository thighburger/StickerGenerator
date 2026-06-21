"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "./login.module.css";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "로그인에 실패했습니다.");
    } catch {
      setError("로그인 요청 중 오류가 발생했습니다.");
    }
    setLoading(false);
  }

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1>운영 관리자 로그인</h1>
        <p className={styles.sub}>주문·모델·로그 대시보드는 관리자 전용입니다.</p>
        <input
          className={styles.input}
          type="password"
          placeholder="관리자 비밀번호"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.button} type="submit" disabled={loading}>
          {loading ? "확인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
