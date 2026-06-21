// Shared resolvers imported by BOTH verify.mjs and runtime.mjs so the two can
// never drift (a symbol the runtime dereferences must be one the verifier
// pre-checked). This is the "verify/runtime lockstep by construction" rule.

// The DIRECT owner field of an entity: an explicit *-marked ref, else the single
// ref if unique, else null (ambiguous — the verifier rejects routes that need
// it). Excludes owner-via-parent (^) refs, which carry ownership by proxy rather
// than holding the owner's id on the row itself.
export function ownerOf(entity) {
  const refs = entity.fields.filter((f) => f.type === "ref" && !f.ownerVia);
  return refs.find((f) => f.owner) || (refs.length === 1 ? refs[0] : null);
}

// The owner-via-parent ref (^), if any: this row is owned through the row it
// references, one hop (e.g. task>project^). The parent must itself have a direct
// ownerOf — the verifier enforces that, so resolution is total and bounded.
export function ownerVia(entity) {
  return entity.fields.find((f) => f.type === "ref" && f.ownerVia) || null;
}

// Pure, bounded Levenshtein over declared symbols — powers "did you mean"
// hints in verifier errors. Data-independent and total (no runtime values).
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

// Closest candidate within maxDist. Deterministic tie-break: smallest distance,
// then declaration order (candidates are iterated in order; strict < keeps the
// first). Returns null if nothing is close enough.
export function closest(word, candidates, maxDist = 2) {
  let best = null;
  let bestD = maxDist + 1;
  for (const c of candidates) {
    const d = levenshtein(word, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= maxDist ? best : null;
}

const hint = (word, candidates) => {
  const c = closest(word, candidates);
  return c ? ` — did you mean "${c}"?` : "";
};
export { hint };
