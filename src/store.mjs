// Storage is a swappable layer. The SAME verified spec runs on any store —
// that's the architectural point: changing where data lives never touches a
// single .aix line. v0 ships two stores, both zero-dependency:
//
//   MemoryStore — ephemeral (default)
//   FileStore   — durable, JSON file on disk (survives restart)
//
// A real SQL store (SQLite/Postgres) is a future drop-in implementing the
// same five methods: all / get / insert / replace / remove.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

class MemoryStore {
  constructor(ast) {
    this.t = {};
    for (const name of Object.keys(ast.entities)) this.t[name] = { rows: {}, next: 1 };
  }
  all(entity) { return Object.values(this.t[entity].rows); }
  get(entity, id) { return this.t[entity].rows[id] ?? null; }
  insert(entity, data) {
    const id = this.t[entity].next++;
    const row = { id, ...data };
    this.t[entity].rows[id] = row;
    this._persist();
    return row;
  }
  replace(entity, id, data) {
    const row = { id, ...data };
    this.t[entity].rows[id] = row;
    this._persist();
    return row;
  }
  remove(entity, id) {
    const existed = this.t[entity].rows[id] !== undefined;
    delete this.t[entity].rows[id];
    this._persist();
    return existed;
  }
  _persist() {}
}

class FileStore extends MemoryStore {
  constructor(ast, file) {
    super(ast);
    this.file = file;
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      for (const name of Object.keys(this.t)) if (saved[name]) this.t[name] = saved[name];
    }
  }
  _persist() {
    writeFileSync(this.file, JSON.stringify(this.t));
  }
}

export function makeStore(ast, dbFile) {
  return dbFile ? new FileStore(ast, dbFile) : new MemoryStore(ast);
}
