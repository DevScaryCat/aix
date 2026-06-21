#!/usr/bin/env node
// No API key. Proves owner-via-parent (^) end-to-end: the verifier accepts a
// correct parent-ownership spec and rejects the broken shapes, and the live
// runtime enforces "you can only touch a row whose PARENT you own" — the exact
// authz a hand-written backend silently gets wrong.
//   run:  node bench/via-test.mjs   (or: npm run test:via)
import assert from "node:assert";
import { parse } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";
import { createServer } from "../src/runtime.mjs";
import { getFreePort } from "./llm-lib.mjs";

let pass = 0, fail = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => { console.log(`✓ ${name}`); pass++; }).catch((e) => { console.log(`✗ ${name}\n    ${e.message}`); fail++; });

const SPEC = `E user name:str!
E project title:str!, owner>user
E task title:str!, project>project^
R project list:mine, get, create, update:[title], delete
R task list:mine, get, create, update:[title], delete`;

// ── static checks ──
await check("valid parent-ownership spec verifies clean", () => {
  assert.deepStrictEqual(verify(parse(SPEC)), []);
});
await check("^ parent with no owner → NO_PARENT_OWNER", () => {
  const errs = verify(parse(`E project title:str!\nE task title:str!, project>project^\nR task list:mine, get, create`));
  assert.ok(errs.some((e) => e.code === "NO_PARENT_OWNER"), JSON.stringify(errs));
});
await check("^ combined with * → OWNER_VIA_CONFLICT", () => {
  const errs = verify(parse(`E user name:str!\nE task title:str!, owner>user*, project>user^\nR task list:mine, get, create`));
  assert.ok(errs.some((e) => e.code === "OWNER_VIA_CONFLICT"), JSON.stringify(errs));
});
await check("the via (parent) ref cannot be in update:[...] → OWNER_LOCKED", () => {
  const errs = verify(parse(`E user name:str!\nE project title:str!, owner>user\nE task title:str!, project>project^\nR task list:mine, get, create, update:[project]`));
  assert.ok(errs.some((e) => e.code === "OWNER_LOCKED"), JSON.stringify(errs));
});

// ── live runtime: parent-scoped access is actually enforced ──
const ast = parse(SPEC);
const port = await getFreePort();
const server = createServer(ast);
await new Promise((r) => server.listen(port, r));
const base = `http://localhost:${port}`;
const req = (method, path, user, body) =>
  fetch(base + path, { method, headers: { ...(user ? { "x-user-id": user } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

try {
  const p1 = await (await req("POST", "/project", "alice", { title: "alice's board" })).json();
  const p2 = await (await req("POST", "/project", "bob", { title: "bob's board" })).json();

  await check("alice creates a task in HER project → 201", async () => {
    const r = await req("POST", "/task", "alice", { title: "a1", project: p1.id });
    assert.strictEqual(r.status, 201, `got ${r.status}`);
  });
  await check("bob CANNOT create a task in alice's project → 403 PARENT_FORBIDDEN", async () => {
    const r = await req("POST", "/task", "bob", { title: "intruder", project: p1.id });
    assert.strictEqual(r.status, 403, `got ${r.status}`);
    assert.strictEqual((await r.json()).code, "PARENT_FORBIDDEN");
  });
  const bobTask = await (await req("POST", "/task", "bob", { title: "b1", project: p2.id })).json();

  await check("list:mine via parent — alice sees only tasks under her projects", async () => {
    const rows = await (await req("GET", "/task", "alice")).json();
    assert.ok(rows.every((t) => t.project === p1.id) && rows.length === 1, JSON.stringify(rows));
  });
  await check("list:mine via parent — bob does NOT see alice's task", async () => {
    const rows = await (await req("GET", "/task", "bob")).json();
    assert.ok(!rows.some((t) => t.project === p1.id), JSON.stringify(rows));
  });

  // find alice's task id
  const aliceTaskId = (await (await req("GET", "/task", "alice")).json())[0].id;
  await check("bob GET alice's task by id → 404 (parent-scoped, no existence leak)", async () => {
    assert.strictEqual((await req("GET", `/task/${aliceTaskId}`, "bob")).status, 404);
  });
  await check("bob PATCH alice's task → 404", async () => {
    assert.strictEqual((await req("PATCH", `/task/${aliceTaskId}`, "bob", { title: "hijack" })).status, 404);
  });
  await check("bob DELETE alice's task → 404", async () => {
    assert.strictEqual((await req("DELETE", `/task/${aliceTaskId}`, "bob")).status, 404);
  });
  await check("alice CAN read her own task → 200", async () => {
    assert.strictEqual((await req("GET", `/task/${aliceTaskId}`, "alice")).status, 200);
  });
  void bobTask;
} finally {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
}

console.log(fail ? `\n${fail} parent-ownership test(s) failed` : `\nparent-ownership OK — ${pass} checks passed (verifier + live ^ enforcement)`);
process.exit(fail ? 1 : 0);
