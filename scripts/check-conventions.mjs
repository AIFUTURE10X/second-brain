/**
 * Conventions checker — deterministic eval (agent-harness spec, Layer 1A).
 * Zero dependencies: needs only node + git. Existing violations are
 * grandfathered in scripts/conventions-baseline.json; the check fails only
 * when a file gets WORSE than its baseline (ratchet).
 *
 *   node scripts/check-conventions.mjs                   check
 *   node scripts/check-conventions.mjs --update-baseline re-snapshot baseline
 */
const CONFIG = {"maxLines":{"limit":300,"include":["components/","lib/"],"exclude":[]},"noConsoleLog":{"include":["app/","components/","lib/"],"exclude":[]},"boundedFindMany":{"include":["."]}};

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repoRoot, "scripts", "conventions-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

const EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const allFiles = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter((f) => EXT.test(f))
  .filter((f) => !f.startsWith("scripts/"));

function pick(rule) {
  return allFiles
    .filter((f) => rule.include.some((p) => p === "." || f.startsWith(p)))
    .filter((f) => !(rule.exclude ?? []).some((p) => f.startsWith(p)));
}
const read = (f) => readFileSync(path.join(repoRoot, f), "utf8");
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

const RULES = {};

if (CONFIG.maxLines) {
  RULES["max-lines"] = () => {
    const out = {};
    for (const f of pick(CONFIG.maxLines)) {
      const lines = read(f).split("\n").length;
      if (lines > CONFIG.maxLines.limit) {
        out[f] = { value: lines, detail: [`${f}: ${lines} lines (limit ${CONFIG.maxLines.limit})`] };
      }
    }
    return out;
  };
}

if (CONFIG.noConsoleLog) {
  RULES["no-console-log"] = () => {
    const out = {};
    for (const f of pick(CONFIG.noConsoleLog)) {
      const src = read(f);
      const detail = [];
      for (const m of src.matchAll(/console\.log\s*\(/g)) {
        detail.push(`${f}:${lineOf(src, m.index)}: console.log (use console.info or remove)`);
      }
      if (detail.length) out[f] = { value: detail.length, detail };
    }
    return out;
  };
}

if (CONFIG.boundedFindMany) {
  RULES["bounded-findmany"] = () => {
    const out = {};
    for (const f of pick(CONFIG.boundedFindMany)) {
      const src = read(f);
      const detail = [];
      for (const m of src.matchAll(/\.findMany\s*\(/g)) {
        const start = m.index + m[0].length;
        let depth = 1, i = start;
        while (i < src.length && depth > 0) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") depth--;
          i++;
        }
        if (!/\blimit\s*:/.test(src.slice(start, i - 1))) {
          detail.push(`${f}:${lineOf(src, m.index)}: findMany() without limit`);
        }
      }
      if (detail.length) out[f] = { value: detail.length, detail };
    }
    return out;
  };
}

const current = {};
for (const [rule, fn] of Object.entries(RULES)) current[rule] = fn();

if (updateBaseline) {
  const snapshot = {};
  for (const [rule, files] of Object.entries(current)) {
    snapshot[rule] = {};
    for (const [f, { value }] of Object.entries(files)) snapshot[rule][f] = value;
  }
  writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + "\n");
  const total = Object.values(snapshot).reduce((s, f) => s + Object.keys(f).length, 0);
  console.info(`Baseline updated: ${total} grandfathered entries.`);
  process.exit(0);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
let failures = 0, improvements = 0;

for (const [rule, files] of Object.entries(current)) {
  for (const [f, { value, detail }] of Object.entries(files)) {
    const allowed = baseline[rule]?.[f] ?? 0;
    if (value > allowed) {
      failures++;
      console.error(`FAIL [${rule}]${allowed ? ` (baseline allows ${allowed}, now ${value})` : ""}`);
      for (const line of detail) console.error(`  ${line}`);
    } else if (value < allowed) improvements++;
  }
  for (const f of Object.keys(baseline[rule] ?? {})) if (!(f in files)) improvements++;
}

if (improvements > 0) console.info(`${improvements} baselined file(s) improved — run with --update-baseline to ratchet down.`);
if (failures > 0) {
  console.error(`\nConventions check failed: ${failures} file(s) worse than baseline.`);
  console.error("Fix the violations above (do NOT update the baseline to silence new ones).");
  process.exit(1);
}
console.info("Conventions check passed.");
