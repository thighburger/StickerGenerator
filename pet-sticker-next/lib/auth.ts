// 관리자 세션 인증 (Edge/Node 공용 — Web Crypto 사용).
// 쿠키에는 ADMIN_SECRET 기반 HMAC 토큰을 저장하고, 미들웨어가 이를 검증한다.
// 비밀번호는 로그인 시에만 확인하며 쿠키/클라이언트로 노출되지 않는다.

export const ADMIN_COOKIE = "admin_session";

const SECRET = process.env.ADMIN_SECRET ?? "dev-admin-secret-change-me";
const SESSION_MESSAGE = "pet-sticker-admin-v1";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(signature);
}

export async function sessionToken(): Promise<string> {
  return hmacHex(SESSION_MESSAGE);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  return timingSafeEqual(cookieValue, await sessionToken());
}

export function expectedPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "admin1234";
}
