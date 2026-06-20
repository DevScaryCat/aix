// Zero-dependency multi-provider LLM client (Node 18+ global fetch).
// Used by the LLM-in-the-loop benchmark. Keys come from the environment
// (load via `node --env-file=.env ...`), never hard-coded.

export const DEFAULT_MODELS = {
  anthropic: process.env.AIX_ANTHROPIC_MODEL || "claude-opus-4-8",
  gemini: process.env.AIX_GEMINI_MODEL || "gemini-2.5-flash",
};

export const ENV_KEY = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

async function callAnthropic({ apiKey, model, system, prompt, maxTokens = 1024 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, model: data.model || model, stop: data.stop_reason };
}

async function callGemini({ apiKey, model, system, prompt, maxTokens = 1024 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("");
  return { text, model, finish: data.candidates?.[0]?.finishReason };
}

// List Gemini models that support generateContent — handy when a model id 404s.
export async function listGeminiModels(apiKey) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`gemini models ${res.status}`);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

// Unified entry point. Returns { text, model, ... }.
export async function callModel(provider, opts) {
  if (provider === "anthropic") return callAnthropic(opts);
  if (provider === "gemini") return callGemini(opts);
  throw new Error(`unknown provider: ${provider}`);
}
