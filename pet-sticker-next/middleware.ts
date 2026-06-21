import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ADMIN_COOKIE, isValidSession } from "@/lib/auth";

// /admin 이하 모든 경로를 보호한다(로그인 페이지 제외).
// 유효한 관리자 세션 쿠키가 없으면 /admin/login 으로 리다이렉트.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }
  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSession(cookie)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
