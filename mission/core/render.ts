import type { EventItem, Gate, Mission, MetricDef, Revision, Snapshot, Task } from "./types.js";

const TIMELINE_DAYS = 45;

interface Point {
  ts: string;
  value: number;
}

interface Latest {
  value: number | null;
  ts: string | null;
  tier: string | null;
  error: string | null;
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function seriesOf(snapshots: Snapshot[], id: string): Point[] {
  const points: Point[] = [];
  for (const snapshot of snapshots) {
    const reading = snapshot.readings.find((r) => r.id === id);
    if (reading && reading.value !== null) points.push({ ts: snapshot.ts, value: reading.value });
  }
  return points;
}

function latestOf(snapshots: Snapshot[], id: string): Latest {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const reading = snapshots[i]?.readings.find((r) => r.id === id);
    if (reading?.value !== null && reading?.value !== undefined) {
      return { value: reading.value, ts: snapshots[i]?.ts ?? null, tier: reading.tier, error: null };
    }
  }
  const last = snapshots[snapshots.length - 1]?.readings.find((r) => r.id === id);
  return { value: null, ts: null, tier: null, error: last?.error ?? "never collected" };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Days since the value last changed — the input to stall detection. */
function daysFlat(points: Point[], now: string): number | null {
  if (points.length < 2) return null;
  const newest = points[points.length - 1];
  if (!newest) return null;
  for (let i = points.length - 2; i >= 0; i--) {
    const point = points[i];
    if (point && point.value !== newest.value) return daysBetween(point.ts, now);
  }
  return daysBetween(points[0]?.ts ?? now, now);
}

function sparkline(points: Point[]): string {
  if (points.length < 2) return `<div class="spark empty">not enough history yet</div>`;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 160;
  const height = 32;
  const coords = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${coords}" /></svg>`;
}

function fmt(value: number | null, unit?: string): string {
  if (value === null) return "—";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rounded}${unit}` : rounded;
}

function metricCard(metric: MetricDef, snapshots: Snapshot[], now: string): string {
  const points = seriesOf(snapshots, metric.id);
  const latest = latestOf(snapshots, metric.id);
  const stale = latest.ts && daysBetween(latest.ts, now) > 2 ? `<span class="stale">${daysBetween(latest.ts, now)}d old</span>` : "";
  const tier = latest.tier ? `<span class="tier tier-${latest.tier}">${latest.tier}</span>` : "";
  const kind = metric.kind ? `<span class="tier kind-${metric.kind}">${metric.kind}</span>` : "";
  const target = metric.target != null ? `<span class="target">of ${fmt(metric.target, metric.unit)}</span>` : "";
  const problem = metric.blocked
    ? `<p class="blocked">blocked — ${esc(metric.blocked)}</p>`
    : latest.value === null
      ? `<p class="blocked">${esc(latest.error ?? "no reading")}</p>`
      : "";

  const value = latest.value === null ? `<span class="none">no reading</span>` : fmt(latest.value, metric.unit);

  return `<article class="card${metric.blocked ? " is-blocked" : ""}">
  <h3>${esc(metric.label)} ${kind} ${tier} ${stale}</h3>
  <p class="value">${value} ${target}</p>
  ${sparkline(points)}
  ${problem}
</article>`;
}

function gateRow(gate: Gate, mission: Mission, snapshots: Snapshot[], now: string, index: number, activeIndex: number): string {
  const metric = mission.metrics.find((m) => m.id === gate.metric);
  const latest = latestOf(snapshots, gate.metric);
  const value = latest.value ?? 0;
  const pct = Math.max(0, Math.min(100, (value / gate.target) * 100));
  const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "locked";
  const flat = daysFlat(seriesOf(snapshots, gate.metric), now);
  const limit = gate.stallDays ?? mission.stallDays;
  const stalled = state === "active" && flat !== null && flat >= limit;
  const left = gate.deadline ? daysBetween(now, gate.deadline) : null;
  const deadline =
    left === null || state === "done"
      ? ""
      : `<span class="gate-deadline${left < 0 ? " overdue" : ""}">${left >= 0 ? `${left}d left` : `${-left}d overdue`}</span>`;

  return `<li class="gate gate-${state}">
  <div class="gate-head">
    <span class="gate-dot"></span>
    <strong>${esc(gate.label)}</strong>
    ${deadline}
    <span class="gate-num">${fmt(latest.value, metric?.unit)} / ${fmt(gate.target, metric?.unit)}</span>
  </div>
  <div class="bar"><span style="width:${pct.toFixed(0)}%"></span></div>
  ${stalled ? `<p class="stall">stalled — ${esc(String(flat))} days without movement (limit ${limit}). Strategy for this gate needs revisiting.</p>` : ""}
  ${gate.kill && state !== "done" ? `<p class="kill">kill/pivot: ${esc(gate.kill)}</p>` : ""}
</li>`;
}

function timeline(snapshots: Snapshot[], events: EventItem[], revisions: Revision[], mission: Mission, now: string): string {
  const rows: { date: string; kind: string; text: string }[] = [];

  for (const event of events) rows.push({ date: event.date, kind: "event", text: event.text });
  for (const revision of revisions) rows.push({ date: revision.ts.slice(0, 10), kind: "strategy", text: `Strategy: ${revision.change}` });

  // Compared against the last KNOWN value, not the previous snapshot — partial
  // snapshots (an agent writing one browser metric) must not swallow movement.
  const known = new Map<string, number>();
  for (const snapshot of snapshots) {
    for (const reading of snapshot.readings) {
      if (reading.value === null) continue;
      const before = known.get(reading.id);
      known.set(reading.id, reading.value);
      if (before === undefined || before === reading.value) continue;
      const metric = mission.metrics.find((m) => m.id === reading.id);
      rows.push({
        date: snapshot.ts.slice(0, 10),
        kind: reading.value > before ? "up" : "down",
        text: `${metric?.label ?? reading.id} ${fmt(before, metric?.unit)} → ${fmt(reading.value, metric?.unit)}`,
      });
    }
  }

  const cutoff = new Date(Date.parse(now) - TIMELINE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const visible = rows.filter((row) => row.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  if (!visible.length) return `<p class="empty">No events in the last ${TIMELINE_DAYS} days.</p>`;

  // Journal bullets run to paragraph length; the timeline is for scanning, so
  // it shows the opening clause and keeps the rest in the title attribute.
  let lastDate = "";
  const items = visible.map((row) => {
    const heading = row.date === lastDate ? "" : `<li class="day">${row.date}</li>`;
    lastDate = row.date;
    const short = row.text.length > 150 ? `${row.text.slice(0, 150).trimEnd()}…` : row.text;
    const title = short === row.text ? "" : ` title="${esc(row.text)}"`;
    return `${heading}<li class="row row-${row.kind}"${title}><span class="mark"></span>${esc(short)}</li>`;
  });
  return `<ul class="timeline">${items.join("")}</ul>`;
}

function taskColumn(tasks: Task[], owner: "agent" | "human", title: string): string {
  const open = tasks.filter((task) => task.owner === owner && task.status !== "done");
  const done = tasks.filter((task) => task.owner === owner && task.status === "done");
  const item = (task: Task): string =>
    `<li class="task task-${task.status}"><strong>${esc(task.title)}</strong>${
      task.when ? `<span class="when">when: ${esc(task.when)}</span>` : ""
    }${task.why ? `<span>${esc(task.why)}</span>` : ""}</li>`;
  return `<div class="col">
  <h3>${esc(title)} <span class="count">${open.length}</span></h3>
  <ul>${open.map(item).join("") || `<li class="empty">nothing open</li>`}</ul>
  ${done.length ? `<details><summary>${done.length} done</summary><ul>${done.map(item).join("")}</ul></details>` : ""}
</div>`;
}

/**
 * Three-line verdict for hooks and heartbeats: goal, active gate, stall state.
 * Designed to land in an agent's context at session start.
 */
export function summarize(mission: Mission, snapshots: Snapshot[], now: string): string {
  const goal = latestOf(snapshots, mission.goal.metric);
  const daysLeft = daysBetween(now, mission.goal.deadline);
  const lines: string[] = [];
  lines.push(
    `mission: ${mission.goal.statement} — ${goal.value === null ? "not measurable yet" : `${fmt(goal.value)}/${mission.goal.target}`} · ${
      daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d PAST DEADLINE`
    }`,
  );

