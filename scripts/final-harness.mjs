#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");
const results = [];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runStep({ name, command, args = [], cwd = root, env = {}, timeoutMs = 120000, optional = false }) {
  return new Promise((resolveStep) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      const status = optional ? "SKIP" : "FAIL";
      results.push({
        name,
        status,
        detail: `${formatCommand(command, args)} could not start: ${error.message}`,
        elapsedMs: Date.now() - startedAt,
      });
      resolveStep(status);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      const output = `${stdout}${stderr}`.trim();
      const status = timedOut ? "FAIL" : code === 0 ? "PASS" : optional ? "SKIP" : "FAIL";
      results.push({
        name,
        status,
        detail: timedOut
          ? `Timed out after ${timeoutMs / 1000}s: ${formatCommand(command, args)}`
          : output.slice(-1800),
        elapsedMs,
      });
      resolveStep(status);
    });
  });
}

function checkFile(name, path, { minBytes = 1 } = {}) {
  const absolute = resolve(root, path);
  const ok = existsSync(absolute) && statSync(absolute).size >= minBytes;
  results.push({
    name,
    status: ok ? "PASS" : "FAIL",
    detail: ok ? path : `${path} is missing or empty`,
    elapsedMs: 0,
  });
  return ok;
}

async function hasPythonModule(moduleName) {
  const status = await runStep({
    name: `python module: ${moduleName}`,
    command: "python3",
    args: ["-c", `import ${moduleName}`],
    timeoutMs: 15000,
    optional: true,
  });
  return status === "PASS";
}

async function main() {
  console.log(`Final project harness (${full ? "full" : "quick"} mode)`);

  checkFile("final report exists", "final_report.md");
  checkFile("champion app model exists", "pet-sticker-next/lib/ml/sticker-quality-model.json");
  checkFile("champion registry exists", "pet-sticker-ml/model-registry/sticker-quality/champion.json");

  await runStep({
    name: "git status",
    command: "git",
    args: ["status", "--short", "--branch"],
    timeoutMs: 20000,
    optional: true,
  });

  await runStep({
    name: "python syntax",
    command: "python3",
    args: [
      "-m",
      "py_compile",
      "pet-sticker-ml/src/pet_sticker_ml/__init__.py",
      "pet-sticker-ml/src/pet_sticker_ml/features.py",
      "pet-sticker-ml/src/pet_sticker_ml/model_runtime.py",
      "pet-sticker-ml/src/pet_sticker_ml/train.py",
      "pet-sticker-ml/src/pet_sticker_ml/rollback.py",
    ],
    timeoutMs: 30000,
  });

  const hasPytest = await hasPythonModule("pytest");
  const hasMlflow = await hasPythonModule("mlflow");
  const hasSklearn = await hasPythonModule("sklearn");

  if (hasPytest) {
    await runStep({
      name: "ML unit tests",
      command: "python3",
      args: ["-m", "pytest", "-q", "pet-sticker-ml/tests"],
      env: { PYTHONPATH: "pet-sticker-ml/src" },
      timeoutMs: 120000,
    });
  }

  if (hasMlflow && hasSklearn) {
    await runStep({
      name: "MLflow training dry run",
      command: "python3",
      args: [
        "-m",
        "pet_sticker_ml.train",
        "--tracking-uri",
        "file:/tmp/pet-sticker-harness-mlruns",
        "--model-out",
        "/tmp/pet-sticker-harness-model.json",
        "--registry-dir",
        "/tmp/pet-sticker-harness-registry",
        "--n-samples",
        "200",
        "--seed",
        "42",
      ],
      env: { PYTHONPATH: "pet-sticker-ml/src" },
      timeoutMs: 180000,
    });
  }

  await runStep({
    name: "Next typecheck",
    command: "npm",
    args: ["run", "typecheck"],
    cwd: resolve(root, "pet-sticker-next"),
    timeoutMs: 180000,
  });

  if (full) {
    await runStep({
      name: "Next production build",
      command: "npm",
      args: ["run", "build"],
      cwd: resolve(root, "pet-sticker-next"),
      timeoutMs: 240000,
    });
    await runStep({
      name: "Docker build",
      command: "docker",
      args: ["build", "-t", "pet-sticker-next:harness", "pet-sticker-next"],
      timeoutMs: 300000,
    });
  }

  console.log("\nHarness summary");
  for (const result of results) {
    const seconds = (result.elapsedMs / 1000).toFixed(1);
    console.log(`- ${result.status} ${result.name} (${seconds}s)`);
    if (result.detail) {
      console.log(`  ${result.detail.replace(/\n/g, "\n  ")}`);
    }
  }

  const failed = results.some((result) => result.status === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
