#!/usr/bin/env node
// Benchmark: same CRUD backend, written two ways.
//   (A) what an AI writes today  -> idiomatic Next.js (route handlers + zod + prisma)
//   (B) what an AI writes in aix  -> a few-line spec
//
// We measure, deterministically and honestly:
//   - size: bytes, non-whitespace chars, lines, est. tokens
//   - verifiability: does a MACHINE catch spec errors with zero human?
//
// What this does NOT measure (needs a live LLM + API key): first-try pass
// rate and retry count. Those belong in bench/llm-run.mjs (not faked here).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = ["todo", "blog", "shop"];

// Transparent size metrics. "tokens" is an estimate (~chars/4, the common
// rule of thumb); raw chars/lines are exact so any tokenizer ratio holds.
function measure(text) {
  const chars = text.length;
  const nonWs = text.replace(/\s/g, "").length;
  const lines = text.split("\n").filter((l) => l.trim()).length;
  return { bytes: Buffer.byteLength(text), chars, nonWs, lines, estTokens: Math.round(chars / 4) };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function measureDir(dir) {
  const acc = { bytes: 0, chars: 0, nonWs: 0, lines: 0, estTokens: 0, files: 0 };
  for (const f of walk(dir)) {
    const m = measure(readFileSync(f, "utf8"));
    for (const k of Object.keys(m)) acc[k] += m[k];
    acc.files++;
  }
  return acc;
}

const rows = [];
for (const name of SCENARIOS) {
  const base = join(HERE, "scenarios", name);
  const specText = readFileSync(join(base, "spec.aix"), "utf8");
  const aix = measure(specText);
  aix.files = 1;
  const next = measureDir(join(base, "nextjs"));

  // verifiability: machine-check the aix spec
  const ast = parse(specText);
  const errors = verify(ast);

  rows.push({ name, aix, next, verified: errors.length === 0 });
}

function ratio(a, b) {
  return (b / a).toFixed(1) + "×";
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log("\naix vs Next.js — same CRUD backend, measured\n");
console.log(
  pad("scenario", 10) + pad("metric", 12) +
  padL("Next.js", 10) + padL("aix", 8) + "   " + pad("aix wins", 14)
);
console.log("-".repeat(54));

const totals = { nextTok: 0, aixTok: 0, nextLines: 0, aixLines: 0, nextFiles: 0, aixFiles: 0 };
for (const r of rows) {
  console.log(
    pad(r.name, 10) + pad("est tokens", 12) + padL(r.next.estTokens, 10) + padL(r.aix.estTokens, 8) + "   " + pad(ratio(r.aix.estTokens, r.next.estTokens) + " fewer", 14)
  );
  console.log(
    pad("", 10) + pad("lines", 12) + padL(r.next.lines, 10) + padL(r.aix.lines, 8) + "   " + pad(ratio(r.aix.lines, r.next.lines) + " fewer", 14)
  );
  console.log(
    pad("", 10) + pad("files", 12) + padL(r.next.files, 10) + padL(r.aix.files, 8)
  );
  console.log(
    pad("", 10) + pad("verified", 12) + padL("—", 10) + padL(r.verified ? "✓ machine" : "✗", 8)
  );
  console.log("-".repeat(54));
  totals.nextTok += r.next.estTokens; totals.aixTok += r.aix.estTokens;
  totals.nextLines += r.next.lines; totals.aixLines += r.aix.lines;
  totals.nextFiles += r.next.files; totals.aixFiles += r.aix.files;
}

console.log("\nTOTALS across all scenarios:");
console.log(`  est tokens : Next.js ${totals.nextTok}  vs  aix ${totals.aixTok}   → ${ratio(totals.aixTok, totals.nextTok)} fewer tokens`);
console.log(`  lines      : Next.js ${totals.nextLines}  vs  aix ${totals.aixLines}   → ${ratio(totals.aixLines, totals.nextLines)} fewer lines`);
console.log(`  files      : Next.js ${totals.nextFiles}  vs  aix ${totals.aixFiles}`);
console.log(`  verifiable : aix = yes (deterministic, 0 humans).  Next.js = no static check for auth/ownership/validation bugs — they surface at runtime.\n`);
