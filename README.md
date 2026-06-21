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

### Live-model loop — measured (not estimated)

The table above is *define-time size*. The real test is the end-to-end agent
loop: ask the **same top model** (Claude Opus 4.8) for the same backend two ways
— emit an `.aix` spec (verify → fix on structured errors → run) vs write a Node
server (run → fix on failures) — both graded against the **same** HTTP behavioral
contract. Reproduce: `node --env-file=.env bench/llm-run.mjs`.

**Two models, both arms, equal 8192-token budget · 3 scenarios × 2 trials (n=6/arm):**

*Claude Opus 4.8 (frontier):*

| arm        | pass@1 | silent-bug@1 | attempts | output tokens | wall-clock |
|------------|-------:|-------------:|---------:|--------------:|-----------:|
| **aix**    |    6/6 |      **0/6** |      1.0 |        **78** |   **1.7s** |
| imperative |    5/6 |      **1/6** |      1.2 |          2329 |      19.7s |

*Claude Haiku 4.5 (cheap):*

| arm        | pass@1 | silent-bug@1 | attempts | solved  | output tokens | wall-clock |
|------------|-------:|-------------:|---------:|--------:|--------------:|-----------:|
| **aix**    |    6/6 |      **0/6** |      1.0 | **6/6** |        **68** |   **1.0s** |
| imperative |    4/6 |      **1/6** |      2.0 | **4/6** |          4770 |      22.0s |

→ The gap **widens as the model gets cheaper.** Opus writing code one-shots most
scenarios but still leaks a silent bug; **Haiku writing code solved only 4/6** (it
couldn't produce a working backend for a third of them, even with retries) and
burned 4770 tokens trying. **Haiku + aix solved 6/6, zero silent bugs, 68 tokens,
1.0s** — so a *cheap* model on aix is **more correct and ~30× leaner than the
frontier model writing the backend as code.** aix supplies the correctness the
model doesn't have to.

*Honest bounds:* n=6 per cell, two models; the token/latency gaps are structural
and robust, the 1/6 silent-bug figures are directional, not precise rates. All
scenarios are owner-scoped CRUD — *inside* aix's closed grammar by construction;
outside it (custom logic) aix doesn't apply. Gemini 2.5 Flash was dropped:
free-tier rate-limits (429) invalidated its run.

### Honesty notes (read these)

- **`est tokens` = `chars / 4`** — the common rule of thumb, *not* an exact
  tokenizer count. The **raw character and line counts are exact**, so the
  *ratio* holds under any tokenizer; the gap is an order of magnitude regardless.
  (The live-loop `output tokens` above are **real tokenizer counts** from the
  provider's usage API, not estimates.)
- The Next.js code is **real and kept tight** — no padding to inflate the gap.
  See it: [`bench/scenarios/*/nextjs/`](bench/scenarios).
- Storage is in-memory; this is a **v0 proof-of-concept**, not production.

Full methodology: **[bench/BENCHMARK.md](bench/BENCHMARK.md)**.

---

## A whole blog backend — the entire "source code"

```
E user name:str!, email:str!~
E post title:str!<=200, body:str!, published:bool=false, author>user, created@
R post list:mine, get, create, update:[title,body,published], delete
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
{ "code": "BAD_REF",     "where": "post.author", "message": "ref target \"user\" is not a defined entity" }
{ "code": "BAD_DEFAULT", "where": "post.rank",   "message": "int field default must be an integer" }
{ "code": "BAD_UPDATE",  "where": "R post",      "message": "update field \"titel\" is not a field of post — did you mean \"title\"?" }
```

---

## Use it from inside an LLM (MCP)

aix ships a **zero-dependency MCP server** so a model self-corrects in-loop — it
emits a spec, calls `aix_check`, fixes the structured errors, then `aix_run`s a
live API. Point any MCP client (Claude Desktop/Code, Cursor, Cline) at it:

```json
{ "mcpServers": { "aix": { "command": "node", "args": ["<path>/aix/mcp/server.mjs"] } } }
```

Tools: `aix_check` (parse + total verify + advisory permission lints),
`aix_run` / `aix_stop` (live in-memory API), `aix_grammar` (primer + every code).
There's also a Claude Skill in [`skill/aix-backend/`](skill/aix-backend).

**Advisory lints** flag intent-level permission risks the verifier can't reject —
e.g. `OWNED_READ_OPEN` (a plain `list` on an owner-scoped entity leaks every
user's rows) and `OPEN_MUTATION` (`update`/`delete` with no auth). They're a
**separate channel** from the verifier, so `pass == runnable` stays total.

**Constrained decoding:** [`grammar/aix.gbnf`](grammar/aix.gbnf) is *generated*
from the parser's vocabulary (`node tools/gen-grammar.mjs`) — never hand-written,
so it can't drift. A GBNF-capable runtime (llama.cpp, vLLM) can make a
*syntactically* invalid spec unsamplable; the verifier still does the semantics.

## Docs

- **[SPEC.md](SPEC.md)** — full `.aix` grammar, types, route ops, runtime rules,
  verifier error codes, and the advisory lint channel (human-readable reference).
- **[bench/BENCHMARK.md](bench/BENCHMARK.md)** — performance methodology & results.

## How it's built

Pure Node, zero dependencies, in-memory storage (v0).

- [`src/parse.mjs`](src/parse.mjs) — `.aix` text → AST
- [`src/verify.mjs`](src/verify.mjs) — AST → structured errors (the heart, total)
- [`src/lint.mjs`](src/lint.mjs) — AST → advisory warnings (separate, non-blocking)
- [`src/runtime.mjs`](src/runtime.mjs) — interprets a verified AST as a live API
- [`src/cli.mjs`](src/cli.mjs) — `check` / `run`
- [`mcp/server.mjs`](mcp/server.mjs) — zero-dep MCP server for the in-loop model
- [`tools/gen-grammar.mjs`](tools/gen-grammar.mjs) — emits [`grammar/aix.gbnf`](grammar/aix.gbnf) from the parser vocabulary

## Roadmap

1. ✅ **LLM-in-the-loop benchmark** — measured on Opus 4.8 *and* Haiku 4.5: a
   cheap model + aix beats the frontier model writing code (6/6 vs 5/6, 0 vs 1/6
   silent bugs, ~30× fewer tokens). Next: harder multi-entity scenarios
   (parent-ownership), where even a frontier model's silent-bug rate should climb.
2. ✅ **MCP server + Skill** — a top model emits a spec, gets verifier errors as a
   tool result, and self-corrects in-loop ([`mcp/`](mcp), [`skill/`](skill)).
3. **Persistence** — swap in-memory for SQLite without touching any spec.
4. **Relations & queries** — joins, filters, pagination in the grammar.
5. **Code → aix converter** — bootstrap training data from existing code.

## License

MIT
