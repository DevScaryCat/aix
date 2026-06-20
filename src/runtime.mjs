// aix runtime: interprets a verified AST as a live CRUD API.
// There is NO generated code — this fixed, trusted interpreter walks the AST
// per request. Storage is in-memory (zero deps) for v0.
import http from "node:http";
import { ownerOf } from "./owner.mjs";

function nowISO() {
  return new Date().toISOString();
}

// In-memory store: one Map + id counter per entity.
function makeStore(ast) {
  const store = {};
  for (const name of Object.keys(ast.entities)) store[name] = { rows: new Map(), nextId: 1 };
  return store;
}

function err(status, code, field, message) {
  return { ok: false, status, error: { code, field, message } };
}

// Validate + coerce an incoming record against an entity definition. On create
// the owner is forced to the logged-in user (clients cannot spoof ownership).
function buildRecord(entity, body, currentUser, store, entityName, isCreate, existingId) {
  const out = {};
  const owner = ownerOf(entity);

  for (const f of entity.fields) {
    let v = body[f.name];

    // owner ref: always the logged-in user on create (override any supplied value)
    if (owner && f.name === owner.name && isCreate && currentUser !== null) v = currentUser;

    if (v === undefined || v === null) {
      // explicit null is treated like "absent": a field with a default reverts to
      // it (never wiped past type/enum/ref validation); a required field errors.
      if (f.default !== undefined) {
        out[f.name] = f.default?.special === "now" ? nowISO() : f.default;
        continue;
      }
      if (f.required) return err(400, "REQUIRED", f.name, `field "${f.name}" is required`);
      out[f.name] = null;
      continue;
    }

    // type checks
    if (f.type === "str" && typeof v !== "string") return typeErr(f, "string");
    if (f.type === "int" && !Number.isInteger(v)) return typeErr(f, "integer");
    if (f.type === "bool" && typeof v !== "boolean") return typeErr(f, "boolean");
    if (f.type === "enum" && !(f.enum || []).includes(v))
      return err(400, "BAD_ENUM", f.name, `"${f.name}" must be one of ${(f.enum || []).join("|")}`);
    if (f.type === "str" && f.max !== undefined && v.length > f.max)
      return err(400, "TOO_LONG", f.name, `"${f.name}" exceeds max length ${f.max}`);
    if (f.type === "int" && f.max !== undefined && v > f.max)
      return err(400, "TOO_BIG", f.name, `"${f.name}" exceeds max ${f.max}`);

    // referential integrity: a non-owner ref must point at an existing row
    if (f.type === "ref" && (!owner || f.name !== owner.name)) {
      const id = Number(v);
      if (!Number.isInteger(id)) return err(400, "BAD_REF", f.name, `"${f.name}" must be a numeric id`);
      const target = store[f.ref];
      if (!target || !target.rows.has(id)) return err(400, "BAD_REF_ROW", f.name, `"${f.name}" points at a ${f.ref} that does not exist`);
      v = id;
    }

    // uniqueness: no other row may already hold this value
    if (f.unique) {
      for (const row of store[entityName].rows.values()) {
        if (row.id !== existingId && row[f.name] === v) return err(409, "CONFLICT", f.name, `"${f.name}" must be unique ("${v}" already exists)`);
      }
    }

    out[f.name] = v;
  }
  return { ok: true, value: out };
}

function typeErr(f, want) {
  return err(400, "BAD_TYPE", f.name, `"${f.name}" must be ${want}`);
}

function coerceQuery(s, f) {
  if (!f) return s;
  if (f.type === "int") {
    const n = Number(s);
    return Number.isInteger(n) ? n : undefined;
  }
  if (f.type === "bool") return s === "true" ? true : s === "false" ? false : undefined;
  return s;
}

