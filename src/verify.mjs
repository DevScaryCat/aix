// aix verifier: AST -> list of structured errors (machine-readable).
// This is the heart. If it returns [], the spec is GUARANTEED runnable by the
// runtime — no human judgement. Every check is a finite, first-order predicate
// over a closed-world symbol table (no runtime data, no LLM), so verification
// is total and decidable.
//
// Each error is { code, where, message } so an AI can read WHY its output was
// rejected and fix exactly that, with zero human in the loop.
import { ownerOf, ownerVia, hint } from "./owner.mjs";

export function verify(ast) {
  const errors = [];
  const err = (code, where, message) => errors.push({ code, where, message });

  const entityNames = [...Object.keys(ast.entities)];
  const entitySet = new Set(entityNames);

  for (const ent of Object.values(ast.entities)) {
    const seen = new Set();
    for (const f of ent.fields) {
      // duplicate field
      if (seen.has(f.name)) err("DUP_FIELD", `${ent.name}.${f.name}`, `duplicate field "${f.name}"`);
      seen.add(f.name);

      // ref target must exist (referential integrity, checked statically)
      if (f.type === "ref" && !entitySet.has(f.ref))
        err("BAD_REF", `${ent.name}.${f.name}`, `ref target "${f.ref}" is not a defined entity${hint(f.ref, entityNames)}`);

      // enum must have at least one value
      if (f.type === "enum" && (!f.enum || f.enum.length === 0))
        err("EMPTY_ENUM", `${ent.name}.${f.name}`, `enum field "${f.name}" has no values (use enum[a|b|c])`);

      // default value must match the field type / be a member of the enum
      if (f.default !== undefined && f.default?.special !== "now") {
        if (f.type === "enum") {
          if (f.enum && f.enum.length && !f.enum.includes(f.default))
            err("BAD_DEFAULT", `${ent.name}.${f.name}`, `enum default "${f.default}" must be one of ${f.enum.join("|")}`);
        } else {
          const t = typeof f.default;
          if (f.type === "bool" && t !== "boolean") err("BAD_DEFAULT", `${ent.name}.${f.name}`, `bool field default must be true/false`);
          if (f.type === "int" && (t !== "number" || !Number.isInteger(f.default))) err("BAD_DEFAULT", `${ent.name}.${f.name}`, `int field default must be an integer`);
        }
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

      // unique marker only valid on str/int
      if (f.unique && !["str", "int"].includes(f.type))
        err("BAD_UNIQUE", `${ent.name}.${f.name}`, `~ (unique) is only valid on str/int`);
    }

    // at most one explicit owner per entity
    if (ent.fields.filter((f) => f.owner).length > 1)
      err("MULTI_OWNER", ent.name, `entity has more than one * owner field`);

    // owner-via-parent (^): can't combine with a direct * owner, and the parent
    // it points at must itself have a resolvable owner to inherit (single hop).
    const viaField = ownerVia(ent);
    if (viaField) {
      if (ent.fields.some((f) => f.owner))
        err("OWNER_VIA_CONFLICT", `${ent.name}.${viaField.name}`, `^ (owner-via-parent) cannot be combined with a * owner on the same entity`);
      if (ent.fields.filter((f) => f.ownerVia).length > 1)
        err("OWNER_VIA_CONFLICT", ent.name, `entity has more than one ^ owner-via-parent field`);
      const parent = ast.entities[viaField.ref]; // BAD_REF already fires if undefined
      if (parent && !ownerOf(parent))
        err("NO_PARENT_OWNER", `${ent.name}.${viaField.name}`, `^ owner-via-parent points at "${viaField.ref}", which has no owner ref to inherit ownership from`);
    }
  }

  for (const route of Object.values(ast.routes)) {
    const ent = ast.entities[route.entity];
    if (!ent) {
      err("NO_ENTITY", `R ${route.entity}`, `route references unknown entity "${route.entity}"${hint(route.entity, entityNames)}`);
      continue;
    }
    const fieldNames = ent.fields.map((f) => f.name);
    const fieldSet = new Set(fieldNames);
    const ownerField = ownerOf(ent);
    const viaField = ownerVia(ent);

    // update:[...] must reference real fields — and never the owner ref (direct
    // or the owner-via-parent ref, both of which fix ownership at create time)
    if (route.update) {
      for (const fn of route.update) {
        if (!fieldSet.has(fn)) err("BAD_UPDATE", `R ${route.entity}`, `update field "${fn}" is not a field of ${route.entity}${hint(fn, fieldNames)}`);
        else if ((ownerField && fn === ownerField.name) || (viaField && fn === viaField.name)) err("OWNER_LOCKED", `R ${route.entity}`, `owner ref "${fn}" cannot be in update:[...] — ownership is immutable after create`);
      }
    }

    // filter:[...] must reference real fields
    if (route.filter) {
      for (const fn of route.filter)
        if (!fieldSet.has(fn)) err("FILTER_FIELD", `R ${route.entity}`, `filter field "${fn}" is not a field of ${route.entity}${hint(fn, fieldNames)}`);
    }

    // sort field must exist and be orderable
    if (route.sort) {
      const sf = ent.fields.find((f) => f.name === route.sort);
      if (!sf) err("SORT_FIELD", `R ${route.entity}`, `sort field "${route.sort}" is not a field of ${route.entity}${hint(route.sort, fieldNames)}`);
      else if (!["str", "int", "ts"].includes(sf.type)) err("SORT_FIELD", `R ${route.entity}`, `sort field "${route.sort}" must be str/int/ts`);
    }

    // owner-scoped routes (list:mine / private) need an unambiguous owner ref.
    // An owner-via-parent (^) ref settles it unambiguously, so only plain
    // direct-owner entities can be ambiguous.
    if ((route.listMine || route.private) && !viaField) {
      const refs = ent.fields.filter((f) => f.type === "ref");
      const explicit = refs.filter((f) => f.owner);
      const which = route.listMine ? "list:mine" : "private";
      if (refs.length === 0) err("NO_OWNER", `R ${route.entity}`, `${which} needs a ref field to scope ownership, but ${route.entity} has none`);
      else if (refs.length > 1 && explicit.length === 0)
        err("AMBIGUOUS_OWNER", `R ${route.entity}`, `${which} is ambiguous: ${refs.map((f) => f.name).join(", ")} are all refs — mark the owner with * (e.g. ${refs[refs.length - 1].name}>...*)`);
    }

    // `private` scopes single-row ops, but a public `list` returns everyone's rows
    if (route.private && route.list && !route.listMine)
      err("PRIVATE_LIST", `R ${route.entity}`, `private scopes get/update/delete to the owner, but plain "list" returns every owner's rows — use "list:mine" (or drop "list")`);

    // a create route whose entity is owner-scoped (direct ref OR via-parent)
    // needs auth — the owner is taken from / checked against the logged-in user
    if (route.create && (ownerField || viaField) && !route.auth)
      err("OWNER_CREATE_NO_AUTH", `R ${route.entity}`, `create on ${route.entity} is owner-scoped (${ownerField ? `owner ref "${ownerField.name}"` : `via parent "${viaField.name}"`}) — add auth (or list:mine) so ownership is tied to the logged-in user`);
  }

  return errors;
}
