# aix — an AI-native execution format

**Goal:** make a backend that an AI can write in a fraction of the tokens of
Next.js/React, that a *machine* (not a human) can prove correct, and that runs
with **zero human in the loop**.

## The idea in one picture

```
natural language
      ↓  (AI writes a tiny spec — not code)
  .aix spec
      ↓  (verifier: deterministic, 100% machine judgement)
  rejected → structured error → AI fixes itself
  accepted ↓
  runtime interprets the spec as a live API   ← no generated code exists
```

The AI never writes `if`/`for`/functions. It writes a short **declarative
spec**. A fixed, trusted runtime already knows how to run it. So the thing we
must verify is not unbounded code — it's a tiny, closed spec. That's why the
verifier can be 100% deterministic.

## A whole blog backend (the entire "source code")

```
E user { name:str!, email:str! }
E post { title:str!<=200, body:str!, published:bool=false, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[title,body,published], delete, auth }
```

Run it:

```bash
node src/cli.mjs check examples/blog.aix   # machine-verify the spec
node src/cli.mjs run   examples/blog.aix   # serve a live CRUD API on :8787
```

You now have: auth-gated routes, owner auto-assignment, `list:mine` scoping,
length validation, field-level update locking — all from 3 lines.

## Why a machine, not a human, checks it

`examples/broken.aix` has three bugs. `check` catches every one and says
exactly where and why — the loop an AI can close by itself:

```json
{ "code": "BAD_REF",      "where": "post.author", "message": "ref target \"user\" is not a defined entity" }
{ "code": "BAD_UPDATE",   "where": "R post",      "message": "update field \"titel\" is not a field of post" }
{ "code": "MINE_NO_AUTH", "where": "R post",      "message": "list:mine needs \"auth\" — without login there is no \"me\"" }
```

## Docs

- **[SPEC.md](SPEC.md)** — the full `.aix` grammar, types, route ops, runtime
  rules, and verifier error codes (human-readable reference).
- **[bench/BENCHMARK.md](bench/BENCHMARK.md)** — aix vs Next.js, measured.

## Status

v0 proof-of-concept. Pure Node, zero dependencies, in-memory storage.

- `src/parse.mjs` — `.aix` text → AST
- `src/verify.mjs` — AST → structured errors (the heart)
- `src/runtime.mjs` — interprets a verified AST as a live API
- `src/cli.mjs` — `check` / `run`

## Roadmap

1. **Benchmark harness** — same 20 specs via (a) AI writes Next.js code vs
   (b) AI writes `.aix`. Measure output tokens, first-try pass rate, **retries**,
   and **human interventions** (target: 0).
2. **Code → aix converter** — turn existing CRUD code into `.aix` to bootstrap
   training data and stress-test the format's expressiveness.
3. **Persistence** — swap the in-memory store for SQLite without touching specs.
4. **Relations & queries** — joins, filters, pagination in the spec grammar.
```