// list-time equality filter (declared fields only) + sort + pagination
function applyQuery(rows, route, entity, url) {
  let out = rows;
  if (route.filter) {
    for (const name of route.filter) {
      if (!url.searchParams.has(name)) continue;
      const f = entity.fields.find((x) => x.name === name);
      if (f && f.type === "ref") {
        const q = url.searchParams.get(name);
        out = out.filter((r) => String(r[name]) === String(q));
        continue;
      }
      const qv = coerceQuery(url.searchParams.get(name), f);
      if (qv === undefined) continue; // uncoercible query value -> ignore this filter
      out = out.filter((r) => r[name] === qv);
    }
  }
  if (route.sort) {
    const dir = route.sortDir === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => (a[route.sort] < b[route.sort] ? -dir : a[route.sort] > b[route.sort] ? dir : 0));
  }
  if (route.page) {
    const rawLimit = url.searchParams.get("limit");
    let limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 0) limit = 50;
    limit = Math.min(limit, 200);
    let offset = Number(url.searchParams.get("offset"));
    if (!Number.isInteger(offset) || offset < 0) offset = 0;
    out = out.slice(offset, offset + limit);
  }
  return out;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export function createServer(ast) {
  const store = makeStore(ast);

  return http.createServer(async (req, res) => {
   try {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean); // ["todo"] or ["todo","3"]
    const entityName = parts[0];
    const id = parts[1];

    const route = ast.routes[entityName];
    const entity = ast.entities[entityName];
    if (!route || !entity) return send(res, 404, { error: "no such resource" });

    // auth: the runtime enforces it, the spec declared it (list:mine implies it).
    const currentUser = req.headers["x-user-id"] || null;
    if (route.auth && currentUser === null) return send(res, 401, { error: "auth required (set x-user-id header)" });

    const ownerField = ownerOf(entity);
    const table = store[entityName];

    // single-row owner scope (private): not your row => 404 (no existence leak)
    const denyPrivate = (row) =>
      route.private && ownerField &&
      (currentUser === null || row[ownerField.name] === null || String(row[ownerField.name]) !== String(currentUser));

    // ---- LIST ----
    if (req.method === "GET" && !id) {
      if (!route.list) return send(res, 405, { error: "list not enabled" });
      let rows = [...table.rows.values()];
      if (route.listMine && ownerField) rows = rows.filter((r) => String(r[ownerField.name]) === String(currentUser));
      rows = applyQuery(rows, route, entity, url);
      return send(res, 200, rows);
    }

    // ---- GET one ----
    if (req.method === "GET" && id) {
      if (!route.get) return send(res, 405, { error: "get not enabled" });
      const row = table.rows.get(Number(id));
      if (!row || denyPrivate(row)) return send(res, 404, { error: "not found" });
      return send(res, 200, row);
    }

    // ---- CREATE ----
    if (req.method === "POST") {
      if (!route.create) return send(res, 405, { error: "create not enabled" });
      const body = await readBody(req);
      if (body === null) return send(res, 400, { error: "invalid JSON" });
      const built = buildRecord(entity, body, currentUser, store, entityName, true, null);
      if (!built.ok) return send(res, built.status, built.error);
      const newId = table.nextId++;
      const row = { id: newId, ...built.value };
      table.rows.set(newId, row);
      return send(res, 201, row);
    }

    // ---- UPDATE ----
    if (req.method === "PATCH" && id) {
      if (!route.update) return send(res, 405, { error: "update not enabled" });
      const row = table.rows.get(Number(id));
      if (!row || denyPrivate(row)) return send(res, 404, { error: "not found" });
      const body = await readBody(req);
      if (body === null) return send(res, 400, { error: "invalid JSON" });
      // only fields the spec allowed may change
      for (const key of Object.keys(body))
        if (!route.update.includes(key)) return send(res, 403, { code: "FIELD_LOCKED", field: key, message: `field "${key}" is not updatable per spec` });
      const merged = { ...row, ...body };
      if (ownerField) merged[ownerField.name] = row[ownerField.name]; // ownership is immutable after create
      const built = buildRecord(entity, merged, currentUser, store, entityName, false, row.id);
      if (!built.ok) return send(res, built.status, built.error);
      const next = { id: row.id, ...built.value };
      table.rows.set(row.id, next);
      return send(res, 200, next);
    }

    // ---- DELETE ----
    if (req.method === "DELETE" && id) {
      if (!route.delete) return send(res, 405, { error: "delete not enabled" });
      const row = table.rows.get(Number(id));
      if (!row || denyPrivate(row)) return send(res, 404, { error: "not found" });
      table.rows.delete(Number(id));
      return send(res, 204, {});
    }

    return send(res, 405, { error: "method not allowed" });
   } catch {
    return send(res, 400, { error: "bad request" });
   }
  });
}
