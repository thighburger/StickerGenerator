#!/usr/bin/env node
// 최종 보고서 MD → 단일 PDF (이미지 base64 임베드, 한글 폰트, Playwright/Chromium).
// 실행: node scripts/build-report-pdf.mjs   (또는 npm run report:pdf)
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DOCS = join(ROOT, "docs");
const MD_PATH = join(DOCS, "final_report.md");
const PDF_PATH = join(DOCS, "final_report.pdf");

const { marked } = await import("marked");
const { chromium } = await import("playwright");

let md = readFileSync(MD_PATH, "utf-8");

// 이미지(assets/x.png)를 base64 data URI 로 치환 → 자체 완결 PDF
md = md.replace(/!\[([^\]]*)\]\((assets\/[^)]+)\)/g, (whole, alt, rel) => {
  const file = resolve(DOCS, rel);
  if (!existsSync(file)) return whole;
  const b64 = readFileSync(file).toString("base64");
  return `![${alt}](data:image/png;base64,${b64})`;
});

const body = marked.parse(md, { gfm: true, breaks: false });

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",-apple-system,sans-serif;
    color: #1f2937; line-height: 1.6; font-size: 12.5px;
    max-width: 820px; margin: 0 auto; padding: 8px 4px;
  }
  h1 { font-size: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 26px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
  h3 { font-size: 15px; margin-top: 18px; color: #111827; }
  h2, h3 { page-break-after: avoid; }
  p, li { font-size: 12.5px; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 11.5px;
    font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
  pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px;
    font-size: 9.5px; line-height: 1.5; page-break-inside: avoid;
    white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11.5px;
    page-break-inside: avoid; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 800; }
  blockquote { border-left: 4px solid #93c5fd; background: #f8fafc; margin: 10px 0;
    padding: 8px 14px; color: #475569; }
  img { max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px;
    margin: 10px 0; page-break-inside: avoid; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 22px 0; }
  a { color: #2563eb; word-break: break-all; }
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
  path: PDF_PATH,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();
console.log(`PDF 생성 완료 → ${PDF_PATH}`);
