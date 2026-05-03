import { accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
  "app",
];

function fail(message) {
  console.error(`\n[dev preflight] ${message}\n`);
  process.exit(1);
}

for (const file of requiredFiles) {
  try {
    accessSync(join(root, file), constants.R_OK);
  } catch {
    fail(`Required project file is missing or unreadable: ${file}`);
  }
}

try {
  accessSync(join(root, "node_modules", "next", "dist", "bin", "next"), constants.R_OK);
} catch {
  fail("Next is not installed. Run `npm ci` before `npm run dev`.");
}

if (process.platform === "darwin") {
  const pathsToCheck = [
    "package.json",
    "package-lock.json",
    "next.config.mjs",
    "tsconfig.json",
    "app",
    "node_modules",
  ];

  for (const envFile of [".env.local", ".env.development.local", ".env"]) {
    try {
      accessSync(join(root, envFile), constants.F_OK);
      pathsToCheck.push(envFile);
    } catch {
      // Missing env files are fine; Next can start without them.
    }
  }

  const datalessFiles = execFileSync(
    "find",
    [...pathsToCheck, "-flags", "+dataless", "-print"],
    { cwd: root, encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  if (datalessFiles.length > 0) {
    const preview = datalessFiles.slice(0, 20).join("\n");
    const more = datalessFiles.length > 20 ? `\n...and ${datalessFiles.length - 20} more` : "";
    fail(
      "macOS dataless files detected. These files can make Next hang while reading them.\n" +
        `${preview}${more}\n\n` +
        "Move the project out of cloud-optimized Desktop/iCloud storage, then restore source files and run `npm ci`."
    );
  }
}
