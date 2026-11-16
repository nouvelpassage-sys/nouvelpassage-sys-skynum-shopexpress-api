import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogNameVariants, nameKey } from "./bouquetNames.js";

export class DraftStore {
  constructor(dataDir, { fetchCatalogNames } = {}) {
    this.fetchCatalogNames = fetchCatalogNames;
    this.dataDir = dataDir;
    this.draftsDir = join(dataDir, "drafts");
    this.namesDir = join(dataDir, "name-registry");
    this.usedNames = new Set();
  }

  async initializeNames() {
    this.namesReady ??= this.seedNames().catch((error) => {
      this.namesReady = null;
      throw error;
    });
    await this.namesReady;
  }

  async seedNames() {
    await mkdir(this.namesDir, { recursive: true });
    // Ship only fingerprints of legacy catalog and draft names with the code.
    const archive = await readFile(new URL("./historicalNameHashes.txt", import.meta.url), "utf8");
    this.historicalHashes = new Set(archive.trim().split(/\r?\n/u));
    const drafts = await this.list({ limit: Infinity });
    for (const draft of drafts.reverse()) {
      for (const name of new Set([draft.nameUk, draft.nameEn].filter(Boolean))) {
        for (const variant of catalogNameVariants(name)) {
          if (!this.usedNames.has(variant)) await this.claim(variant, draft.id);
        }
      }
    }
  }

  async rememberCatalogNames(names) {
    for (const name of names) {
      for (const variant of catalogNameVariants(name)) {
        if (!this.usedNames.has(variant)) await this.claim(variant, "catalog");
      }
    }
  }

  async refreshCatalog() {
    if (!this.fetchCatalogNames) return;
    // Concurrent creations share the same read. Existing reservations still apply offline.
    this.catalogRead ??= (async () => {
      let names;
      try {
        names = await this.fetchCatalogNames();
      } catch {
        console.warn("SalesBox catalog unavailable; checking previously reserved product names.");
        return;
      }
      await this.rememberCatalogNames(names);
    })().finally(() => { this.catalogRead = null; });
    await this.catalogRead;
  }

  async getUsedNames() {
    await this.initializeNames();
    await this.refreshCatalog();
    return [...this.usedNames];
  }

  async tryReserveName(name, owner) {
    await this.initializeNames();
    return this.claim(name, owner);
  }

  async claim(name, owner) {
    const key = nameKey(name);
    if (!key) return false;
    const hash = createHash("sha256").update(key).digest("hex");
    if (this.historicalHashes.has(hash)) {
      this.usedNames.add(name);
      return false;
    }
    const path = join(this.namesDir, hash);
    // Exclusive creation arbitrates across processes sharing the data directory.
    // After an interrupted write the marker still blocks reuse by a different draft.
    try {
      await writeFile(path, owner, { encoding: "utf8", flag: "wx" });
      this.usedNames.add(name);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existingOwner = await readFile(path, "utf8");
      this.usedNames.add(name);
      return existingOwner === owner;
    }
  }

  async save(draft) {
    await mkdir(this.draftsDir, { recursive: true });
    const filePath = this.pathFor(draft.id);
    await this.initializeNames();
    let previous;
    try {
      previous = await this.get(draft.id);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const previousKeys = new Set([previous?.nameUk, previous?.nameEn].map(nameKey));
    const changed = [...new Set([draft.nameUk, draft.nameEn].filter(Boolean))].filter((name) => !previousKeys.has(nameKey(name)));
    if (previous && changed.length) await this.refreshCatalog();
    for (const name of changed) {
      if (!await this.tryReserveName(name, draft.id)) {
        const error = new Error(`Назву «${name}» вже використано. Виберіть іншу назву.`);
        error.code = "NAME_TAKEN";
        throw error;
      }
    }
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
      await rename(tempPath, filePath);
    } finally {
      await rm(tempPath, { force: true });
    }
    return filePath;
  }

  async get(id) {
    const content = await readFile(this.pathFor(id), "utf8");
    return JSON.parse(content);
  }

  async list({ limit = 20 } = {}) {
    let entries;
    try {
      entries = await readdir(this.draftsDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const drafts = [];
    for (let offset = 0; offset < files.length; offset += 64) {
      const batch = await Promise.all(files.slice(offset, offset + 64).map(async (entry) => {
        const content = await readFile(join(this.draftsDir, entry.name), "utf8");
        return JSON.parse(content);
      }));
      drafts.push(...batch);
    }
    return drafts.sort((left, right) => {
      const leftDate = Date.parse(left.updatedAt ?? left.createdAt ?? 0);
      const rightDate = Date.parse(right.updatedAt ?? right.createdAt ?? 0);
      return rightDate - leftDate;
    }).slice(0, limit);
  }

  async update(id, patch) {
    const draft = await this.get(id);
    const updated = {
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await this.save(updated);
    return updated;
  }

  pathFor(id) {
    return join(this.draftsDir, `${id}.json`);
  }
}
