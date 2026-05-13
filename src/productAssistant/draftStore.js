import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class DraftStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.draftsDir = join(dataDir, "drafts");
  }

  async save(draft) {
    await mkdir(this.draftsDir, { recursive: true });
    const filePath = this.pathFor(draft.id);
    await writeFile(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    return filePath;
  }

  async get(id) {
    const content = await readFile(this.pathFor(id), "utf8");
    return JSON.parse(content);
  }

  async list({ limit = 20 } = {}) {
    try {
      const entries = await readdir(this.draftsDir, { withFileTypes: true });
      const drafts = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            const content = await readFile(join(this.draftsDir, entry.name), "utf8");
            return JSON.parse(content);
          })
      );

      return drafts
        .sort((left, right) => {
          const leftDate = Date.parse(left.updatedAt ?? left.createdAt ?? 0);
          const rightDate = Date.parse(right.updatedAt ?? right.createdAt ?? 0);
          return rightDate - leftDate;
        })
        .slice(0, limit);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return [];
      }
      throw error;
    }
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
