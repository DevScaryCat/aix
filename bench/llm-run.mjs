#!/usr/bin/env node
// LLM-in-the-loop benchmark (the part that needs a live model + API key).
//
// Measures the two dimensions run.mjs CANNOT measure deterministically:
//   - first-try pass rate  (does the generated thing work on attempt #1?)
//   - retries / human interventions until it works  (target for aix: 0)
//
// Protocol per scenario, repeated N times for each arm:
//   ARM A (baseline):  ask model -> Next.js code -> run tests -> on fail,
//                      feed back the raw runtime error, retry. Count attempts.
//                      A "human intervention" = a failure the test harness
//                      cannot turn into a machine-actionable fix.
//   ARM B (aix):       ask model -> .aix spec -> `verify()` -> on fail, feed
//                      back the STRUCTURED verifier errors, retry. Count
//                      attempts. Verifier errors are always machine-actionable,
//                      so human interventions should be 0.
//
// Not implemented yet — intentionally. Wire up an Anthropic API key and a
// shared test suite, then fill in callModel() + runTests().

const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.error(
    "bench/llm-run.mjs needs ANTHROPIC_API_KEY to generate + grade real attempts.\n" +
    "Deterministic size/verifiability numbers don't need a key — run `node bench/run.mjs`."
  );
  process.exit(2);
}

console.error("TODO: implement callModel() + runTests() + the retry loop described above.");
process.exit(1);
