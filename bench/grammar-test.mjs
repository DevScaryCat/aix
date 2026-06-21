#!/usr/bin/env node
// No API key. Guards the GBNF artifact two ways: (1) the committed grammar is
// byte-identical to what the generator emits from the parser's vocabulary
// constants (no drift), and (2) every type/op the grammar lists actually
// round-trips through parse() — so the vocabulary can't silently diverge from
// the parser the runtime depends on.  run: node bench/grammar-test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, ParseError, TYPES, SIMPLE_OPS, PARAM_OPS } from "../src/parse.mjs";
import { buildGBNF } from "../tools/gen-grammar.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (n, f) => { try { f(); console.log(`✓ ${n}`); pass++; } catch (e) { console.log(`✗ ${n}\n    ${e.message}`); fail++; } };

// 1. committed artifact is regenerated from the constants — CI catches drift
check("grammar/aix.gbnf is up to date with the constants (no drift)", () => {
  const committed = readFileSync(path.join(HERE, "..", "grammar", "aix.gbnf"), "utf8");
  assert.strictEqual(committed, buildGBNF(), "stale — run: node tools/gen-grammar.mjs");
});

// 2. every type the grammar lists actually parses (vocabulary ⊆ parser)
for (const t of TYPES) {
  check(`type "${t}" round-trips through parse()`, () => parse(t === "ref" ? "E e f:ref:e" : `E e f:${t}`));
}

// 3. every op the grammar lists actually parses
const opSpec = (op) => `E e a:str!\nR e ${op}`;
for (const op of SIMPLE_OPS) check(`simple op "${op}" round-trips`, () => parse(opSpec(op)));
for (const [op, sample] of [["update", "update:[a]"], ["filter", "filter:[a]"], ["sort", "sort:a"]]) {
  assert.ok(PARAM_OPS.includes(op));
  check(`param op "${op}" round-trips`, () => parse(opSpec(sample)));
}

// 4. the generated grammar actually references each terminal (generator ↔ constants)
const g = buildGBNF();
for (const t of TYPES) check(`grammar lists type "${t}"`, () => assert.ok(g.includes(`"${t}"`)));
for (const op of SIMPLE_OPS) check(`grammar lists op "${op}"`, () => assert.ok(g.includes(`"${op}"`)));
for (const op of PARAM_OPS) check(`grammar lists param op "${op}"`, () => assert.ok(g.includes(`"${op}:`)));

// 5. an op outside the vocabulary is rejected — the parser is the floor
check("unknown op is rejected by the parser", () => {
  assert.throws(() => parse("E e a:str!\nR e frobnicate"), ParseError);
});

console.log(fail ? `\n${fail} grammar test(s) failed` : `\ngrammar OK — ${pass} passed; GBNF generated from parser vocabulary, no drift`);
process.exit(fail ? 1 : 0);
