#!/usr/bin/env node
// Smoke-test your API keys before running the full benchmark.
//
//   node --env-file=.env bench/check-keys.mjs   (or: npm run bench:keys)
//
// Calls each provider with a trivial prompt and reports OK / FAIL. On a Gemini
// model error it also lists the models your key can actually use.
import { callModel, listGeminiModels, DEFAULT_MODELS, ENV_KEY } from "./providers.mjs";

const PROBE = "Reply with exactly the two characters: OK";

const targets = [
  { provider: "anthropic", model: DEFAULT_MODELS.anthropic },
  { provider: "gemini", model: DEFAULT_MODELS.gemini },
];

let anyFail = false;
let anyKey = false;

for (const t of targets) {
  const key = process.env[ENV_KEY[t.provider]];
  if (!key) {
    console.log(`• ${t.provider.padEnd(10)} — no ${ENV_KEY[t.provider]} set (skipping)`);
    continue;
  }
  anyKey = true;
  process.stdout.write(`• ${t.provider.padEnd(10)} ${t.model}  …  `);
  try {
    const r = await callModel(t.provider, {
      apiKey: key,
      model: t.model,
      prompt: PROBE,
      maxTokens: 16,
    });
    console.log(`OK  → "${(r.text || "").trim().slice(0, 24)}"`);
  } catch (e) {
    anyFail = true;
    console.log(`FAIL`);
    console.log(`    ${e.message}`);
    if (t.provider === "gemini") {
      try {
        const models = await listGeminiModels(key);
        console.log(`    models your key can use: ${models.slice(0, 14).join(", ")}`);
        console.log(`    → set AIX_GEMINI_MODEL=<one of the above> in .env`);
      } catch {
        /* ignore secondary failure */
      }
    }
  }
}

if (!anyKey) {
  console.log("\nNo keys found. Put them in .env (see .env.example) and run with --env-file=.env.");
  process.exit(2);
}
console.log(anyFail ? "\nSome checks failed — fix the above, then re-run." : "\nAll keys working. ✓");
process.exit(anyFail ? 1 : 0);
