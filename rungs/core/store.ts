import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Source layout: this file lives in rungs/core/, so mission.json is one level
// up. Bundled layout: the whole CLI is one file at rungs/cli.mjs, next to
// mission.json. Resolve by looking for mission.json rather than assuming depth.
const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNGS_DIR = existsSync(join(HERE, "mission.json")) ? HERE : join(HERE, "..");
export const PROJECT_ROOT = join(RUNGS_DIR, "..");
const DATA = join(RUNGS_DIR, "data");

export function readJsonl<T>(name: string): T[] {
  const file = join(DATA, name);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export function appendJsonl(name: string, row: unknown): void {
  mkdirSync(DATA, { recursive: true });
  appendFileSync(join(DATA, name), `${JSON.stringify(row)}\n`);
}

export function writeOut(name: string, contents: string): string {
  const dir = join(RUNGS_DIR, "out");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, contents);
  return file;
}
