// aix parser: .aix source text  ->  AST (plain JSON)
// The grammar is deliberately tiny and regular so a machine can both EMIT it
// cheaply (few tokens) and PARSE it deterministically.
//
// Grammar (one statement per line, `#` starts a comment). Braces are optional:
//   E <name> <field>, <field>, ...           # entity  (E <name> { ... } also ok)
//   R <entity> <op>, <op>, ...               # routes  (R <entity> { ... } also ok)
//
//   field : <name>:<type>[:<refEntity>][!][*][~][<=<n>][=<default>]
//           <name>><refEntity>[!][*]         # `>` is shorthand for :ref:
//           <name>@                          # `@` is shorthand for :ts=now
//           <name>:enum[a|b|c][!][=<default>]
//   type  : str | int | bool | ts | ref
//   marks : ! required · * owner (ref) · ~ unique (str/int) · <=n max · =d default
//   op    : list | list:mine | get | create | update:[a,b] | delete | auth
//           | private | filter:[a,b] | sort:<field>[:asc|:desc] | page
//
// Example:
//   E user name:str!, email:str!~
//   E post title:str!<=200, body:str!, status:enum[draft|published]=draft, author>user, created@
//   R post list:mine, get, create, update:[title,body,status], delete

const TYPES = new Set(["str", "int", "bool", "ts", "ref"]);

export class ParseError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "ParseError";
    this.line = line;
  }
}

function parseField(raw, lineNo) {
  // `@` shorthand:  created@  ->  created:ts=now
  let m = raw.match(/^(\w+)@(!)?$/);
  if (m) return { name: m[1], type: "ts", required: !!m[2], default: { special: "now" } };

  // `>` shorthand:  author>user  ->  author:ref:user
  //   `*` marks a DIRECT owner (a user ref holding the owner's id).
  //   `^` marks owner-VIA-parent: this row is owned through the row it points
  //   at, one hop (e.g. task>project^ — a task is owned by whoever owns its
  //   project). Closed, finite: no expression, just a marker the runtime follows.
  m = raw.match(/^(\w+)>(\w+)(!)?(\*)?(\^)?$/);
  if (m) {
    const field = { name: m[1], type: "ref", ref: m[2], required: !!m[3] };
    if (m[4]) field.owner = true;
    if (m[5]) field.ownerVia = true;
    return field;
  }

  // enum:  status:enum[draft|published|archived][!][=default]
  m = raw.match(/^(\w+):enum\[([^\]]*)\](!)?(?:=(.+))?$/);
  if (m) {
    const values = m[2].split("|").map((s) => s.trim()).filter(Boolean);
    const field = { name: m[1], type: "enum", enum: values, required: !!m[3] };
    if (m[4] !== undefined) field.default = m[4];
    return field;
  }

  // general:  name:type[:ref][!][*][~][<=n][=default]
  m = raw.match(/^(\w+):([a-z]+)(?::(\w+))?(!)?(\*)?(~)?(?:<=(\d+))?(?:=(.+))?$/);
  if (!m) throw new ParseError(`bad field: "${raw}"`, lineNo);
  const [, name, type, ref, required, owner, unique, max, def] = m;
  if (!TYPES.has(type)) throw new ParseError(`unknown type "${type}" in "${raw}"`, lineNo);
  if (type === "ref" && !ref) throw new ParseError(`ref field "${name}" needs a target: ${name}:ref:<entity> (or ${name}>${"<entity>"})`, lineNo);

  const field = { name, type, required: !!required };
  if (ref) field.ref = ref;
  if (owner) field.owner = true;
  if (unique) field.unique = true;
  if (max !== undefined) field.max = Number(max);
  if (def !== undefined) field.default = coerceDefault(def, type);
  return field;
}

function coerceDefault(raw, type) {
  if (type === "ts" && raw === "now") return { special: "now" };
  if (type === "bool") return raw === "true";
  if (type === "int") return Number(raw);
  return raw;
}

