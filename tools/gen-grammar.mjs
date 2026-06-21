#!/usr/bin/env node
// Generate the GBNF grammar for .aix FROM the parser's own vocabulary constants
// (src/parse.mjs: TYPES, SIMPLE_OPS, PARAM_OPS). Never hand-written, so the
// emission constraint cannot drift from the parser — the same lockstep rule the
// verifier follows, extended to the decode constraint.
//
// GBNF enforces SYNTAX only. The deterministic verifier (src/verify.mjs) remains
// the semantic gate (BAD_REF, AMBIGUOUS_OWNER, NO_PARENT_OWNER, …). Constrained
// decoding makes a syntactically-invalid spec unsamplable; it does not make it
// semantically correct.
//
//   node tools/gen-grammar.mjs            # write grammar/aix.gbnf
//   node tools/gen-grammar.mjs --stdout   # print instead
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TYPES, SIMPLE_OPS } from "../src/parse.mjs";

export function buildGBNF() {
  const lit = (s) => `"${s}"`;
  const typeAlt = [...TYPES].map(lit).join(" | ");
  // longest-first so a constrained sampler prefers "list:mine" over "list"
  const simpleAlt = [...SIMPLE_OPS].sort((a, b) => b.length - a.length).map(lit).join(" | ");

  return `# aix grammar (GBNF) — GENERATED from src/parse.mjs constants. DO NOT EDIT BY HAND.
# Regenerate:  node tools/gen-grammar.mjs
# Enforces SYNTAX only; src/verify.mjs is the semantic gate (refs, owners, enums).
# Invariant: bracket lists NEVER nest — that is what keeps this grammar regular
# and GBNF-compilable. Any future nested list would break this equivalence.

root    ::= ws decl (nl+ decl)* ws nl?
decl    ::= entity | route | comment

entity  ::= "E" sp name sp field (sp? "," sp? field)*
route   ::= "R" sp name sp op (sp? "," sp? op)*

field   ::= name ">" name excl? (own | via)?                 # ref shorthand: author>user, task>project^
          | name "@" excl?                                   # ts=now shorthand: created@
          | name ":enum[" name ("|" name)* "]" excl? ("=" word)?
          | name ":" type (":" name)? excl? own? uniq? max? def?

type    ::= ${typeAlt}

op      ::= ${simpleAlt}
          | "update:[" name (sp? "," sp? name)* "]"
          | "filter:[" name (sp? "," sp? name)* "]"
          | "sort:" name (":" ("asc" | "desc"))?

excl    ::= "!"
own     ::= "*"
via     ::= "^"
uniq    ::= "~"
max     ::= "<=" int
def     ::= "=" word
comment ::= "#" [^\\n]*

name    ::= [a-zA-Z_] [a-zA-Z0-9_]*
word    ::= [a-zA-Z0-9_.+-]+
int     ::= [0-9]+
sp      ::= " "+
ws      ::= [ \\t]*
nl      ::= "\\n"
`;
}

// run as a script → write the artifact
if (import.meta.url === `file://${process.argv[1]}`) {
  const gbnf = buildGBNF();
  if (process.argv.includes("--stdout")) {
    process.stdout.write(gbnf);
  } else {
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const out = path.join(HERE, "..", "grammar", "aix.gbnf");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, gbnf);
    console.error(`wrote ${out} (${gbnf.length} bytes) from ${TYPES.size} types, ${SIMPLE_OPS.length} simple ops`);
  }
}
