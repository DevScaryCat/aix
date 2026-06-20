#!/usr/bin/env node
// No API key needed. Proves the contract suite and the aix runtime agree:
// every canonical spec, run through parse -> verify -> runtime, passes every
// check. This is the aix arm's ceiling (a correct spec => 100% behaviour) and a
// regression guard for the contract config. Run:  node bench/selftest.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";
import { createServer } from "../src/runtime.mjs";
import { runContract } from "./contract.mjs";
import { SCENARIOS, getFreePort } from "./llm-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;

for (const sc of SCENARIOS) {
  const spec = readFileSync(path.join(HERE, "scenarios", sc.name, "spec.aix"), "utf8");
  const ast = parse(spec);
  const errs = verify(ast);
  if (errs.length) {
    console.log(`✗ ${sc.name}: verify errors`, errs);
    failures++;
    continue;
  }
  const port = await getFreePort();
  const server = createServer(ast);
  await new Promise((r) => server.listen(port, r));
  let res;
  try {
    res = await runContract(`http://localhost:${port}`, sc);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
  const passN = res.checks.filter((c) => c.kind === "pass").length;
  console.log(`${res.passed ? "✓" : "✗"} ${sc.name}: ${passN}/${res.total} checks pass`);
  if (!res.passed) {
    failures++;
    for (const c of res.checks.filter((c) => c.kind !== "pass")) {
      console.log(`    ${c.name} [${c.kind}] ${c.detail}`);
    }
  }
}

console.log(
  failures
    ? `\n${failures} scenario(s) failed self-test`
    : "\nself-test OK — the aix runtime satisfies the full contract for every scenario",
);
process.exit(failures ? 1 : 0);
