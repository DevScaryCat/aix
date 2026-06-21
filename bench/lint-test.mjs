#!/usr/bin/env node
// No API key needed. Guards the advisory lint channel AND the invariant that it
// does not weaken the total verifier: every spec below still verifies clean
// (errors == []) — warnings are a separate channel — and the intent lints fire
// on the known-bad shapes while staying silent on the correctly-scoped ones.
//   run:  node bench/lint-test.mjs   (or: npm run test:lint)
import assert from "node:assert";
import { parse } from "../src/parse.mjs";
import { verify } from "../src/verify.mjs";
import { lint } from "../src/lint.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    fail++;
  }
}
const verifyClean = (spec) => assert.deepStrictEqual(verify(parse(spec)), [], "must verify clean (totality preserved)");
const codes = (spec) => lint(parse(spec)).map((w) => w.code);

// 1. The reproduced leak: an owned entity exposed via plain list/get under auth,
//    with no owner scoping. Verifies clean, yet leaks every user's rows.
check("owned + plain list/get under auth → OWNED_READ_OPEN", () => {
  const spec = `E user name:str!
E todo title:str!, owner>user
R todo list, get, create, update:[title], delete, auth`;
  verifyClean(spec);
  assert.ok(codes(spec).includes("OWNED_READ_OPEN"), "expected OWNED_READ_OPEN");
});

// 2. Correctly scoped: list:mine implies auth+private, so no read leaks.
check("list:mine → NO OWNED_READ_OPEN", () => {
  const spec = `E user name:str!
E todo title:str!, owner>user
R todo list:mine, get, create, update:[title], delete`;
  verifyClean(spec);
  assert.ok(!codes(spec).includes("OWNED_READ_OPEN"), "should not warn when scoped");
});

// 3. Open mutation: update/delete with no auth — any client can modify/delete.
check("update/delete without auth → OPEN_MUTATION", () => {
  const spec = `E note body:str!
R note list, get, create, update:[body], delete`;
  verifyClean(spec);
  assert.ok(codes(spec).includes("OPEN_MUTATION"), "expected OPEN_MUTATION");
});

// 4. Auth-gated mutation on an unowned entity: nothing to warn.
check("auth-gated mutation, no owner → no warnings", () => {
  const spec = `E note body:str!
R note list, get, create, update:[body], delete, auth`;
  verifyClean(spec);
  assert.deepStrictEqual(codes(spec), [], "expected no warnings");
});

// 5. Public-catalog shape (a shop). This DELIBERATELY warns — it is the known,
//    documented advisory false-positive: the verifier cannot know "public" was
//    the intent. Asserting it keeps that limitation honest and visible.
check("public catalog → OWNED_READ_OPEN fires (advisory false-positive, by design)", () => {
  const spec = `E user name:str!
E product name:str!, seller>user
R product list, get, create, update:[name], delete, auth`;
  verifyClean(spec);
  assert.ok(codes(spec).includes("OWNED_READ_OPEN"), "advisory: fires on intentionally-public reads too");
});

console.log(fail ? `\n${fail} lint test(s) failed` : `\nlint tests OK — ${pass} passed; verifier totality intact`);
process.exit(fail ? 1 : 0);