function parseEntity(name, body, lineNo) {
  const fields = body.split(",").map((s) => s.trim()).filter(Boolean);
  return { name, fields: fields.map((f) => parseField(f, lineNo)) };
}

// split on top-level commas only — commas inside [ ] belong to a sub-list
function splitTop(body) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseRoute(entity, body, lineNo) {
  const ops = splitTop(body);
  const route = {
    entity,
    list: false,
    listMine: false,
    get: false,
    create: false,
    update: null,
    delete: false,
    auth: false,
    private: false,
    filter: null,
    sort: null,
    sortDir: "asc",
    page: false,
  };
  for (const op of ops) {
    if (op === "list") route.list = true;
    else if (op === "list:mine") {
      route.list = true;
      route.listMine = true;
    } else if (op === "get") route.get = true;
    else if (op === "create") route.create = true;
    else if (op === "delete") route.delete = true;
    else if (op === "auth") route.auth = true;
    else if (op === "private") route.private = true;
    else if (op === "page") route.page = true;
    else if (op.startsWith("update")) {
      const mm = op.match(/^update:\[(.*)\]$/);
      if (!mm) throw new ParseError(`bad update op: "${op}" (use update:[field,field])`, lineNo);
      route.update = mm[1].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (op.startsWith("filter")) {
      const mm = op.match(/^filter:\[(.*)\]$/);
      if (!mm) throw new ParseError(`bad filter op: "${op}" (use filter:[field,field])`, lineNo);
      route.filter = mm[1].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (op.startsWith("sort")) {
      const mm = op.match(/^sort:(\w+)(?::(asc|desc))?$/);
      if (!mm) throw new ParseError(`bad sort op: "${op}" (use sort:field or sort:field:desc)`, lineNo);
      route.sort = mm[1];
      route.sortDir = mm[2] || "asc";
    } else throw new ParseError(`unknown op "${op}"`, lineNo);
  }
  // Inference (kept in the parser so verify AND runtime see the same AST):
  // owner-scoped listing implies login and per-owner privacy on get/update/delete.
  if (route.listMine) {
    route.auth = true;
    route.private = true;
  }
  if (route.private) route.auth = true; // owner-scoped access requires a real user
  return route;
}

export function parse(source) {
  const ast = { entities: {}, routes: {} };
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // `#` starts a comment only at line-start or after whitespace, so a `#`
    // inside a value (e.g. =#fff) is preserved rather than silently truncated.
    const rawLine = lines[i];
    let ci = -1;
    for (let k = 0; k < rawLine.length; k++) {
      if (rawLine[k] === "#" && (k === 0 || /\s/.test(rawLine[k - 1]))) {
        ci = k;
        break;
      }
    }
    const line = (ci === -1 ? rawLine : rawLine.slice(0, ci)).trim();
    if (!line) continue;

    // braced  `E name { body }`  OR  braceless  `E name body`
    let m = line.match(/^([ER])\s+(\w+)\s*\{(.*)\}\s*$/);
    if (!m) {
      const bare = line.match(/^([ER])\s+(\w+)\s+(.+)$/);
      if (bare && /[{}]/.test(bare[3])) {
        throw new ParseError(`unbalanced braces in "${line}" — braces are optional; write: ${bare[1]} ${bare[2]} ${bare[3].replace(/[{}]/g, "").trim()}`, i + 1);
      }
      m = bare;
    }
    if (!m) throw new ParseError(`cannot parse line: "${line}"`, i + 1);

    const [, kind, name, body] = m;
    if (kind === "E") {
      if (ast.entities[name]) throw new ParseError(`duplicate entity "${name}"`, i + 1);
      ast.entities[name] = parseEntity(name, body, i + 1);
    } else {
      if (ast.routes[name]) throw new ParseError(`duplicate route "${name}"`, i + 1);
      ast.routes[name] = parseRoute(name, body, i + 1);
    }
  }
  return ast;
}
