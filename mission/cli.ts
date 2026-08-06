// npm run mission            collect → append a snapshot → render → open
// npm run mission -- --render-only   rebuild the page from stored data (offline)
// npm run mission -- --dry           show what collectors return, write nothing
// npm run mission -- --brief         collect + snapshot, print the 3-line verdict (for hooks)
// npm run mission -- --set x_followers=41 --tier browser
// npm run mission -- --discover      re-scan the project for bindable sources

import { execFile } from "node:child_process";
import { collect } from "./core/collect.js";
import { loadMission } from "./core/config.js";
import { describe, discover } from "./core/discover.js";
import { loadEvents } from "./core/events.js";
import { render, summarize } from "./core/render.js";
import { appendJsonl, readJsonl, writeOut } from "./core/store.js";
import type { Reading, Revision, Snapshot, Task, Tier } from "./core/types.js";

const argv = process.argv.slice(2);
const has = (flag: string): boolean => argv.includes(flag);
const valueOf = (flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};
const allOf = (flag: string): string[] =>
  argv.flatMap((arg, index) => (arg === flag && argv[index + 1] ? [argv[index + 1] as string] : []));

const mission = loadMission();
const now = new Date().toISOString();

async function collectAll(): Promise<Reading[]> {
  const readings = await Promise.all(mission.metrics.map((metric) => collect(metric)));
  for (const reading of readings) {
    const label = mission.metrics.find((m) => m.id === reading.id)?.label ?? reading.id;
    if (reading.value === null) console.log(`  ✗ ${label.padEnd(30)} ${reading.error ?? ""}`);
    else console.log(`  ✓ ${label.padEnd(30)} ${reading.value}  (${reading.tier})`);
  }
  return readings;
}

function build(quiet = false): string {
  const file = writeOut(
    "index.html",
    render({
      mission,
      snapshots: readJsonl<Snapshot>("metrics.jsonl"),
      tasks: readJsonl<Task>("tasks.jsonl"),
      revisions: readJsonl<Revision>("strategy.jsonl"),
      events: loadEvents(mission),
      now,
    }),
  );
  if (!quiet) console.log(`\n${file}`);
  return file;
}

function open(file: string): void {
  if (has("--no-open") || has("--brief")) return;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(opener, [file], () => undefined);
}

if (has("--discover")) {
  console.log(describe(await discover(mission), mission));
} else if (allOf("--set").length) {
  const tier = (valueOf("--tier") ?? "manual") as Tier;
  const readings: Reading[] = allOf("--set").map((pair) => {
    const [id, raw] = pair.split("=");
    if (!id || raw === undefined) throw new Error(`--set expects id=value, got "${pair}"`);
    if (!mission.metrics.some((metric) => metric.id === id)) throw new Error(`unknown metric "${id}"`);
    return { id, value: Number(raw), tier };
  });
  appendJsonl("metrics.jsonl", { ts: now, readings } satisfies Snapshot);
  for (const reading of readings) console.log(`  ✓ ${reading.id} = ${reading.value}  (${tier})`);
  open(build());
} else if (has("--render-only")) {
  open(build());
} else if (has("--brief")) {
  const readings = await Promise.all(mission.metrics.map((metric) => collect(metric)));
  appendJsonl("metrics.jsonl", { ts: now, readings } satisfies Snapshot);
  build(true);
  console.log(summarize(mission, readJsonl<Snapshot>("metrics.jsonl"), now));
} else {
  console.log("collecting…");
  const readings = await collectAll();
  if (!has("--dry")) appendJsonl("metrics.jsonl", { ts: now, readings } satisfies Snapshot);
  open(build());
}
