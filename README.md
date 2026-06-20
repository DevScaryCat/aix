# aix — an AI-native execution format

**Goal:** a backend an AI can write in a fraction of the tokens of Next.js/React,
that a *machine* (not a human) can prove correct, and that runs with **zero human
in the loop**.

The AI never writes `if`/`for`/functions. It writes a short **declarative spec**.
A fixed, trusted runtime already knows how to run it — so what we verify isn't
unbounded code, it's a tiny closed spec. That's why the verifier can be 100%
deterministic.

```
natural language
      ↓  (AI writes a tiny spec — not code)
  .aix spec
      ↓  (verifier: deterministic, 100% machine judgement)
  rejected → structured error → AI fixes itself
  accepted ↓
  runtime interprets the spec as a live API   ← no generated code exists
```

---

## Performance — measured, not claimed

Same CRUD backend (auth, ownership scoping, validation, field-locked updates),
written two ways: **(A)** idiomatic Next.js (App Router route handlers + `zod` +
`prisma`) vs **(B)** an `.aix` spec. Reproduce it yourself: `node bench/run.mjs`.

**Tokens to define the whole backend** (all 3 scenarios combined, lower = better):

```
Next.js  ████████████████████████████████████████  3,252
aix      ██                                            172
```
→ **18.9× fewer** estimated tokens.

**Lines of source** (all 3 scenarios combined):

```
Next.js  ████████████████████████████████████████  312
aix      █                                            11
```
→ **28.4× fewer** lines.

### Per scenario (exact)

| scenario | metric     | Next.js | aix | ratio       |
|----------|------------|--------:|----:|-------------|
| todo     | est tokens |     876 |  42 | 20.9× fewer |
|          | lines      |      84 |   3 | 28.0× fewer |
|          | files      |       5 |   1 |             |
| blog     | est tokens |     904 |  51 | 17.7× fewer |
|          | lines      |      88 |   3 | 29.3× fewer |
|          | files      |       5 |   1 |             |
| shop     | est tokens |    1472 |  79 | 18.6× fewer |
|          | lines      |     140 |   5 | 28.0× fewer |
|          | files      |       7 |   1 |             |

### Honesty notes (read these)

- **`est tokens` = `chars / 4`** — the common rule of thumb, *not* an exact
  tokenizer count. The **raw character and line counts are exact**, so the
  *ratio* holds under any tokenizer; the gap is an order of magnitude regardless.
- The Next.js code is **real and kept tight** — no padding to inflate the gap.
  See it: [`bench/scenarios/*/nextjs/`](bench/scenarios).
- **What is NOT measured yet:** first-try pass rate and retry/human-intervention
  count. Those need a live LLM run and are left as a stub
  ([`bench/llm-run.mjs`](bench/llm-run.mjs)) — **no fake numbers**.
- Storage is in-memory; this is a **v0 proof-of-concept**, not production.

Full methodology: **[bench/BENCHMARK.md](bench/BENCHMARK.md)**.

---

## A whole blog backend — the entire "source code"

```
E user { name:str!, email:str! }
E post { title:str!<=200, body:str!, published:bool=false, author:ref:user, created:ts=now }
R post { list:mine, get, create, update:[title,body,published], delete, auth }
```

Three lines → auth-gated routes, owner auto-assignment, `list:mine` scoping,
length validation, field-level update locking.

---

## Usage

Requires Node 18+. Zero dependencies.

```bash
git clone https://github.com/DevScaryCat/aix
cd aix

# 1) machine-verify a spec (deterministic, no human needed)
node src/cli.mjs check examples/blog.aix
#  → { "ok": true, "entities": 2, "routes": 1 }

# 2) run it as a live API on :8787
node src/cli.mjs run examples/blog.aix
```

Then hit the live API (the runtime enforces auth, ownership, and validation):

```bash
# no login → rejected
curl -X POST localhost:8787/post -d '{"title":"hi","body":"x"}'
#  → 401 auth required

# logged in → owner + timestamp auto-filled
curl -X POST localhost:8787/post -H 'x-user-id: chris' \
     -d '{"title":"first post","body":"hello"}'
#  → 201 {"id":1,...,"author":"chris","created":"..."}

# list:mine → only your rows
curl localhost:8787/post -H 'x-user-id: chris'

# editing a field the spec didn't expose → locked
curl -X PATCH localhost:8787/post/1 -H 'x-user-id: chris' -d '{"author":"hacker"}'
#  → 403 FIELD_LOCKED
```

### The verifier catches bugs a human would otherwise debug

[`examples/broken.aix`](examples/broken.aix) has three bugs. `check` finds every
one, with exact locations — the loop an AI closes by itself:

```bash
node src/cli.mjs check examples/broken.aix
```
```json
{ "code": "BAD_REF",      "where": "post.author", "message": "ref target \"user\" is not a defined entity" }
{ "code": "BAD_UPDATE",   "where": "R post",      "message": "update field \"titel\" is not a field of post" }
{ "code": "MINE_NO_AUTH", "where": "R post",      "message": "list:mine needs \"auth\" — without login there is no \"me\"" }
```

---

## Docs

- **[SPEC.md](SPEC.md)** — full `.aix` grammar, types, route ops, runtime rules,
  and all verifier error codes (human-readable reference).
- **[bench/BENCHMARK.md](bench/BENCHMARK.md)** — performance methodology & results.

## How it's built

Pure Node, zero dependencies, in-memory storage (v0).

- [`src/parse.mjs`](src/parse.mjs) — `.aix` text → AST
- [`src/verify.mjs`](src/verify.mjs) — AST → structured errors (the heart)
- [`src/runtime.mjs`](src/runtime.mjs) — interprets a verified AST as a live API
- [`src/cli.mjs`](src/cli.mjs) — `check` / `run`

## Roadmap

1. **LLM-in-the-loop benchmark** — measure first-try pass rate + human
   interventions (target: 0) with a real model.
2. **Persistence** — swap in-memory for SQLite without touching any spec.
3. **Relations & queries** — joins, filters, pagination in the grammar.
4. **Code → aix converter** — bootstrap training data from existing code.

## License

MIT
