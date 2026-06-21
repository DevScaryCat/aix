#!/usr/bin/env node
// LLM-in-the-loop benchmark.
//
//   node --env-file=.env bench/llm-run.mjs      (or: npm run bench:llm)
//
// For each provider (Anthropic, Gemini) × scenario (todo, blog, shop) × arm:
//   ARM aix         ask the model for a .aix spec -> parse() + verify(); on
//                   failure feed back the STRUCTURED verifier errors and retry.
//                   When it verifies, run the real aix runtime and grade it
//                   against the shared HTTP contract.
//   ARM imperative  ask the model for a self-contained Node HTTP server -> run
//                   it -> grade against the SAME contract; on failure feed back
//                   the crash/behaviour failures and retry.
//
// Metrics (the deterministic size numbers live in bench/run.mjs):
//   pass@1         contract fully passed on the first attempt
//   silent-bug@1   on attempt 1 the server returned 2xx but did the wrong thing
//                  (auth/ownership/validation/lock) — the bug a human must catch
//   attempts       generations until the contract passed (capped)
//   solved@final   passed within the attempt cap at all
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";
import { createServer } from "../src/runtime.mjs";
import { runContract } from "./contract.mjs";
import { callModel, DEFAULT_MODELS, ENV_KEY } from "./providers.mjs";
import {
  SCENARIOS,
  AIX_SYSTEM,
  IMPERATIVE_SYSTEM,
  buildAixPrompt,
  buildImperativePrompt,
  extractCode,
  getFreePort,
  waitForServer,
  spawnNodeServer,
} from "./llm-lib.mjs";

const TRIALS = Number(process.env.AIX_BENCH_TRIALS) || 2;
const MAX_ATTEMPTS = Number(process.env.AIX_BENCH_MAX_ATTEMPTS) || 4;
// Equal output budget for BOTH arms. An asymmetric cap (aix 2048 vs imperative
// 8192) would let a skeptic call the comparison rigged; the aix arm simply
// won't use most of it. Fewer tokens must be a RESULT, not an imposed ceiling.
const MAX_OUTPUT_TOKENS = Number(process.env.AIX_BENCH_MAX_TOKENS) || 8192;
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "aix-bench-"));

const failLines = (result) =>
  result.checks
    .filter((c) => c.kind !== "pass")
    .map((c) => `- ${c.name}: ${c.detail || c.kind}`)
    .join("\n");

// ── aix arm: spec -> verify -> real runtime -> contract ──
async function runAixTrial(provider, key, model, sc) {
  let feedback = null;
  let attempt1 = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text;
    try {
      ({ text } = await callModel(provider, {
        apiKey: key,
        model,
        system: AIX_SYSTEM,
        prompt: buildAixPrompt(sc, feedback),
        maxTokens: MAX_OUTPUT_TOKENS,
      }));
    } catch (e) {
      return { error: e.message, attempts: attempt, passedFinal: false, attempt1 };
    }
    const spec = extractCode(text);

    let ast;
    try {
      ast = parse(spec);
    } catch (e) {
      if (attempt === 1) attempt1 = { kind: "verify", pass: false, silent: 0 };
      feedback = JSON.stringify({ stage: "parse", line: e.line, message: e.message });
      continue;
    }
    const errs = verify(ast);
    if (errs.length) {
      if (attempt === 1) attempt1 = { kind: "verify", pass: false, silent: 0 };
      feedback = JSON.stringify(errs);
      continue;
    }

    // verified → run the real runtime and grade behaviour
    const port = await getFreePort();
    const server = createServer(ast);
    await new Promise((res) => server.listen(port, res));
    let result;
    try {
      result = await runContract(`http://localhost:${port}`, sc);
    } finally {
      server.closeAllConnections?.();
      await new Promise((res) => server.close(res));
    }
    if (attempt === 1) attempt1 = { kind: "ran", pass: result.passed, silent: result.silent };
    if (result.passed) return { passedFinal: true, attempts: attempt, attempt1 };
    feedback = "Behavioral test failures (adjust the spec to satisfy them):\n" + failLines(result);
  }
  return { passedFinal: false, attempts: MAX_ATTEMPTS, attempt1 };
}

// ── imperative arm: model writes a Node server -> spawn -> contract ──
async function runImperativeTrial(provider, key, model, sc) {
  let feedback = null;
  let attempt1 = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text;
    try {
      ({ text } = await callModel(provider, {
        apiKey: key,
        model,
        system: IMPERATIVE_SYSTEM,
        prompt: buildImperativePrompt(sc, feedback),
        maxTokens: MAX_OUTPUT_TOKENS,
      }));
    } catch (e) {
      return { error: e.message, attempts: attempt, passedFinal: false, attempt1 };
    }
    const code = extractCode(text);
    const file = path.join(tmpDir, `srv-${provider}-${sc.name}-${attempt}.mjs`);
    writeFileSync(file, code);
    const port = await getFreePort();
    const srv = spawnNodeServer(file, port);
    const up = await waitForServer(port);

    if (!up) {
      srv.kill();
      if (attempt === 1) attempt1 = { kind: "crash", pass: false, silent: 0 };
      feedback =
        "The server did not start listening on Number(process.env.PORT). Fix this:\n" +
        (srv.getStderr() || "(no stderr)");
      try { rmSync(file); } catch { /* ignore */ }
      continue;
    }

    let result;
    try {
      result = await runContract(`http://localhost:${port}`, sc);
    } finally {
      srv.kill();
      try { rmSync(file); } catch { /* ignore */ }
    }
    if (attempt === 1) attempt1 = { kind: "ran", pass: result.passed, silent: result.silent };
    if (result.passed) return { passedFinal: true, attempts: attempt, attempt1 };
    feedback = "Your server failed these behavioral checks. Fix them:\n" + failLines(result);
  }
  return { passedFinal: false, attempts: MAX_ATTEMPTS, attempt1 };
}

