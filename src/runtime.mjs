// aix runtime: interprets a verified AST as a live CRUD API.
// There is NO generated code. This fixed, trusted interpreter walks the
// AST per request. Storage is in-memory (zero deps) for v0.

import http from "node:http";

function nowISO() {
  return new Date().toISOString();
}

// Build the in-memory store: one Map + id counter per entity.
function makeStore(ast) {
  const store = {};
  for (const name of Object.keys(ast.entities)) store[name] = { rows: new Map(), nextId: 1 };
  return store;
}

// The owner field: an explicit *-marked ref, else the single ref if unique.
function ownerOf(entity) {
  const refs = entity.fields.filter((f) => f.type === "ref");
  return refs.find((f) => f.owner) || (refs.length === 1 ? refs[0] : null);
}

// Validate + coerce an incoming record against an entity definition.
// Returns { ok, value } or { ok:false, error }.
function buildRecord(entity, body, currentUser) {
  const out = {};
  const owner = ownerOf(entity);
  for (const f of entity.fields) {
    let v = body[f.name];

    // auto-assign the owner ref from the logged-in user
    if (owner && f.name === owner.name && v === undefined && currentUser !== null) v = currentUser;

    if (v === undefined) {
      if (f.default !== undefined) { out[f.name] = f.default?.special === "now" ? nowISO() : f.default; continue; }
      if (f.required) return { ok: false, error: { code: "REQUIRED", field: f.name, message: `field "${f.name}" is required` } };
      out[f.name] = null;
      continue;
    }

    // type checks
    if (f.type === "str" && typeof v !== "string") return typeErr(f, "string");
    if (f.type === "int" && !Number.isInteger(v)) return typeErr(f, "integer");
    if (f.type === "bool" && typeof v !== "boolean") return typeErr(f, "boolean");
    if (f.type === "str" && f.max !== undefined && v.length > f.max)
      return { ok: false, error: { code: "TOO_LONG", field: f.name, message: `"${f.name}" exceeds max length ${f.max}` } };
    if (f.type === "int" && f.max !== undefined && v > f.max)
      return { ok: false, error: { code: "TOO_BIG", field: f.name, message: `"${f.name}" exceeds max ${f.max}` } };

    out[f.name] = v;
  }
  return { ok: true, value: out };
}

function typeErr(f, want) {
  return { ok: false, error: { code: "BAD_TYPE", field: f.name, message: `"${f.name}" must be ${want}` } };
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); }
    });
  });
}

export function createServer(ast) {
  const store = makeStore(ast);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean); // ["todo"] or ["todo","3"]
    const entityName = parts[0];
    const id = parts[1];

    const route = ast.routes[entityName];
    const entity = ast.entities[entityName];
    if (!route || !entity) return send(res, 404, { error: "no such resource" });

    // auth: the runtime enforces it, the spec just declared it.
    const currentUser = req.headers["x-user-id"] || null;
    if (route.auth && currentUser === null) return send(res, 401, { error: "auth required (set x-user-id header)" });

    const ownerField = ownerOf(entity);
    const table = store[entityName];

    // ---- LIST ----
    if (req.method === "GET" && !id) {
      if (!route.list) return send(res, 405, { error: "list not enabled" });
      let rows = [...table.rows.values()];
      if (route.listMine && ownerField) rows = rows.filter((r) => String(r[ownerField.name]) === String(currentUser));
      return send(res, 200, rows);
    }

    // ---- GET one ----
    if (req.method === "GET" && id) {
      if (!route.get) return send(res, 405, { error: "get not enabled" });
      const row = table.rows.get(Number(id));
      return row ? send(res, 200, row) : send(res, 404, { error: "not found" });
    }

    // ---- CREATE ----
    if (req.method === "POST") {
      if (!route.create) return send(res, 405, { error: "create not enabled" });
      const body = await readBody(req);
      if (body === null) return send(res, 400, { error: "invalid JSON" });
      const built = buildRecord(entity, body, currentUser);
      if (!built.ok) return send(res, 400, built.error);
      const newId = table.nextId++;
      const row = { id: newId, ...built.value };
      table.rows.set(newId, row);
      return send(res, 201, row);
    }

    // ---- UPDATE ----
    if (req.method === "PATCH" && id) {
      if (!route.update) return send(res, 405, { error: "update not enabled" });
      const row = table.rows.get(Number(id));
      if (!row) return send(res, 404, { error: "not found" });
      const body = await readBody(req);
      if (body === null) return send(res, 400, { error: "invalid JSON" });
      // only fields the spec allowed may change
      for (const key of Object.keys(body))
        if (!route.update.includes(key)) return send(res, 403, { code: "FIELD_LOCKED", field: key, message: `field "${key}" is not updatable per spec` });
      const merged = { ...row, ...body };
      const built = buildRecord(entity, merged, currentUser);
      if (!built.ok) return send(res, 400, built.error);
      const next = { id: row.id, ...built.value };
      table.rows.set(row.id, next);
      return send(res, 200, next);
    }

    // ---- DELETE ----
    if (req.method === "DELETE" && id) {
      if (!route.delete) return send(res, 405, { error: "delete not enabled" });
      const ok = table.rows.delete(Number(id));
      return ok ? send(res, 204, {}) : send(res, 404, { error: "not found" });
    }

    return send(res, 405, { error: "method not allowed" });
  });
}
