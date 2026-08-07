import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RUNGS_DIR, PROJECT_ROOT } from "./store.js";
import type { Mission } from "./types.js";

export function loadMission(): Mission {
  return JSON.parse(readFileSync(join(RUNGS_DIR, "mission.json"), "utf8")) as Mission;
}

let envCache: Record<string, string> | null = null;

/** process.env plus the project's .env, so `${SUPABASE_URL}` works in mission.json. */
export function env(): Record<string, string> {
  if (envCache) return envCache;
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) merged[key] = value;
  const file = join(PROJECT_ROOT, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match?.[1]) continue;
      const value = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
      if (value && merged[match[1]] === undefined) merged[match[1]] = value;
    }
  }
  envCache = merged;
  return merged;
}

export function expand(text: string): string {
  const vars = env();
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => vars[name] ?? whole);
}
