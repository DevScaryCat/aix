# Benchmark: aix vs Next.js

Same CRUD backend, written two ways, measured honestly.

- **(A) Next.js** — idiomatic App Router: route handlers + `zod` validation +
  `prisma` schema + auth/ownership helpers. What a competent dev (or model)
  writes today. Kept tight, no padding — see `scenarios/*/nextjs/`.
- **(B) aix** — a few-line spec. See `scenarios/*/spec.aix`.

Both implement identical behaviour: auth-gated routes, owner auto-assignment,
`list:mine` ownership scoping, max-length validation, field-locked updates.

Run it yourself:

```bash
node bench/run.mjs
```

## Results (reproducible, deterministic)

| scenario | metric     | Next.js | aix | aix wins     |
|----------|------------|--------:|----:|--------------|
| todo     | est tokens |     876 |  42 | 20.9× fewer  |
|          | lines      |      84 |   3 | 28.0× fewer  |
|          | files      |       5 |   1 |              |
| blog     | est tokens |     904 |  51 | 17.7× fewer  |
|          | lines      |      88 |   3 | 29.3× fewer  |
| shop     | est tokens |    1472 |  79 | 18.6× fewer  |
|          | lines      |     140 |   5 | 28.0× fewer  |

**Totals:** ~3252 → 172 est. tokens (**18.9× fewer**), 312 → 11 lines (**28.4× fewer**).

`est tokens` is `chars/4` (the common rule of thumb). Raw chars and line counts
are exact, so the *ratio* holds under any tokenizer — the gap is an order of
magnitude regardless.

## The dimension that matters most: verifiability

Every aix spec is checked by a **deterministic verifier** (`src/verify.mjs`).
If it passes, the runtime is guaranteed to run it — **zero humans**. Bugs like a
typo'd field, a dangling `ref`, or an ambiguous owner are caught *statically*
with exact locations (see `examples/broken.aix`).

The Next.js side has no equivalent. `tsc` catches type errors, but the bugs that
actually bite — wrong ownership filter, missing auth check, a validation rule
that doesn't match the schema — compile fine and surface at runtime. A human
debugs them.

## The live-model loop — now measured (`bench/llm-run.mjs`)

First-try pass rate, silent-bug rate, attempts, **output tokens**, and latency
come from generating both versions with a **live LLM** and grading the running
result against the shared HTTP contract (`bench/contract.mjs`). Both arms get an
**equal** 8192-token budget. Run it: `node --env-file=.env bench/llm-run.mjs`.

**Claude Opus 4.8 · 3 scenarios × 2 trials (n=6 per arm):**

| arm        | pass@1 | silent-bug@1 | mean attempts | output tokens | wall-clock |
|------------|-------:|-------------:|--------------:|--------------:|-----------:|
| **aix**    |    6/6 |      **0/6** |           1.0 |        **78** |   **1.7s** |
| imperative |    5/6 |      **1/6** |           1.2 |          2329 |      19.7s |

The hypothesis held — and sharpened:

> A **top** model writing Node code one-shots easy CRUD, but at n=6 still shipped
> a **silent** auth/ownership bug 1-in-6 (a `2xx`-but-wrong defect a human must
> catch). aix's grammar cannot express that bug, so silent-bug@1 is 0 — while
> using **~30× fewer output tokens** and running **~11× faster**.

**Honest bounds:** n=6 and one model, so the 1/6 silent-bug figure is directional
(the token/latency gap is structural). All scenarios are owner-scoped CRUD —
inside the closed grammar by construction. Gemini 2.5 Flash was excluded: its
free-tier rate-limits (429) invalidated the run. Next: harder multi-entity
scenarios and cheaper models, where the silent-bug gap should widen.
