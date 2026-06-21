#!/usr/bin/env node
// No API key. Spawns the stdio MCP server, drives a real JSON-RPC exchange, and
// proves the whole loop: handshake -> tools/list -> aix_check (errors+warnings
// flow back as a tool result) -> aix_run a scoped spec -> exercise the LIVE api
// over HTTP to confirm ownership is actually enforced -> aix_stop.
//   run:  node mcp/test.mjs   (or: npm run test:mcp)
import assert from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn(process.execPath, [path.join(HERE, "server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });

const responses = new Map();
const waiters = new Map();
let stdoutBuf = "";
srv.stdout.setEncoding("utf8");
srv.stdout.on("data", (chunk) => {
  stdoutBuf += chunk;
  let nl;
  while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined) {
      responses.set(msg.id, msg);
      const w = waiters.get(msg.id);
      if (w) { w(msg); waiters.delete(msg.id); }
    }
  }
});

let seq = 0;
function rpc(method, params) {
  const id = ++seq;
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((res) => {
    if (responses.has(id)) return res(responses.get(id));
    waiters.set(id, res);
  });
}
// the text payload of a tools/call result, parsed back to an object
const toolJSON = (resp) => JSON.parse(resp.result.content[0].text);

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { console.log(`✓ ${name}`); pass++; }
  else { console.log(`✗ ${name}  ${detail}`); fail++; }
}

const guard = setTimeout(() => { console.error("TIMEOUT"); srv.kill("SIGKILL"); process.exit(1); }, 10000);

try {
  // 1. handshake
  const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  check("initialize returns serverInfo", init.result?.serverInfo?.name === "aix", JSON.stringify(init.result));

  // 2. tools/list
  const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
  check("tools/list exposes the 4 tools", ["aix_check", "aix_run", "aix_stop", "aix_grammar"].every((t) => tools.includes(t)), tools.join(","));

  // 3. aix_check on the reproduced leak — verifies clean BUT warns (advisory)
  const leak = toolJSON(await rpc("tools/call", { name: "aix_check", arguments: {
    spec: "E user name:str!\nE todo title:str!, owner>user\nR todo list, get, create, update:[title], delete, auth",
  } }));
  check("aix_check: leak spec is ok:true", leak.ok === true);
  check("aix_check: leak spec warns OWNED_READ_OPEN", (leak.warnings || []).some((w) => w.code === "OWNED_READ_OPEN"));

  // 4. aix_check surfaces verify errors as the tool result (a typo'd ref)
  const bad = toolJSON(await rpc("tools/call", { name: "aix_check", arguments: {
    spec: "E user name:str!\nE todo title:str!, owner>users\nR todo list:mine, get, create",
  } }));
  check("aix_check: bad ref → ok:false with BAD_REF", bad.ok === false && (bad.errors || []).some((e) => e.code === "BAD_REF"));

  // 5. aix_run a CORRECTLY scoped spec, then exercise the live API over HTTP
  const run = toolJSON(await rpc("tools/call", { name: "aix_run", arguments: {
    spec: "E user name:str!\nE todo title:str!, owner>user\nR todo list:mine, get, create, update:[title], delete",
  } }));
  check("aix_run returns ok + live url", run.ok === true && /^http:\/\/localhost:\d+$/.test(run.url || ""), run.url);

  // alice creates a todo; the runtime forces owner = alice
  const created = await fetch(`${run.url}/todo`, { method: "POST", headers: { "x-user-id": "alice", "content-type": "application/json" }, body: JSON.stringify({ title: "buy milk" }) });
  const createdRow = await created.json();
  check("live: alice create → 201, owner forced to alice", created.status === 201 && createdRow.owner === "alice", `${created.status} ${JSON.stringify(createdRow)}`);

  // bob lists → must NOT see alice's row (list:mine ownership scoping, enforced live)
  const bobList = await (await fetch(`${run.url}/todo`, { headers: { "x-user-id": "bob" } })).json();
  check("live: bob's list:mine does NOT leak alice's row", Array.isArray(bobList) && bobList.length === 0, JSON.stringify(bobList));

  // 6. stop it
  const stopped = toolJSON(await rpc("tools/call", { name: "aix_stop", arguments: { id: run.id } }));
  check("aix_stop stops the instance", stopped.ok === true && stopped.stopped === run.id);
} catch (e) {
  console.error("test threw:", e);
  fail++;
}

clearTimeout(guard);
srv.kill("SIGTERM");
console.log(fail ? `\n${fail} MCP test(s) failed` : `\nMCP server OK — ${pass} checks passed (handshake → verify-loop → live ownership enforcement)`);
process.exit(fail ? 1 : 0);
