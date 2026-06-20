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

## What is NOT measured here (and why)

First-try pass rate and retry count require generating both versions with a
**live LLM** and running the results. That needs an API key and belongs in
`bench/llm-run.mjs` (a stub, not faked numbers). The hypothesis to test there:

> Next.js generation produces plausible-but-wrong code a human must debug.
> aix generation, when wrong, is rejected by the verifier and the model fixes
> itself — **human interventions trend to 0.**
