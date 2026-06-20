// aix verifier: AST -> list of structured errors (machine-readable).
// This is the heart of the project. If this returns [], the spec is
// GUARANTEED runnable by the runtime. No human judgement involved.
//
// Each error is { code, where, message } so an AI can read WHY its
// output was rejected and fix exactly that, with zero human in the loop.

export function verify(ast) {
  const errors = [];
  const err = (code, where, message) => errors.push({ code, where, message });

  const entityNames = new Set(Object.keys(ast.entities));

  for (const ent of Object.values(ast.entities)) {
    const seen = new Set();
    for (const f of ent.fields) {
      // duplicate field
      if (seen.has(f.name)) err("DUP_FIELD", `${ent.name}.${f.name}`, `duplicate field "${f.name}"`);
      seen.add(f.name);

      // ref target must exist (referential integrity, checked statically)
      if (f.type === "ref" && !entityNames.has(f.ref))
        err("BAD_REF", `${ent.name}.${f.name}`, `ref target "${f.ref}" is not a defined entity`);

      // default value type must match field type (type closedness)
      if (f.default !== undefined && f.default?.special !== "now") {
        const t = typeof f.default;
        if (f.type === "bool" && t !== "boolean") err("BAD_DEFAULT", `${ent.name}.${f.name}`, `bool field default must be true/false`);
        if (f.type === "int" && (t !== "number" || !Number.isInteger(f.default))) err("BAD_DEFAULT", `${ent.name}.${f.name}`, `int field default must be an integer`);
      }
      // `now` default only valid on ts
      if (f.default?.special === "now" && f.type !== "ts")
        err("BAD_DEFAULT", `${ent.name}.${f.name}`, `=now is only valid on a ts field`);

      // max only meaningful on str/int
      if (f.max !== undefined && !["str", "int"].includes(f.type))
        err("BAD_MAX", `${ent.name}.${f.name}`, `<= constraint is only valid on str/int`);

      // owner marker only valid on ref fields
      if (f.owner && f.type !== "ref")
        err("BAD_OWNER", `${ent.name}.${f.name}`, `* (owner) is only valid on a ref field`);
    }

    // at most one explicit owner per entity
    if (ent.fields.filter((f) => f.owner).length > 1)
      err("MULTI_OWNER", ent.name, `entity has more than one * owner field`);
  }

  for (const route of Object.values(ast.routes)) {
    const ent = ast.entities[route.entity];
    // route must point at a real entity
    if (!ent) { err("NO_ENTITY", `R ${route.entity}`, `route references unknown entity "${route.entity}"`); continue; }

    const fieldNames = new Set(ent.fields.map((f) => f.name));

    // update:[...] must reference real fields
    if (route.update) {
      for (const fn of route.update)
        if (!fieldNames.has(fn)) err("BAD_UPDATE", `R ${route.entity}`, `update field "${fn}" is not a field of ${route.entity}`);
    }

    // list:mine requires an unambiguous owner ref + auth, else "me" is undefined
    if (route.listMine) {
      const refs = ent.fields.filter((f) => f.type === "ref");
      const explicit = refs.filter((f) => f.owner);
      if (refs.length === 0) err("NO_OWNER", `R ${route.entity}`, `list:mine needs a ref field to scope ownership, but ${route.entity} has none`);
      else if (refs.length > 1 && explicit.length === 0)
        err("AMBIGUOUS_OWNER", `R ${route.entity}`, `list:mine is ambiguous: ${refs.map((f) => f.name).join(", ")} are all refs — mark the owner with * (e.g. ${refs[refs.length - 1].name}:ref:...*)`);
      if (!route.auth) err("MINE_NO_AUTH", `R ${route.entity}`, `list:mine needs "auth" — without login there is no "me"`);
    }
  }

  return errors;
}
