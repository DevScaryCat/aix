// aix lints: ADVISORY warnings, deliberately kept OUT of verify.mjs.
//
// verify.mjs answers one question, totally and decidably: "will the runtime
// execute exactly what this spec says?" (pass == runnable). lint.mjs answers a
// DIFFERENT, weaker question: "does the spec probably say what you MEANT?" —
// the intent-level mistakes a type checker cannot prove wrong but that are
// usually bugs (the cross-owner data leak being the canonical one).
//
// Hard rule: these NEVER block. They are returned on a separate channel and do
// not touch verify()'s errors[] or the accept/reject gate — so the totality of
// "pass == runnable" is preserved byte-for-byte. Each lint is still a finite
// first-order predicate over the SAME closed symbol table (no runtime data, no
// heuristics on values), so the lint pass is itself total and deterministic.
import { ownerOf } from "./owner.mjs";

export function lint(ast) {
  const warnings = [];
  const warn = (code, where, message) => warnings.push({ code, where, message });

  for (const route of Object.values(ast.routes)) {
    const ent = ast.entities[route.entity];
    if (!ent) continue; // unknown entity is already a hard verify error (NO_ENTITY)
    const owner = ownerOf(ent);

    // OPEN_MUTATION — update/delete with no login gate: any anonymous client can
    // modify or remove any row. (create+owner is already a hard verify ERROR via
    // OWNER_CREATE_NO_AUTH; this covers the update/delete gap, which verify lets
    // pass because a public, world-writable resource is technically runnable.)
    if ((route.update || route.delete) && !route.auth) {
      const ops = [route.update && "update", route.delete && "delete"].filter(Boolean).join("/");
      warn(
        "OPEN_MUTATION",
        `R ${route.entity}`,
        `${ops} is exposed without auth — any client can modify or delete any ${route.entity} row. Add "auth" (or "list:mine") if this should require login.`,
      );
    }

    // OWNED_READ_OPEN — the entity IS owned (has an owner ref) and login is
    // required, yet a read op is not scoped to the owner, so any logged-in user
    // can read every OTHER user's rows. This is the exact cross-owner leak the
    // verifier cannot reject: a public catalog (e.g. a shop) legitimately wants a
    // plain `list`, so it is intent-dependent — hence ADVISORY, not an error.
    if (owner && route.auth) {
      const leaks = [];
      if (route.list && !route.listMine) leaks.push("list");
      if (route.get && !route.private) leaks.push("get");
      if (leaks.length) {
        const fix = leaks.includes("list") && leaks.includes("get") ? '"list:mine" / "private"' : leaks.includes("list") ? '"list:mine"' : '"private"';
        warn(
          "OWNED_READ_OPEN",
          `R ${route.entity}`,
          `${leaks.join(" & ")} return every owner's rows, but ${route.entity} has an owner ref "${owner.name}". If each user should only see their own, use ${fix}. (Ignore if this resource is meant to be public.)`,
        );
      }
    }
  }
  return warnings;
}