function aggregate(trials) {
  const n = trials.length;
  const errored = trials.filter((t) => t.error).length;
  const valid = trials.filter((t) => !t.error);
  const pass1 = valid.filter((t) => t.attempt1 && t.attempt1.pass).length;
  const silent1 = valid.filter((t) => t.attempt1 && t.attempt1.kind === "ran" && t.attempt1.silent > 0).length;
  const solved = valid.filter((t) => t.passedFinal).length;
  const meanAttempts = valid.length
    ? (valid.reduce((s, t) => s + (t.passedFinal ? t.attempts : MAX_ATTEMPTS), 0) / valid.length).toFixed(1)
    : "—";
  return { n, errored, vN: valid.length, pass1, silent1, solved, meanAttempts };
}

const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

async function main() {
  const filter = (process.env.AIX_BENCH_PROVIDERS || "anthropic,gemini")
    .split(",")
    .map((s) => s.trim());
  const providers = [];
  for (const p of ["anthropic", "gemini"]) {
    if (!filter.includes(p)) continue;
    const key = process.env[ENV_KEY[p]];
    if (key) providers.push({ name: p, key, model: DEFAULT_MODELS[p] });
  }

  if (providers.length === 0) {
    console.error(
      "No API keys found. Put them in .env (see .env.example) and run:\n" +
        "  npm run bench:keys   # verify the keys\n" +
        "  npm run bench:llm    # this benchmark\n",
    );
    process.exit(2);
  }

  const arms = [
    { key: "aix", run: runAixTrial },
    { key: "imperative", run: runImperativeTrial },
  ];
  const totalCalls = providers.length * SCENARIOS.length * arms.length * TRIALS;
  console.log(
    `aix LLM-in-the-loop benchmark\n` +
      `providers: ${providers.map((p) => `${p.name}(${p.model})`).join(", ")}\n` +
      `scenarios: ${SCENARIOS.map((s) => s.name).join(", ")} · arms: aix, imperative\n` +
      `trials: ${TRIALS} · max attempts: ${MAX_ATTEMPTS} · ~${totalCalls}+ model calls\n`,
  );

  // provider -> arm -> trials[]
  const results = {};
  for (const p of providers) {
    results[p.name] = { aix: [], imperative: [] };
    for (const sc of SCENARIOS) {
      for (const arm of arms) {
        for (let t = 1; t <= TRIALS; t++) {
          process.stdout.write(`  ${pad(p.name, 9)} ${pad(sc.name, 5)} ${pad(arm.key, 10)} trial ${t}/${TRIALS} … `);
          const r = await arm.run(p.name, p.key, p.model, sc);
          results[p.name][arm.key].push({ scenario: sc.name, ...r });
          if (r.error) console.log(`ERROR ${r.error.slice(0, 60)}`);
          else
            console.log(
              `${r.passedFinal ? "solved" : "unsolved"} in ${r.attempts}` +
                (r.attempt1?.kind === "ran" && r.attempt1.silent > 0 ? `  (silent@1: ${r.attempt1.silent})` : ""),
            );
        }
      }
    }
  }

  // ── Report ──
  console.log("\n" + "=".repeat(64));
  console.log("RESULTS  (pass@1 = correct on first try; silent-bug@1 = first try");
  console.log("returned 2xx but broke auth/ownership/validation/lock)");
  console.log("=".repeat(64));
  for (const p of providers) {
    console.log(`\n${p.name}  (${p.model})`);
    console.log(
      "  " + pad("arm", 12) + padL("pass@1", 8) + padL("silent@1", 10) + padL("attempts", 10) + padL("solved", 9),
    );
    console.log("  " + "-".repeat(47));
    for (const arm of arms) {
      const a = aggregate(results[p.name][arm.key]);
      const denom = a.vN || a.n;
      console.log(
        "  " +
          pad(arm.key, 12) +
          padL(`${a.pass1}/${denom}`, 8) +
          padL(`${a.silent1}/${denom}`, 10) +
          padL(a.meanAttempts, 10) +
          padL(`${a.solved}/${denom}`, 9) +
          (a.errored ? `   (${a.errored} errored)` : ""),
      );
    }
  }
  console.log(
    "\nReading it: aix's first-try failures are caught by the deterministic\n" +
      "verifier (machine-actionable, never a silent bug). The imperative arm's\n" +
      "silent-bug@1 column is the class of error aix eliminates by construction.\n",
  );

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((e) => {
  console.error(e);
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
