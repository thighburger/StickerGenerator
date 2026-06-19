#!/usr/bin/env node
// 보고서용 스크린샷 자동 캡쳐 (Playwright headless Chromium).
// 사전 조건: docker compose up -d (next:3000, ml:8000), 선택적으로 MLflow UI(:5000).
// 실행: npm run capture
// 환경변수로 배포/Actions URL 추가 캡쳐 가능: APP_URL, ML_URL, MLFLOW_URL, RENDER_URL, ACTIONS_URL
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "docs/assets");
mkdirSync(OUT, { recursive: true });

const APP = process.env.APP_URL ?? "http://localhost:3000";
const ML = process.env.ML_URL ?? "http://localhost:8000";
const MLFLOW = process.env.MLFLOW_URL ?? "http://localhost:5000";

const TARGETS = [
  { name: "app-main", url: `${APP}/`, fullPage: true },
  { name: "admin-dashboard", url: `${APP}/admin`, fullPage: true },
  { name: "fastapi-docs", url: `${ML}/docs`, fullPage: false },
  { name: "model-info", url: `${ML}/model/info`, fullPage: false },
  { name: "health", url: `${ML}/health`, fullPage: false },
  { name: "logs-summary", url: `${ML}/logs/summary`, fullPage: false },
  { name: "mlflow-ui", url: MLFLOW, fullPage: false, optional: true },
];
if (process.env.RENDER_URL) {
  TARGETS.push({ name: "deploy-render-health", url: `${process.env.RENDER_URL}/health`, optional: true });
}
if (process.env.ACTIONS_URL) {
  TARGETS.push({ name: "github-actions", url: process.env.ACTIONS_URL, fullPage: true, optional: true });
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright 가 설치되어 있지 않습니다. 실행:\n" +
      "  cd pet-sticker-next && npm i -D playwright && npx playwright install chromium\n" +
      "  (또는 저장소 루트에서 npm i -D playwright)",
  );
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let ok = 0;
let skipped = 0;
for (const target of TARGETS) {
  const file = join(OUT, `${target.name}.png`);
  try {
    await page.goto(target.url, { waitUntil: "networkidle", timeout: 12000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: file, fullPage: Boolean(target.fullPage) });
    console.log(`  ✔ ${target.name}  ←  ${target.url}`);
    ok += 1;
  } catch (error) {
    skipped += 1;
    const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
    if (target.optional) console.log(`  ~ (선택) ${target.name} 건너뜀: ${msg}`);
    else console.log(`  ✘ ${target.name} 실패: ${msg}`);
  }
}

await browser.close();
console.log(`\n캡쳐 완료: ${ok} 성공, ${skipped} 건너뜀 → ${OUT}`);
console.log("로그인 필요한 대시보드(Render/Vercel)는 직접 캡쳐해 docs/assets/ 에 추가하세요.");
