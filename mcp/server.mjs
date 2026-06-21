#!/usr/bin/env node
// aix MCP server — zero dependencies, stdio JSON-RPC 2.0 (MCP transport).
//
// Puts the emit -> verify -> fix loop INSIDE the surfaces a top model already
// runs (Claude Desktop / Cursor / Cline / Claude Code). The model emits a tiny
// .aix spec as a tool argument and gets the deterministic verifier's structured
// errors (and advisory lint warnings) back as the tool RESULT — so it self-
// corrects with no human relaying output, and the conversation prefix is reused
// instead of re-sending the whole spec each retry.
//
// Tools:
//   aix_check(spec)        parse + total verify + advisory lint -> {ok, errors?, warnings?}
//   aix_run(spec[,port])   verify then serve the spec as a live in-memory CRUD API -> {ok,id,url}
//   aix_stop(id)           stop a running instance
//   aix_grammar()          the grammar primer + every error/warning code
//
// Kept dependency-free on purpose: MCP stdio is just newline-delimited JSON-RPC.
import { parse, ParseError } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";
import { lint } from "../src/lint.mjs";
import { createServer } from "../src/runtime.mjs";

// ── aix core, wrapped ──
function doCheck(spec) {
  let ast;
  try {
    ast = parse(spec);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, stage: "parse", line: e.line, message: e.message };
    return { ok: false, stage: "parse", message: String(e?.message || e) };
  }
  const errors = verify(ast);
  if (errors.length) return { ok: false, stage: "verify", errors };
  const warnings = lint(ast);
  const out = { ok: true, entities: Object.keys(ast.entities).length, routes: Object.keys(ast.routes).length };
  if (warnings.length) out.warnings = warnings;
  return out;
}

const running = new Map(); // id -> { server, url }
let runSeq = 0;

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port || 0, () => resolve(server.address().port));
  });
}

async function doRun(spec, port) {
  const checked = doCheck(spec);
  if (!checked.ok) return checked; // never serve an unverified spec
  const ast = parse(spec);
  const server = createServer(ast);
  let boundPort;
  try {
    boundPort = await listen(server, port);
  } catch (e) {
    return { ok: false, stage: "run", message: `could not listen: ${e.message}` };
  }
  const id = `aix-${++runSeq}`;
  const url = `http://localhost:${boundPort}`;
  running.set(id, { server, url });
  const out = { ok: true, id, url };
  if (checked.warnings) out.warnings = checked.warnings;
  return out;
}

async function doStop(id) {
  const inst = running.get(id);
  if (!inst) return { ok: false, message: `no running instance "${id}"` };
  inst.server.closeAllConnections?.();
  await new Promise((r) => inst.server.close(r));
  running.delete(id);
  return { ok: true, stopped: id };
}

const GRAMMAR = `aix — one declaration per line, "#" starts a comment, braces optional.
  E <name> <field>, <field>, ...      # entity (data shape)
  R <entity> <op>, <op>, ...          # routes (exposed actions)

field:  name:type[:refEntity][!][*][~][<=N][=default]
  types: str | int | bool | ts | ref
  !  required   *  owner (ref only)   ~  unique (str/int)   <=N max len/value   =d default
  shorthands:  author>user (= author:ref:user) ·  buyer>user* (owner) ·  created@ (= created:ts=now)
  enum:  status:enum[draft|published]=draft

op:  list | list:mine | get | create | update:[f1,f2] | delete | auth | private
     | filter:[f1,f2] | sort:field[:desc] | page
  list:mine  -> only the owner's rows (auto-implies auth + private)
  update:[...] -> ONLY those fields may change; all others are locked
  private    -> get/update/delete scoped to the owner (others get 404)

Example (a whole blog backend):
  E user name:str!, email:str!~
  E post title:str!<=200, body:str!, published:bool=false, author>user, created@
  R post list:mine, get, create, update:[title,body,published], delete

VERIFY ERROR codes (block; fix and re-emit): BAD_REF, DUP_FIELD, EMPTY_ENUM, BAD_DEFAULT,
  BAD_MAX, BAD_OWNER, BAD_UNIQUE, MULTI_OWNER, NO_ENTITY, BAD_UPDATE, OWNER_LOCKED,
  FILTER_FIELD, SORT_FIELD, NO_OWNER, AMBIGUOUS_OWNER, PRIVATE_LIST, OWNER_CREATE_NO_AUTH.
ADVISORY WARNING codes (do NOT block; usually a permission mistake): OPEN_MUTATION
  (update/delete with no auth), OWNED_READ_OPEN (owned entity whose list/get isn't
  owner-scoped — likely a cross-owner data leak; use list:mine / private unless public).

Loop: emit spec -> aix_check -> if errors, fix exactly those and re-check -> aix_run.`;

async function callTool(name, args) {
  switch (name) {
    case "aix_check":
      return doCheck(String(args.spec ?? ""));
    case "aix_run":
      return doRun(String(args.spec ?? ""), args.port ? Number(args.port) : undefined);
    case "aix_stop":
      return doStop(String(args.id ?? ""));
    case "aix_grammar":
      return { grammar: GRAMMAR };
    default:
      return { ok: false, message: `unknown tool "${name}"` };
  }
}

const TOOLS = [
  {
    name: "aix_check",
    description:
      "Verify an .aix backend spec: parse + a TOTAL deterministic verifier + an advisory lint pass. Returns {ok, errors?, warnings?}. ok:true GUARANTEES the runtime can run it. On ok:false, errors[] is machine-actionable {code,where,message} — fix exactly those and re-check.",
    inputSchema: { type: "object", properties: { spec: { type: "string", description: "the .aix source" } }, required: ["spec"] },
  },
  {
    name: "aix_run",
    description:
      "Verify, then start the spec as a live in-memory CRUD API (auth, ownership, validation, field-locks all enforced by the fixed runtime). Returns {ok, id, url} or the verify errors. Exercise the api at url; call aix_stop with id when done.",
    inputSchema: { type: "object", properties: { spec: { type: "string" }, port: { type: "number" } }, required: ["spec"] },
  },
  {
    name: "aix_stop",
    description: "Stop a running aix instance started by aix_run.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "aix_grammar",
    description: "Return the .aix grammar primer plus every verifier error code and advisory warning code, so a model can emit valid specs and pre-empt rejections.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── JSON-RPC 2.0 over stdio ──
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === undefined) return; // a response/ack we didn't initiate
  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "aix", version: "0.1.0" },
        },
      });
      return;
    case "notifications/initialized":
    case "initialized":
      return; // notification — no reply
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    case "tools/call": {
      try {
        const result = await callTool(params?.name, params?.arguments || {});
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
      } catch (e) {
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `tool error: ${e.message}` }], isError: true } });
      }
      return;
    }
    default:
      if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore non-JSON lines
    }
    handle(msg);
  }
});
process.stdin.on("end", () => process.exit(0));
console.error("aix MCP server ready (stdio) — tools: aix_check, aix_run, aix_stop, aix_grammar");
