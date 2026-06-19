#!/usr/bin/env node
// 기말 MLOps 프로젝트 통합 품질 게이트(하네스).
//   node scripts/final-harness.mjs           # 빠른 검증(quick)
//   node scripts/final-harness.mjs --full     # 전체 검증(+Next build, +Docker, +compose health)
// 환경변수:
//   HARNESS_STRICT=1  → 필수 ML 단계의 SKIP 을 FAIL 로 승격 (CI 에서 사용)
//   PET_STICKER_ML_PYTHON=/path/to/python  → ML 파이썬 인터프리터 지정
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ML = join(ROOT, "pet-sticker-ml");
const NEXT = join(ROOT, "pet-sticker-next");
const FULL = process.argv.includes("--full");
const STRICT = process.env.HARNESS_STRICT === "1";
const ML_SKIP = STRICT ? "FAIL" : "SKIP";

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m",
};
const results = [];

function section(title) {
  console.log(`\n${C.bold}${C.cyan}▌ ${title}${C.reset}`);
}
function record(name, status, detail = "", help = "") {
  results.push({ name, status });
  const tag =
    status === "PASS" ? `${C.green}PASS${C.reset}` :
    status === "FAIL" ? `${C.red}FAIL${C.reset}` :
    `${C.yellow}SKIP${C.reset}`;
  console.log(`  ${tag}  ${name}${detail ? `  ${C.dim}— ${detail}${C.reset}` : ""}`);
  if (status === "FAIL" && help) console.log(`         ${C.dim}↳ ${help}${C.reset}`);
}
function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 240000,
    killSignal: "SIGKILL",
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
  });
}
function tail(s, n = 1400) {
  if (!s) return "";
  return s.length > n ? "…" + s.slice(-n) : s.trim();
}
function failDetail(r, fallback = "") {
  if (r.error && r.error.code === "ETIMEDOUT") {
    return "시간초과 — iCloud dataless 파일 materialize 가능. 해당 디렉터리에서 직접 명령 1회 실행 후 재시도";
  }
  return tail((r.stdout || "") + (r.stderr || "")) || fallback;
}
function fileHas(path, needles) {
  if (!existsSync(path)) return { ok: false, missing: ["(파일 없음)"] };
  const text = readFileSync(path, "utf8");
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

// ── Python 인터프리터 탐색 ──────────────────────────────────────
const ML_ENV = { ...process.env, PYTHONPATH: join(ML, "src"), PYTHONWARNINGS: "ignore" };
function resolvePython() {
  const cands = [
    process.env.PET_STICKER_ML_PYTHON,
    join(ML, ".venv/bin/python"),
    "python3.12",
    "python3.11",
  ].filter(Boolean);
  for (const p of cands) {
    const r = sh(p, ["-c", "import mlflow,sklearn,fastapi,cv2,pandas,numpy"], { cwd: ML, env: ML_ENV });
    if (r.status === 0) return p;
  }
  return null;
}
const PY = resolvePython();
const PY_HELP =
  "ML 파이썬 환경 없음(3.11/3.12 + mlflow/sklearn). 실행: cd pet-sticker-ml && " +
  "uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt";

console.log(`${C.bold}기말 MLOps 하네스${C.reset}  (${FULL ? "full" : "quick"} 모드${STRICT ? ", strict" : ""})`);
console.log(`${C.dim}ML python: ${PY ?? "없음"}${C.reset}`);

// ── 1. 최종 보고서 ─────────────────────────────────────────────
section("최종 보고서");
{
  const report = join(ROOT, "docs/final_report.md");
  const needles = ["프로젝트 개요", "MLflow", "champion", "롤백", "재학습", "CI/CD", "Docker", "prediction"];
  const r = fileHas(report, needles);
  if (r.ok) record("final_report.md 존재 및 필수 섹션 포함", "PASS");
  else record("final_report.md 존재 및 필수 섹션 포함", "FAIL", `누락: ${r.missing.join(", ")}`, "docs/final_report.md 에 누락 키워드 섹션 추가");
}

// ── 2. Next.js ────────────────────────────────────────────────
section("Next.js");
{
  const hasModules = existsSync(join(NEXT, "node_modules"));
  if (!hasModules) {
    record("Next typecheck", STRICT ? "FAIL" : "SKIP", "node_modules 없음", "cd pet-sticker-next && npm ci");
  } else {
    const r = sh("npm", ["run", "typecheck"], { cwd: NEXT });
    if (r.status === 0) record("Next typecheck (tsc --noEmit)", "PASS");
    else record("Next typecheck (tsc --noEmit)", "FAIL", failDetail(r, "타입 오류"));
  }
  if (FULL) {
    if (!hasModules) record("Next production build", STRICT ? "FAIL" : "SKIP", "node_modules 없음", "cd pet-sticker-next && npm ci");
    else {
      const r = sh("npm", ["run", "build"], { cwd: NEXT, timeout: 360000 });
      if (r.status === 0) record("Next production build", "PASS");
      else record("Next production build", "FAIL", failDetail(r, "빌드 실패"));
    }
  }
}

// ── 3. ML 테스트 / 학습 / 런타임 ───────────────────────────────
section("ML 테스트 · MLflow · 런타임");
if (!PY) {
  for (const n of [
    "Python ML 테스트(pytest)", "챔피언 export 존재", "MLflow 학습 실행",
    "MLflow parameter 기록", "MLflow metric 기록", "MLflow artifact 기록",
    "챔피언 추론 동작", "예측 로그 생성", "피드백 로그 생성", "모델 정보 API 동작",
  ]) record(n, ML_SKIP, "Python 환경 없음", PY_HELP);
} else {
  const pytest = sh(PY, ["-m", "pytest", "-q"], { cwd: ML, env: ML_ENV });
  if (pytest.status === 0) record("Python ML 테스트(pytest)", "PASS", tail(pytest.stdout, 80));
  else record("Python ML 테스트(pytest)", "FAIL", failDetail(pytest, "테스트 실패"));

  const chk = sh(PY, [join(ROOT, "scripts/ml_harness_check.py")], { cwd: ML, env: ML_ENV });
  let parsed = null;
  try {
    const line = (chk.stdout || "").trim().split("\n").filter(Boolean).pop();
    parsed = JSON.parse(line);
  } catch {
    parsed = null;
  }
  const map = [
    ["champion_export", "챔피언 export 존재"],
    ["train_run", "MLflow 학습 실행"],
    ["mlflow_params", "MLflow parameter 기록"],
    ["mlflow_metrics", "MLflow metric 기록"],
    ["mlflow_artifacts", "MLflow artifact 기록"],
    ["predict", "챔피언 추론 동작"],
    ["prediction_log", "예측 로그 생성"],
    ["feedback_log", "피드백 로그 생성"],
    ["model_info_api", "모델 정보 API 동작"],
  ];
  if (!parsed) {
    for (const [, label] of map) record(label, "FAIL", "검증 스크립트 실패", tail(chk.stdout + chk.stderr));
  } else {
    for (const [key, label] of map) {
      const v = parsed[key];
      if (v === "ok") record(label, "PASS");
      else record(label, "FAIL", v ?? "결과 없음");
    }
  }
}

// ── 4. 앱 ↔ 모델 연동 (정적 검증) ──────────────────────────────
section("앱 ↔ ML 연동 (정적 검증)");
{
  const mlClient = fileHas(join(NEXT, "lib/ml-client.ts"), ["/predict", "/model/info", "modelVersion"]);
  const env = fileHas(join(NEXT, ".env.example"), ["ML_SERVICE_URL"]);
  const champ = fileHas(join(ML, "champion/metadata.json"), ['"alias"', "champion"]);
  const appRefs = mlClient.ok && env.ok && champ.ok;
  if (appRefs) record("앱이 champion 모델을 참조 (ml-client·env·metadata)", "PASS");
  else record("앱이 champion 모델을 참조", "FAIL",
    [!mlClient.ok && "ml-client", !env.ok && "env", !champ.ok && "metadata"].filter(Boolean).join(", "));

  const orders = fileHas(join(NEXT, "app/api/orders/route.ts"), ["mlReport", "order.json"]);
  record("주문 저장 시 ML 리포트 포함", orders.ok ? "PASS" : "FAIL", orders.ok ? "" : `누락: ${orders.missing.join(", ")}`);

  const admin = fileHas(join(NEXT, "app/admin/page.tsx"), ["modelVersion", "qualityClass"]);
  record("관리자 화면에 ML 정보 표시", admin.ok ? "PASS" : "FAIL", admin.ok ? "" : `누락: ${admin.missing.join(", ")}`);
}

// ── 5. CI/CD 워크플로 (정적 검증) ──────────────────────────────
section("CI/CD 워크플로");
{
  const ci = fileHas(join(ROOT, ".github/workflows/ci.yml"), ["typecheck", "pytest", "final-harness"]);
  record("ci.yml 이 하네스 검증을 재현", ci.ok ? "PASS" : "FAIL", ci.ok ? "" : `누락: ${ci.missing.join(", ")}`);
  const train = existsSync(join(ROOT, ".github/workflows/auto-train.yml"));
  record("자동 학습 워크플로(auto-train.yml) 존재", train ? "PASS" : "FAIL");
}

// ── 6. Docker (full) ──────────────────────────────────────────
if (FULL) {
  section("Docker (full)");
  const daemon = sh("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (daemon.status !== 0) {
    for (const n of ["ML Docker 빌드", "Next Docker 빌드", "compose 헬스체크"])
      record(n, "SKIP", "Docker 데몬 미실행", "Docker Desktop 실행 후 재시도");
  } else {
    const mlb = sh("docker", ["build", "-t", "pet-sticker-ml:harness", ML], { timeout: 600000 });
    record("ML Docker 빌드", mlb.status === 0 ? "PASS" : "FAIL", mlb.status === 0 ? "" : failDetail(mlb));
    const nxb = sh("docker", ["build", "-t", "pet-sticker-next:harness", NEXT], { timeout: 600000 });
    record("Next Docker 빌드", nxb.status === 0 ? "PASS" : "FAIL", nxb.status === 0 ? "" : failDetail(nxb));

    // compose 헬스체크: ml 컨테이너만 띄워 /health 폴링
    const up = sh("docker", ["compose", "up", "-d", "ml"]);
    if (up.status !== 0) {
      record("compose 헬스체크", "FAIL", "compose up 실패", tail(up.stderr));
    } else {
      let ok = false;
      for (let i = 0; i < 25; i += 1) {
        const h = sh("curl", ["-fsS", "http://localhost:8000/health"]);
        if (h.status === 0 && (h.stdout || "").includes('"status":"ok"')) { ok = true; break; }
        spawnSync("sleep", ["2"]);
      }
      record("compose 헬스체크 (/health)", ok ? "PASS" : "FAIL", ok ? "" : "기동/응답 실패");
      sh("docker", ["compose", "down"]);
    }
  }
}

// ── 요약 ──────────────────────────────────────────────────────
const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
const skip = results.filter((r) => r.status === "SKIP").length;
console.log(`\n${C.bold}요약${C.reset}: ${C.green}${pass} PASS${C.reset} · ${C.red}${fail} FAIL${C.reset} · ${C.yellow}${skip} SKIP${C.reset}`);
if (fail > 0) {
  console.log(`${C.red}하네스 실패 — 위 FAIL 항목의 ↳ 안내와 로그를 확인하세요.${C.reset}`);
  process.exit(1);
}
console.log(`${C.green}모든 필수 검증 통과.${C.reset}`);
process.exit(0);
