// Behavioral contract suite. Hits a running backend over HTTP and classifies
// each invariant as:
//   pass   — behaved correctly
//   loud   — errored in a machine-visible way (wrong status / crash)
//   silent — returned 2xx but did the wrong thing (the bug a human must notice)
//
// The SAME suite runs against the aix runtime and against model-generated
// imperative servers, so the only variable is how the backend was produced.

async function req(base, method, path, { user, body } = {}) {
  const headers = {};
  if (user) headers["x-user-id"] = user;
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e), netError: true };
  }
}

const ok2xx = (s) => s >= 200 && s < 300;
const is4xx = (s) => s >= 400 && s < 500;

export async function runContract(base, sc) {
  const checks = [];
  const add = (name, kind, detail = "") => checks.push({ name, kind, detail });
  const userA = "alice";
  const userB = "bob";
  const e = sc.entity;

  // 1. auth enforced — create without a login header must be rejected
  {
    const r = await req(base, "POST", `/${e}`, { body: sc.validCreate(userA) });
    if (r.status === 401) add("auth_enforced", "pass");
    else if (ok2xx(r.status)) add("auth_enforced", "silent", `unauth create accepted (${r.status})`);
    else add("auth_enforced", "loud", `expected 401, got ${r.status}`);
  }

  // 2. create works (baseline) — capture the new id
  let createdId = null;
  {
    const r = await req(base, "POST", `/${e}`, { user: userA, body: sc.validCreate(userA) });
    if (ok2xx(r.status) && r.json && r.json.id !== undefined) {
      add("create_ok", "pass");
      createdId = r.json.id;
    } else {
      add("create_ok", "loud", `expected 2xx+id, got ${r.status} ${r.text.slice(0, 80)}`);
    }
  }

  // 3. owner auto-assigned from the logged-in user
  if (createdId !== null) {
    const r = await req(base, "GET", `/${e}/${createdId}`, { user: userA });
    const owner = r.json ? r.json[sc.ownerField] : undefined;
    if (ok2xx(r.status) && String(owner) === userA) add("owner_assigned", "pass");
    else add("owner_assigned", "silent", `${sc.ownerField}=${JSON.stringify(owner)} (expected "${userA}")`);
  }

  // 4. list:mine scoping — another user must not see A's row
  if (sc.listMine && createdId !== null) {
    const r = await req(base, "GET", `/${e}`, { user: userB });
    const rows = Array.isArray(r.json) ? r.json : [];
    const leaked = rows.some((row) => row && String(row.id) === String(createdId));
    if (!leaked) add("list_mine_scoped", "pass");
    else add("list_mine_scoped", "silent", "user B sees user A's row");
  }

  // 5. required-field validation
  {
    const body = sc.validCreate(userA);
    delete body[sc.requiredField];
    const r = await req(base, "POST", `/${e}`, { user: userA, body });
    if (is4xx(r.status)) add("required_validation", "pass");
    else if (ok2xx(r.status)) add("required_validation", "silent", `missing "${sc.requiredField}" accepted (${r.status})`);
    else add("required_validation", "loud", `expected 4xx, got ${r.status}`);
  }

  // 6. max-length validation
  if (sc.maxField) {
    const body = sc.validCreate(userA);
    body[sc.maxField] = "x".repeat(sc.maxLen + 1);
    const r = await req(base, "POST", `/${e}`, { user: userA, body });
    if (is4xx(r.status)) add("maxlen_validation", "pass");
    else if (ok2xx(r.status)) add("maxlen_validation", "silent", `over-max "${sc.maxField}" accepted (${r.status})`);
    else add("maxlen_validation", "loud", `expected 4xx, got ${r.status}`);
  }

  // 7. type validation
  if (sc.typeField) {
    const body = sc.validCreate(userA);
    body[sc.typeField] = sc.badTypeValue;
    const r = await req(base, "POST", `/${e}`, { user: userA, body });
    if (is4xx(r.status)) add("type_validation", "pass");
    else if (ok2xx(r.status)) add("type_validation", "silent", `bad-type "${sc.typeField}" accepted (${r.status})`);
    else add("type_validation", "loud", `expected 4xx, got ${r.status}`);
  }

  // 8. field lock — editing a non-updatable field must be rejected
  if (sc.updatable && sc.lockedField && createdId !== null) {
    const r = await req(base, "PATCH", `/${e}/${createdId}`, {
      user: userA,
      body: { [sc.lockedField]: "hacked" },
    });
    if (is4xx(r.status)) add("field_lock", "pass");
    else if (ok2xx(r.status)) add("field_lock", "silent", `editing locked "${sc.lockedField}" accepted (${r.status})`);
    else add("field_lock", "loud", `expected 4xx, got ${r.status}`);
  }

  const silent = checks.filter((c) => c.kind === "silent").length;
  const loud = checks.filter((c) => c.kind === "loud").length;
  const passed = checks.length > 0 && silent === 0 && loud === 0;
  return { checks, passed, silent, loud, total: checks.length };
}
