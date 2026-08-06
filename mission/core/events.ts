import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { MISSION_DIR } from "./store.js";
import type { EventItem, Mission } from "./types.js";

/**
 * `dated-bullets`: `## YYYY-MM-DD` headings, `- ` bullets beneath them.
 * Deliberately generic — any append-only markdown log parses with it.
 */
export function loadEvents(mission: Mission): EventItem[] {
  const config = mission.events;
  if (!config) return [];
  const file = isAbsolute(config.file) ? config.file : join(MISSION_DIR, config.file);
  if (!existsSync(file)) return [];

  const events: EventItem[] = [];
  let date = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const heading = /^##\s+(\d{4}-\d{2}-\d{2})/.exec(line);
    if (heading?.[1]) {
      date = heading[1];
      continue;
    }
    const bullet = /^\s*-\s+(.*\S)/.exec(line);
    if (date && bullet?.[1]) events.push({ date, text: bullet[1] });
  }
  return events;
}
