---
name: aix-backend
description: Build a verified backend (auth, ownership, validation, field-locks) by emitting a tiny .aix spec instead of writing server code. Use when the user wants a CRUD/REST API, an admin/internal tool, a prototype backend, or any "users only see their own rows" data model. Pairs with the aix MCP server (tools aix_check / aix_run) so the spec is machine-verified before it runs — no generated code to review, no silent auth/ownership bugs.
---

# aix-backend

You write a few lines of **declarative spec**, never imperative server code. A fixed,
trusted runtime already knows how to run it, and a **deterministic verifier** proves it
correct *before it runs*. Your job is to emit the spec and fix any rejection — not to
implement, and not to eyeball it for auth bugs.

## The loop (always follow this)

1. Translate the user's requirements into a `.aix` spec (grammar below).
2. Call **`aix_check(spec)`**.
   - `ok:false` → read `errors[]` (`{code,where,message}`), fix **exactly those**, re-check.
   - `warnings[]` present → these are *advisory permission risks*, usually a real bug.
     Decide intent and act (see "Permission safety" below). They do **not** block.
3. When `ok:true`, call **`aix_run(spec)`** to get a live URL, and exercise it to confirm
   behavior (create as one user, read as another, etc.). Call `aix_stop(id)` when done.

If the aix MCP server isn't connected, tell the user to add it:
`{ "mcpServers": { "aix": { "command": "node", "args": ["<path>/aix/mcp/server.mjs"] } } }`

## Grammar (one declaration per line; `#` = comment; braces optional)

```
E <name> <field>, <field>, ...      # entity (data shape)
R <entity> <op>, <op>, ...          # routes (exposed actions)
```

**field** — `name:type[:refEntity][!][*][~][<=N][=default]`
- types: `str | int | bool | ts | ref`
- `!` required · `*` owner (ref only) · `~` unique (str/int) · `<=N` max len/value · `=d` default
- shorthands: `author>user` (= `author:ref:user`) · `buyer>user*` (direct owner) · `task>project^` (owned **via parent**, one hop) · `created@` (= `created:ts=now`)
- enum: `status:enum[draft|published]=draft`

**op** — `list | list:mine | get | create | update:[f1,f2] | delete | auth | private | filter:[..] | sort:f[:desc] | page`
- `list:mine` → only the owner's rows (auto-implies `auth` + `private`)
- `update:[...]` → ONLY those fields may change; every other field is locked
- `private` → `get`/`update`/`delete` scoped to the owner (others get 404)

### Whole blog backend — the entire "source"

```
E user name:str!, email:str!~
E post title:str!<=200, body:str!, published:bool=false, author>user, created@
R post list:mine, get, create, update:[title,body,published], delete
```

## Permission safety (this is the point — do not get it wrong)

The runtime forces `owner = current user` on create (clients can't spoof it) and makes the
owner immutable on update. Use these to express access correctly:

- "each user only sees their own X" → **`list:mine`** (NOT plain `list`, which returns
  *everyone's* rows). Plain `list` on an owned entity triggers an **`OWNED_READ_OPEN`**
  warning — if the data is per-user, switch to `list:mine`; only keep `list` if the
  resource is genuinely public (e.g. a shop catalog).
- single-row reads/edits restricted to the owner → **`private`** (or `list:mine`, which
  implies it).
- "a child belongs to whoever owns its parent" (task↔project, comment↔post you own) →
  mark the parent ref with **`^`** (e.g. `task>project^`). The runtime then lets a user
  create/list/get/edit/delete the child ONLY if they own the parent — don't hand-roll
  this check, it's the one imperative code silently gets wrong.
- never put the owner ref in `update:[...]` — ownership is immutable (the verifier rejects it).
- `update`/`delete` without `auth` lets anyone modify any row → warning **`OPEN_MUTATION`**;
  add `auth` unless truly public.

## Verifier error codes (these BLOCK — fix and re-emit)

`BAD_REF` (ref target undefined) · `NO_ENTITY` · `DUP_FIELD` · `EMPTY_ENUM` · `BAD_DEFAULT`
· `BAD_MAX` · `BAD_OWNER` · `BAD_UNIQUE` · `MULTI_OWNER` · `BAD_UPDATE` (not a field) ·
`OWNER_LOCKED` (owner ref in update) · `FILTER_FIELD` · `SORT_FIELD` · `NO_OWNER` ·
`AMBIGUOUS_OWNER` (mark the owner ref with `*`) · `PRIVATE_LIST` · `OWNER_CREATE_NO_AUTH`.
Many include a `"did you mean …?"` hint — use it.

## What aix does NOT do (be honest with the user)

Pure data shape + exposed CRUD ops + access scoping. It has **no** custom business logic
(no arithmetic, conditionals, non-equality filters, multi-step workflows). If the task
needs those, say so and write that part as normal code — don't try to force it into aix.
