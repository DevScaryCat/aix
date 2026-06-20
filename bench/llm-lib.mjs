// Scenarios, prompts, and process helpers for the LLM-in-the-loop benchmark.
import net from "node:net";
import { spawn } from "node:child_process";

// ── Scenarios ──
// Each carries (a) provider-neutral natural-language requirements given to BOTH
// arms, and (b) the contract config used to test the running backend.
export const SCENARIOS = [
  {
    name: "todo",
    entity: "todo",
    ownerField: "owner",
    listMine: true,
    validCreate: () => ({ title: "buy milk" }),
    requiredField: "title",
    maxField: "title",
    maxLen: 200,
    typeField: "done",
    badTypeValue: "notabool",
    updatable: ["title", "done"],
    lockedField: "owner",
    requirements: `A todo-list backend.
- A "user" has: name (required text).
- A "todo" has: title (required text, max 200 chars), done (boolean, default false), an owner (the user who created it), and created (a timestamp set automatically at creation).
- Expose on /todo: list ONLY the logged-in user's own todos; get one by id; create (owner = current user, set automatically); update ONLY the title and done fields; delete.
- All /todo routes require login.`,
  },
  {
    name: "blog",
    entity: "post",
    ownerField: "author",
    listMine: true,
    validCreate: () => ({ title: "first post", body: "hello world" }),
    requiredField: "title",
    maxField: "title",
    maxLen: 200,
    typeField: "published",
    badTypeValue: "yes-please",
    updatable: ["title", "body", "published"],
    lockedField: "author",
    requirements: `A blog backend.
- A "user" has: name (required text), email (required text).
- A "post" has: title (required text, max 200 chars), body (required text), published (boolean, default false), an author (the user who created it), and created (a timestamp set automatically at creation).
- Expose on /post: list ONLY the logged-in user's own posts; get one by id; create (author = current user, set automatically); update ONLY the title, body, and published fields; delete.
- All /post routes require login.`,
  },
  {
    name: "shop",
    entity: "product",
    ownerField: "seller",
    listMine: false,
    validCreate: () => ({ name: "Widget", price: 1000 }),
    requiredField: "price",
    maxField: "name",
    maxLen: 100,
    typeField: "price",
    badTypeValue: "not-a-number",
    updatable: ["name", "price", "stock"],
    lockedField: "seller",
    requirements: `A shop catalog backend (the product resource).
- A "user" has: name (required text), email (required text).
- A "product" has: name (required text, max 100 chars), price (required integer), stock (integer, default 0), a seller (the user who created it), and created (a timestamp set automatically at creation).
- Expose on /product: list ALL products (a public list); get one by id; create (seller = current user, set automatically); update ONLY the name, price, and stock fields; delete.
- All /product routes require login.`,
  },
];

// ── Prompts ──
export const AIX_SYSTEM = "You are an expert backend engineer who writes minimal, correct declarative specs.";
export const IMPERATIVE_SYSTEM = "You are an expert backend engineer who writes minimal, correct, dependency-free Node.js.";

const AIX_PRIMER = `The .aix format describes a backend with ONE declaration per line:
  E <name> { <field>, <field>, ... }      # an entity (data shape)
  R <entity> { <op>, <op>, ... }          # routes (exposed actions)

Field syntax (fixed order):  name:type[:refEntity][!][*][<=N][=default]
  types: str | int | bool | ts | ref
  !  = required        *  = owner marker (ref fields only)
  <=N = max length (str) or max value (int)
  =default: =now (ts, set at creation), =true/=false (bool), =0 (int), =word (str)
  A single ref field automatically becomes the owner; use * only to disambiguate multiple refs.

Route ops: list | list:mine | get | create | update:[f1,f2] | delete | auth
  list:mine = return only the owner's rows (needs auth + an owner ref)
  update:[...] = ONLY those fields may be changed (all others are locked)
  auth = this resource requires login

Example:
  E user { name:str! }
  E todo { title:str!<=200, done:bool=false, owner:ref:user, created:ts=now }
  R todo { list:mine, get, create, update:[title,done], delete, auth }

Output ONLY the .aix spec. No prose, no markdown, no code fences.`;

const HTTP_CONTRACT = `Write a SINGLE self-contained Node.js HTTP server as an ES module using ONLY the built-in "node:http" — zero dependencies.

Rules:
- Listen on Number(process.env.PORT).
- In-memory storage only (no database). Integer ids auto-increment from 1.
- Auth: the current user id is the "x-user-id" request header. If a route requires login and the header is missing, respond 401.
- Exact routes & methods per entity:
    GET    /<entity>        list
    GET    /<entity>/:id    get one (404 if not found)
    POST   /<entity>        create -> 201 with the created row including its id
    PATCH  /<entity>/:id    update (404 if not found)
    DELETE /<entity>/:id    delete (404 if not found)
- On create: set the owner field to the current user automatically (ignore any owner supplied in the body); set timestamp fields to new Date().toISOString(); apply defaults for absent fields.
- Validation (create AND update) -> respond 400 when: a required field is missing, a value has the wrong type, or a string exceeds its max length.
- Field lock: on update, respond 403 if the body contains ANY field that is not in that resource's allowed-update list.
- "list only mine": when specified, return only rows owned by the current user.
- All JSON request/response bodies.

Output ONLY the JavaScript module. No prose, no markdown, no code fences.`;

export function buildAixPrompt(sc, feedback) {
  let p = `${AIX_PRIMER}\n\nBuild this backend as a .aix spec:\n${sc.requirements}`;
  if (feedback) p += `\n\nYour previous spec was REJECTED. Fix exactly these issues and output the corrected spec:\n${feedback}`;
  return p;
}

export function buildImperativePrompt(sc, feedback) {
  let p = `${HTTP_CONTRACT}\n\nImplement this backend:\n${sc.requirements}`;
  if (feedback) p += `\n\nYour previous server FAILED these checks. Fix them and output the corrected server:\n${feedback}`;
  return p;
}

// Strip a markdown code fence if the model added one despite instructions.
export function extractCode(text) {
  if (!text) return "";
  const fence = text.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  return (fence ? fence[1] : text).trim();
}

// ── Process helpers (for the imperative arm) ──
export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function waitForServer(port, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://localhost:${port}/`);
      return true; // any HTTP response (even 401/404) means it's listening
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return false;
}

export function spawnNodeServer(file, port) {
  const proc = spawn(process.execPath, [file], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  proc.stdout.on("data", () => {});
  proc.on("error", (e) => (stderr += `\n[spawn error] ${e.message}`));
  return {
    proc,
    getStderr: () => stderr.slice(-600),
    kill: () => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    },
  };
}
