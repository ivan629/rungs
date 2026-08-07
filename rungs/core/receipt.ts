import { pickNextAction } from "./render.js";
import type { EventItem, MetricDef, Mission, Revision, Snapshot, Task } from "./types.js";

const WINDOW_DAYS = 7;

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Last known value per metric across all snapshots strictly before `cutoff`. */
function valuesBefore(snapshots: Snapshot[], cutoff: string): Map<string, number> {
  const known = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (snapshot.ts >= cutoff) continue;
    for (const reading of snapshot.readings) {
      if (reading.value !== null) known.set(reading.id, reading.value);
    }
  }
  return known;
}

function metricLine(metric: MetricDef, was: number | undefined, current: number): string {
  const unit = metric.unit ?? "";
  if (was === undefined || was === current) return `- ${metric.label}: ${fmt(current)}${unit}${was === current ? " (no change)" : ""}`;
  const delta = current - was;
  return `- ${metric.label}: ${fmt(was)}${unit} → ${fmt(current)}${unit} (${delta > 0 ? "+" : ""}${fmt(delta)})`;
}

/**
 * The weekly receipt: a public build-in-public note drafted from the ledger —
 * inputs done, outcomes moved, what changed, one next action. Real numbers
 * only, misses included; recording + public reporting is the strongest form of
 * progress monitoring (Harkin et al. 2016) and it doubles as content.
 */
export function receipt(input: {
  mission: Mission;
  snapshots: Snapshot[];
  tasks: Task[];
  revisions: Revision[];
  events: EventItem[];
  now: string;
}): string {
  const { mission, snapshots, tasks, revisions, events, now } = input;
  const start = new Date(Date.parse(now) - WINDOW_DAYS * 86_400_000).toISOString();
  const startDay = start.slice(0, 10);
  const today = now.slice(0, 10);

  const before = valuesBefore(snapshots, start);
  const current = valuesBefore(snapshots, "9999-12-31");

  const section = (kind: "input" | "outcome"): string[] =>
    mission.metrics.filter((m) => m.kind === kind && current.has(m.id)).map((m) => metricLine(m, before.get(m.id), current.get(m.id) as number));
  const inputs = section("input");
  const outcomes = section("outcome");

  const misses = mission.metrics
    .filter((m) => !current.has(m.id))
    .map((m) => {
      const last = snapshots[snapshots.length - 1]?.readings.find((r) => r.id === m.id);
      return `- ${m.label}: not measured — ${m.blocked ?? last?.error ?? "no reading yet"}`;
    });

  const changed = [
    ...events.filter((e) => e.date >= startDay).map((e) => `- ${e.date} — ${e.text}`),
    ...revisions.filter((r) => r.ts.slice(0, 10) >= startDay).map((r) => `- ${r.ts.slice(0, 10)} — strategy change: ${r.change} (${r.evidence})`),
  ];

  const goalValue = current.get(mission.goal.metric);
  const daysLeft = Math.round((Date.parse(mission.goal.deadline) - Date.parse(now)) / 86_400_000);
  const activeGate = mission.gates.find((gate) => (current.get(gate.metric) ?? 0) < gate.target);
  const next = pickNextAction(tasks, activeGate?.id);

  const lines = [
    `## Week receipt — ${mission.goal.statement}`,
    `${startDay} → ${today} · ${goalValue === undefined ? "goal not measurable yet" : `goal ${fmt(goalValue)}/${mission.goal.target}`} · ${
      daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d past deadline`
    }`,
    "",
    "**Inputs (work done)**",
    ...(inputs.length ? inputs : ["- none recorded — that IS the diagnosis if outcomes are flat"]),
    "",
    "**Outcomes (what the world did)**",
    ...(outcomes.length ? outcomes : ["- none recorded"]),
  ];
  if (misses.length) lines.push("", "**Not measured**", ...misses);
  lines.push("", "**What changed**", ...(changed.length ? changed : ["- quiet week — nothing logged"]));
  lines.push(
    "",
    "**Next**",
    next ? `- ${next.title}${next.when ? ` (when: ${next.when})` : ""}` : "- no next action set",
    "",
    "—",
    "Real numbers, misses included. Tracked with Rungs → https://github.com/ivan629/rungs",
  );
  return lines.join("\n");
}
