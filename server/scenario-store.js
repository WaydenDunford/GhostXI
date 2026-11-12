import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError, requireValue } from "../src/domain/validation.js";

/** One-process local JSON store. Persist only scenario contracts, never source frames or credentials. */
export function createScenarioStore({ filePath } = {}) {
  let state;
  let tail = Promise.resolve();
  async function load() {
    if (state) return;
    if (!filePath) { state = []; return; }
    try {
      const raw = await readFile(filePath, "utf8");
      requireValue(raw.length < 5_000_000, "Scenario store exceeds its local size limit.");
      const parsed = JSON.parse(raw);
      requireValue(Array.isArray(parsed) && parsed.length <= 1000 && new Set(parsed.map(({ id }) => id)).size === parsed.length,
        "Invalid scenario store. Preserve the file and inspect it before restarting.");
      state = parsed;
    } catch (error) { if (error.code === "ENOENT") state = []; else throw error; }
  }
  async function persist(next) {
    if (!filePath) return;
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      // Windows indexers/antivirus can briefly lock the destination between writes.
      // Retry atomic replacement; never unlink the last successfully saved file.
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, filePath); break; }
        catch (error) {
          if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 5) throw error;
          await delay(10 * 2 ** attempt);
        }
      }
    }
    finally { await rm(temporary, { force: true }); }
  }
  function change(operation) {
    const result = tail.catch(() => {}).then(async () => {
      await load();
      const next = structuredClone(state);
      const value = operation(next);
      await persist(next);
      state = next;
      return structuredClone(value);
    });
    tail = result;
    return result;
  }
  const index = (rows, id) => {
    const found = rows.findIndex((row) => row.id === id);
    if (found < 0) throw new DomainError("Saved scenario not found.", "SCENARIO_NOT_FOUND", 404);
    return found;
  };
  return {
    async list() { await tail.catch(() => {}); await load(); return structuredClone(state); },
    async get(id) { const rows = await this.list(); return rows[index(rows, id)]; },
    create(input) { return change((rows) => {
      requireValue(rows.length < 1000, "The local store supports at most 1000 scenarios.");
      const row = { ...input, id: randomUUID() }; rows.push(row); return row;
    }); },
    update(id, input) { return change((rows) => { const i = index(rows, id);
      rows[i] = { ...(typeof input === "function" ? input(structuredClone(rows[i])) : input), id }; return rows[i]; }); },
    delete(id) { return change((rows) => { rows.splice(index(rows, id), 1); return { deleted: true }; }); },
  };
}
