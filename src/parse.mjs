// aix parser: .aix source text  ->  AST (plain JSON)
// The grammar is deliberately tiny and regular so a machine can both
// EMIT it cheaply (few tokens) and PARSE it deterministically.
//
// Grammar (one statement per line, `#` starts a comment):
//   E <name> { <field>, <field>, ... }
//   R <entity> { <op>, <op>, ... }
//
//   field : <name>:<type>[:<refEntity>][!][<=<n>][=<default>]
//   type  : str | int | bool | ts | ref
//   op    : list | list:mine | get | create | update:[a,b] | delete | auth
//
// Example:
//   E user { name:str!, email:str! }
//   E todo { title:str!<=200, done:bool=false, owner:ref:user, created:ts=now }
//   R todo { list:mine, get, create, update:[title,done], delete, auth }

const TYPES = new Set(["str", "int", "bool", "ts", "ref"]);

export class ParseError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "ParseError";
    this.line = line;
  }
}

function parseField(raw, lineNo) {
  // name:type[:ref][!][<=n][=default]
  // name:type[:ref][!][*][<=n][=default]   ( * marks the ownership field )
  const m = raw.match(
    /^(\w+):([a-z]+)(?::(\w+))?(!)?(\*)?(?:<=(\d+))?(?:=(.+))?$/
  );
  if (!m) throw new ParseError(`bad field: "${raw}"`, lineNo);
  const [, name, type, ref, required, owner, max, def] = m;
  if (!TYPES.has(type)) throw new ParseError(`unknown type "${type}" in "${raw}"`, lineNo);
  if (type === "ref" && !ref) throw new ParseError(`ref field "${name}" needs a target: ${name}:ref:<entity>`, lineNo);

  const field = { name, type, required: !!required };
  if (ref) field.ref = ref;
  if (owner) field.owner = true;
  if (max !== undefined) field.max = Number(max);
  if (def !== undefined) field.default = coerceDefault(def, type);
  return field;
}

function coerceDefault(raw, type) {
  if (raw === "now") return { special: "now" };
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
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseRoute(entity, body, lineNo) {
  const ops = splitTop(body);
  const route = { entity, list: false, listMine: false, get: false, create: false, update: null, delete: false, auth: false };
  for (const op of ops) {
    if (op === "list") route.list = true;
    else if (op === "list:mine") { route.list = true; route.listMine = true; }
    else if (op === "get") route.get = true;
    else if (op === "create") route.create = true;
    else if (op === "delete") route.delete = true;
    else if (op === "auth") route.auth = true;
    else if (op.startsWith("update")) {
      const m = op.match(/^update:\[(.*)\]$/);
      if (!m) throw new ParseError(`bad update op: "${op}" (use update:[field,field])`, lineNo);
      route.update = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    } else throw new ParseError(`unknown op "${op}"`, lineNo);
  }
  return route;
}

export function parse(source) {
  const ast = { entities: {}, routes: {} };
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([ER])\s+(\w+)\s*\{(.*)\}$/);
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