  const active = mission.gates.find((gate) => (latestOf(snapshots, gate.metric).value ?? 0) < gate.target);
  if (!active) {
    lines.push("all gates cleared.");
    return lines.join("\n");
  }
  const metric = mission.metrics.find((m) => m.id === active.metric);
  const left = active.deadline ? daysBetween(now, active.deadline) : null;
  lines.push(
    `active gate: ${active.label} — ${fmt(latestOf(snapshots, active.metric).value, metric?.unit)}/${fmt(active.target, metric?.unit)}${
      left === null ? "" : left >= 0 ? ` · ${left}d left` : ` · ${-left}d OVERDUE`
    }`,
  );

  const flat = daysFlat(seriesOf(snapshots, active.metric), now);
  const limit = active.stallDays ?? mission.stallDays;
  if (flat !== null && flat >= limit) {
    lines.push(`STALLED ${flat}d (limit ${limit}) — strategy for this gate needs revisiting.`);
    if (active.kill) lines.push(`kill criterion on this gate: ${active.kill}`);
  }
  return lines.join("\n");
}

export function render(input: {
  mission: Mission;
  snapshots: Snapshot[];
  tasks: Task[];
  revisions: Revision[];
  events: EventItem[];
  now: string;
}): string {
  const { mission, snapshots, tasks, revisions, events, now } = input;
  const goal = latestOf(snapshots, mission.goal.metric);
  const goalValue = goal.value ?? 0;
  const goalPct = Math.max(0, Math.min(100, (goalValue / mission.goal.target) * 100));
  const daysLeft = daysBetween(now, mission.goal.deadline);

  const activeIndex = (() => {
    for (let i = 0; i < mission.gates.length; i++) {
      const gate = mission.gates[i];
      if (!gate) continue;
      const value = latestOf(snapshots, gate.metric).value ?? 0;
      if (value < gate.target) return i;
    }
    return mission.gates.length;
  })();
  const activeGate = mission.gates[activeIndex];
  const activeMetric = activeGate ? mission.metrics.find((m) => m.id === activeGate.metric) : undefined;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mission — ${esc(mission.goal.statement)}</title>
<style>
:root { --bg:#fbfaf8; --fg:#1a1a19; --dim:#6b6a66; --line:#e3e0da; --card:#fff; --accent:#2e6f5e; --warn:#b25049; --up:#2e8b5f; --down:#b25049; }
@media (prefers-color-scheme: dark) { :root { --bg:#131312; --fg:#eceae5; --dim:#8f8d87; --line:#2a2926; --card:#1b1a18; --accent:#5fb89b; } }
* { box-sizing:border-box; }
body { margin:0; padding:2rem 1.25rem 5rem; background:var(--bg); color:var(--fg); font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif; }
main { max-width:940px; margin:0 auto; }
h1 { font-size:1.5rem; margin:0 0 .25rem; letter-spacing:-.01em; }
h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.09em; color:var(--dim); margin:2.75rem 0 .85rem; font-weight:600; }
h3 { font-size:.9rem; margin:0 0 .4rem; font-weight:600; }
.sub { color:var(--dim); margin:0 0 1.5rem; font-size:.9rem; }
.hero { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:1.4rem 1.5rem; }
.hero .big { font-size:2.6rem; font-weight:600; letter-spacing:-.02em; line-height:1.1; }
.hero .big small { font-size:1rem; color:var(--dim); font-weight:400; }
.bar { height:7px; background:var(--line); border-radius:99px; overflow:hidden; margin-top:.6rem; }
.bar span { display:block; height:100%; background:var(--accent); border-radius:99px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:.85rem; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:.9rem 1rem; }
.card.is-blocked { opacity:.72; }
.value { font-size:1.55rem; font-weight:600; margin:.1rem 0 .5rem; letter-spacing:-.01em; }
.value .target { font-size:.8rem; color:var(--dim); font-weight:400; }
.none { font-weight:400; color:var(--dim); }
.value .none { font-size:.95rem; }
.hero .big .none { font-size:1.25rem; letter-spacing:0; }
.spark { width:100%; height:32px; display:block; }
.spark polyline { fill:none; stroke:var(--accent); stroke-width:1.6; vector-effect:non-scaling-stroke; }
.spark.empty { font-size:.72rem; color:var(--dim); height:auto; }
.tier { font-size:.62rem; text-transform:uppercase; letter-spacing:.06em; border:1px solid var(--line); border-radius:4px; padding:.05rem .3rem; color:var(--dim); vertical-align:middle; }
.tier-browser, .tier-manual { border-color:var(--warn); color:var(--warn); }
.stale { font-size:.68rem; color:var(--warn); }
.blocked { font-size:.75rem; color:var(--dim); margin:.5rem 0 0; }
ul.gates { list-style:none; padding:0; margin:0; }
.gate { border-left:2px solid var(--line); padding:0 0 1.15rem 1.1rem; margin-left:.35rem; position:relative; }
.gate:last-child { border-color:transparent; }
.gate-head { display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; }
.gate-dot { position:absolute; left:-6px; top:.35rem; width:10px; height:10px; border-radius:99px; background:var(--line); border:2px solid var(--bg); }
.gate-done .gate-dot { background:var(--accent); }
.gate-active .gate-dot { background:var(--warn); }
.gate-locked { opacity:.55; }
.gate-num { color:var(--dim); font-size:.82rem; margin-left:auto; }
.stall { color:var(--warn); font-size:.78rem; margin:.45rem 0 0; }
.kill { font-size:.75rem; color:var(--dim); margin:.4rem 0 0; }
.gate-active .kill { color:var(--warn); }
.gate-deadline { font-size:.72rem; color:var(--dim); }
.gate-deadline.overdue { color:var(--warn); font-weight:600; }
.kind-input { border-color:var(--accent); color:var(--accent); }
.task .when { font-style:italic; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; }
.col ul { list-style:none; padding:0; margin:0; }
.col .count { color:var(--dim); font-weight:400; }
.task { background:var(--card); border:1px solid var(--line); border-radius:9px; padding:.6rem .75rem; margin-bottom:.5rem; font-size:.85rem; }
.task span { display:block; color:var(--dim); font-size:.76rem; margin-top:.2rem; }
.task-done { opacity:.5; }
ul.timeline { list-style:none; padding:0; margin:0; }
.timeline .day { font-size:.72rem; color:var(--dim); margin:1rem 0 .35rem; letter-spacing:.04em; }
.timeline .row { display:flex; gap:.6rem; padding:.22rem 0; font-size:.85rem; align-items:baseline; }
.timeline .mark { width:6px; height:6px; border-radius:99px; background:var(--line); flex:0 0 auto; margin-top:.42rem; }
.row-up .mark { background:var(--up); } .row-down .mark { background:var(--down); }
.row-strategy .mark { background:var(--warn); } .row-strategy { font-weight:500; }
.rev { border-left:2px solid var(--line); padding:0 0 .9rem 1rem; font-size:.85rem; }
.rev time { color:var(--dim); font-size:.75rem; display:block; }
.rev p { margin:.2rem 0 0; color:var(--dim); }
.empty { color:var(--dim); font-size:.85rem; }
details summary { cursor:pointer; color:var(--dim); font-size:.8rem; margin:.4rem 0; }
@media (max-width:620px) { .cols { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
<h1>${esc(mission.goal.statement)}</h1>
<p class="sub">${daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days past`} · deadline ${esc(mission.goal.deadline)} · generated ${esc(now.slice(0, 16).replace("T", " "))}</p>

<div class="hero">
  <div class="big">${
    goal.value === null
      ? `<span class="none">not measurable yet</span><small> · target ${mission.goal.target}</small>`
      : `${fmt(goal.value)}<small> / ${mission.goal.target}</small>`
  }</div>
  <div class="bar"><span style="width:${goalPct.toFixed(0)}%"></span></div>
  ${goal.value === null ? `<p class="blocked">${esc(mission.metrics.find((m) => m.id === mission.goal.metric)?.blocked ?? "not collectable yet")}</p>` : ""}
  ${activeGate ? `<p class="blocked">Active gate: <strong>${esc(activeGate.label)}</strong> — advanced by ${esc(activeMetric?.label ?? activeGate.metric)}.</p>` : `<p class="blocked">All gates cleared.</p>`}
</div>

<h2>Gates</h2>
<ul class="gates">${mission.gates.map((gate, i) => gateRow(gate, mission, snapshots, now, i, activeIndex)).join("")}</ul>

<h2>Metrics</h2>
<div class="grid">${mission.metrics.map((metric) => metricCard(metric, snapshots, now)).join("")}</div>

<h2>Tasks</h2>
<div class="cols">${taskColumn(tasks, "agent", "Agent can do")}${taskColumn(tasks, "human", "Only you")}</div>

<h2>Timeline</h2>
${timeline(snapshots, events, revisions, mission, now)}

<h2>Strategy revisions</h2>
${revisions
  .slice()
  .reverse()
  .map((r) => `<div class="rev"><time>${esc(r.ts)}</time><strong>${esc(r.change)}</strong><p>${esc(r.evidence)}</p></div>`)
  .join("") || `<p class="empty">No revisions logged.</p>`}
</main>
</body>
</html>`;
}
