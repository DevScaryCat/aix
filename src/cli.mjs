#!/usr/bin/env node
// aix CLI:  check (parse+verify)  |  run (parse+verify+serve)
import { readFileSync } from "node:fs";
import { parse, ParseError } from "./parse.mjs";
import { verify } from "./verify.mjs";
import { createServer } from "./runtime.mjs";

const [cmd, file, portArg] = process.argv.slice(2);

if (!cmd || !file) {
  console.error("usage: aix <check|run> <file.aix> [port]");
  process.exit(2);
}

const source = readFileSync(file, "utf8");

let ast;
try {
  ast = parse(source);
} catch (e) {
  if (e instanceof ParseError) {
    console.error(JSON.stringify({ ok: false, stage: "parse", line: e.line, message: e.message }, null, 2));
    process.exit(1);
  }
  throw e;
}

const errors = verify(ast);
if (errors.length) {
  console.error(JSON.stringify({ ok: false, stage: "verify", errors }, null, 2));
  process.exit(1);
}

if (cmd === "check") {
  const routes = Object.keys(ast.routes).length;
  const entities = Object.keys(ast.entities).length;
  console.log(JSON.stringify({ ok: true, entities, routes }, null, 2));
  process.exit(0);
}

if (cmd === "run") {
  const port = Number(portArg) || 8787;
  const server = createServer(ast);
  server.listen(port, () => {
    console.error(`aix runtime live on http://localhost:${port}`);
    for (const r of Object.values(ast.routes)) {
      const ops = [r.list && "list", r.get && "get", r.create && "create", r.update && "update", r.delete && "delete"].filter(Boolean);
      console.error(`  /${r.entity}  [${ops.join(" ")}]${r.auth ? "  @auth" : ""}`);
    }
  });
  process.exit; // keep alive
} else {
  console.error(`unknown command "${cmd}"`);
  process.exit(2);
}
