// rungs/cli.ts
import { execFile } from "node:child_process";

// rungs/core/collect.ts
import { execSync } from "node:child_process";

// rungs/core/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// rungs/core/store.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var HERE = dirname(fileURLToPath(import.meta.url));
var RUNGS_DIR = existsSync(join(HERE, "mission.json")) ? HERE : join(HERE, "..");
var PROJECT_ROOT = join(RUNGS_DIR, "..");
var DATA = join(RUNGS_DIR, "data");
function readJsonl(name) {
  const file = join(DATA, name);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
}
function appendJsonl(name, row) {
  mkdirSync(DATA, { recursive: true });
  appendFileSync(join(DATA, name), `${JSON.stringify(row)}
`);
}
function writeOut(name, contents) {
  const dir = join(RUNGS_DIR, "out");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, contents);
  return file;
}

// rungs/core/config.ts
function loadMission() {
  return JSON.parse(readFileSync2(join2(RUNGS_DIR, "mission.json"), "utf8"));
}
var envCache = null;
function env() {
  if (envCache) return envCache;
  const merged = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== void 0) merged[key] = value;
  const file = join2(PROJECT_ROOT, ".env");
  if (existsSync2(file)) {
    for (const line of readFileSync2(file, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match?.[1]) continue;
      const value = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
      if (value && merged[match[1]] === void 0) merged[match[1]] = value;
    }
  }
  envCache = merged;
  return merged;
}
function expand(text) {
  const vars = env();
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) => vars[name] ?? whole);
}

// rungs/core/types.ts
var AUTO_TIERS = ["http", "shell"];

// rungs/core/collect.ts
var TIMEOUT_MS = 15e3;
function evaluate(expr, data) {
  if (!expr) return Number(data);
  const fn = new Function("d", `return (${expr});`);
  return Number(fn(data));
}
async function fromHttp(source) {
  if (!source.url) throw new Error("http source needs a url");
  const headers = {};
  for (const [key, value] of Object.entries(source.headers ?? {})) headers[key] = expand(value);
  const response = await fetch(expand(source.url), { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
  }
  return evaluate(source.expr, data);
}
function fromShell(source) {
  if (!source.cmd) throw new Error("shell source needs a cmd");
  const stdout = execSync(expand(source.cmd), { cwd: PROJECT_ROOT, timeout: TIMEOUT_MS, encoding: "utf8" });
  return evaluate(source.expr, stdout.trim());
}
async function readOne(source) {
  const value = source.tier === "http" ? await fromHttp(source) : fromShell(source);
  if (!Number.isFinite(value)) throw new Error("expression did not produce a number");
  return value;
}
async function collect(metric) {
  if (metric.blocked) return { id: metric.id, value: null, tier: null, error: metric.blocked };
  const errors = [];
  for (const source of metric.sources) {
    if (!AUTO_TIERS.includes(source.tier)) continue;
    try {
      return { id: metric.id, value: await readOne(source), tier: source.tier };
    } catch (error) {
      errors.push(`${source.tier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const agentTiers = metric.sources.filter((s) => !AUTO_TIERS.includes(s.tier)).map((s) => s.tier);
  const reason = agentTiers.length ? `needs agent (${[...new Set(agentTiers)].join(", ")})${errors.length ? ` \u2014 ${errors.join("; ")}` : ""}` : errors.join("; ") || "no source declared";
  return { id: metric.id, value: null, tier: null, error: reason };
}

// rungs/core/discover.ts
import { execSync as execSync2 } from "node:child_process";
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
function routes() {
  try {
    const found = execSync2(`grep -rhoE '"(GET|POST) /api/[a-z/-]+"' --include=*.ts . || true`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 15e3
    });
    return [...new Set(found.split("\n").map((line) => line.replace(/"/g, "").trim()).filter(Boolean))].sort();
  } catch {
    return [];
  }
}
function scripts() {
  const file = join3(PROJECT_ROOT, "package.json");
  if (!existsSync3(file)) return [];
  const parsed = JSON.parse(readFileSync3(file, "utf8"));
  return Object.keys(parsed.scripts ?? {}).sort();
}
function envVars() {
  const file = join3(PROJECT_ROOT, ".env");
  if (!existsSync3(file)) return [];
  return readFileSync3(file, "utf8").split("\n").map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]).filter((name) => Boolean(name) && Boolean(env()[name])).sort();
}
async function discover(mission2) {
  const previous = existsSync3(join3(RUNGS_DIR, "capabilities.json")) ? JSON.parse(readFileSync3(join3(RUNGS_DIR, "capabilities.json"), "utf8")) : {};
  const metrics = [];
  for (const metric of mission2.metrics) {
    const reading = await collect(metric);
    metrics.push({
      id: metric.id,
      tier: reading.tier,
      ok: reading.value !== null,
      ...reading.error ? { error: reading.error } : {}
    });
  }
  const capabilities = {
    generated: (/* @__PURE__ */ new Date()).toISOString(),
    routes: routes(),
    scripts: scripts(),
    envVars: envVars(),
    metrics,
    mcp: previous.mcp ?? [],
    browser: previous.browser ?? []
  };
  writeFileSync2(join3(RUNGS_DIR, "capabilities.json"), `${JSON.stringify(capabilities, null, 2)}
`);
  return capabilities;
}
function describe(capabilities, mission2) {
  const lines = [];
  lines.push(`routes found:      ${capabilities.routes.length}`);
  lines.push(`npm scripts:       ${capabilities.scripts.length}`);
  lines.push(`env vars set:      ${capabilities.envVars.join(", ") || "none"}`);
  lines.push(`mcp servers:       ${capabilities.mcp.join(", ") || "unknown \u2014 run /rungs to refresh"}`);
  lines.push("");
  const bound = capabilities.metrics.filter((m) => m.ok);
  const unbound = capabilities.metrics.filter((m) => !m.ok);
  lines.push(`metrics bound:     ${bound.length}/${capabilities.metrics.length}`);
  for (const metric of bound) lines.push(`  \u2713 ${metric.id.padEnd(24)} tier ${metric.tier}`);
  for (const metric of unbound) lines.push(`  \u2717 ${metric.id.padEnd(24)} ${metric.error ?? "unbound"}`);
  const uncovered = capabilities.routes.filter(
    (route) => !mission2.metrics.some((metric) => metric.sources.some((source) => source.url?.includes(route.split(" ")[1] ?? "\0")))
  );
  if (uncovered.length) {
    lines.push("");
    lines.push(`routes not feeding any metric (candidates):`);
    for (const route of uncovered) lines.push(`  \xB7 ${route}`);
  }
  return lines.join("\n");
}

// rungs/core/events.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { isAbsolute, join as join4 } from "node:path";
function loadEvents(mission2) {
  const config = mission2.events;
  if (!config) return [];
  const file = isAbsolute(config.file) ? config.file : join4(RUNGS_DIR, config.file);
  if (!existsSync4(file)) return [];
  const events = [];
  let date = "";
  for (const line of readFileSync4(file, "utf8").split("\n")) {
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

// rungs/core/render.ts
var TIMELINE_DAYS = 45;
function esc(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
function seriesOf(snapshots, id) {
  const points = [];
  for (const snapshot of snapshots) {
    const reading = snapshot.readings.find((r) => r.id === id);
    if (reading && reading.value !== null) points.push({ ts: snapshot.ts, value: reading.value });
  }
  return points;
}
function latestOf(snapshots, id) {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const reading = snapshots[i]?.readings.find((r) => r.id === id);
    if (reading?.value !== null && reading?.value !== void 0) {
      return { value: reading.value, ts: snapshots[i]?.ts ?? null, tier: reading.tier, error: null };
    }
  }
  const last = snapshots[snapshots.length - 1]?.readings.find((r) => r.id === id);
  return { value: null, ts: null, tier: null, error: last?.error ?? "never collected" };
}
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
}
function daysFlat(points, now2) {
  if (points.length < 2) return null;
  const newest = points[points.length - 1];
  if (!newest) return null;
  for (let i = points.length - 2; i >= 0; i--) {
    const point = points[i];
    if (point && point.value !== newest.value) return daysBetween(point.ts, now2);
  }
  return daysBetween(points[0]?.ts ?? now2, now2);
}
function sparkline(points, target) {
  if (points.length < 2) return `<div class="spark empty">not enough history yet</div>`;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, ...target != null ? [target] : []);
  const max = Math.max(...values, ...target != null ? [target] : []);
  const span = max - min || 1;
  const width = 160;
  const height = 32;
  const coords = points.map((point, index) => {
    const x = index / (points.length - 1) * width;
    const y = height - (point.value - min) / span * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const goal = target == null ? "" : `<line class="goal" x1="0" x2="${width}" y1="${(height - (target - min) / span * height).toFixed(1)}" y2="${(height - (target - min) / span * height).toFixed(1)}" />`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${goal}<polyline points="${coords}" /></svg>`;
}
function fmt(value, unit) {
  if (value === null) return "\u2014";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rounded}${unit}` : rounded;
}
function unconfigured(mission2) {
  return mission2.goal.statement.includes("MY-PRODUCT");
}
function pickNextAction(tasks, activeGateId) {
  const open2 = tasks.filter((task) => task.owner === "human" && task.status !== "done");
  const score = (task) => (task.status === "doing" ? 4 : 0) + (task.gate === activeGateId && activeGateId ? 2 : 0) + (task.when ? 1 : 0);
  return open2.sort((a, b) => score(b) - score(a) || a.created.localeCompare(b.created))[0] ?? null;
}
function metricCard(metric, snapshots, now2) {
  const points = seriesOf(snapshots, metric.id);
  const latest = latestOf(snapshots, metric.id);
  const stale = latest.ts && daysBetween(latest.ts, now2) > 2 ? `<span class="stale">${daysBetween(latest.ts, now2)}d old</span>` : "";
  const tier = latest.tier ? `<span class="tier tier-${latest.tier}">${latest.tier}</span>` : "";
  const kind = metric.kind ? `<span class="tier kind-${metric.kind}">${metric.kind}</span>` : "";
  const target = metric.target != null ? `<span class="target">of ${fmt(metric.target, metric.unit)}</span>` : "";
  const problem = metric.blocked ? `<p class="blocked">blocked \u2014 ${esc(metric.blocked)}</p>` : latest.value === null ? `<p class="blocked">${esc(latest.error ?? "no reading")}</p>` : "";
  const value = latest.value === null ? `<span class="none">no reading</span>` : fmt(latest.value, metric.unit);
  return `<article class="card${metric.blocked ? " is-blocked" : ""}">
  <h3>${esc(metric.label)} ${kind} ${tier} ${stale}</h3>
  <p class="value">${value} ${target}</p>
  ${sparkline(points, metric.target)}
  ${problem}
</article>`;
}
function gateRow(gate, mission2, snapshots, now2, index, activeIndex) {
  const metric = mission2.metrics.find((m) => m.id === gate.metric);
  const latest = latestOf(snapshots, gate.metric);
  const value = latest.value ?? 0;
  const pct = Math.max(0, Math.min(100, value / gate.target * 100));
  const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "locked";
  const flat = daysFlat(seriesOf(snapshots, gate.metric), now2);
  const limit = gate.stallDays ?? mission2.stallDays;
  const stalled = state === "active" && flat !== null && flat >= limit;
  const left = gate.deadline ? daysBetween(now2, gate.deadline) : null;
  const deadline = left === null || state === "done" ? "" : `<span class="gate-deadline${left < 0 ? " overdue" : ""}">${left >= 0 ? `${left}d left` : `${-left}d overdue`}</span>`;
  return `<li class="gate gate-${state}">
  <div class="gate-head">
    <span class="gate-dot"></span>
    <strong>${esc(gate.label)}</strong>
    ${deadline}
    <span class="gate-num">${fmt(latest.value, metric?.unit)} / ${fmt(gate.target, metric?.unit)}</span>
  </div>
  <div class="bar"><span style="width:${pct.toFixed(0)}%"></span></div>
  ${stalled ? `<p class="stall">stalled \u2014 ${esc(String(flat))} days without movement (limit ${limit}). Strategy for this gate needs revisiting.</p>` : ""}
  ${gate.kill && state !== "done" ? `<p class="kill">kill/pivot: ${esc(gate.kill)}</p>` : ""}
</li>`;
}
function timeline(snapshots, events, revisions, mission2, now2) {
  const rows = [];
  for (const event of events) rows.push({ date: event.date, kind: "event", text: event.text });
  for (const revision of revisions) rows.push({ date: revision.ts.slice(0, 10), kind: "strategy", text: `Strategy: ${revision.change}` });
  const known = /* @__PURE__ */ new Map();
  for (const snapshot of snapshots) {
    for (const reading of snapshot.readings) {
      if (reading.value === null) continue;
      const before = known.get(reading.id);
      known.set(reading.id, reading.value);
      if (before === void 0 || before === reading.value) continue;
      const metric = mission2.metrics.find((m) => m.id === reading.id);
      rows.push({
        date: snapshot.ts.slice(0, 10),
        kind: reading.value > before ? "up" : "down",
        text: `${metric?.label ?? reading.id} ${fmt(before, metric?.unit)} \u2192 ${fmt(reading.value, metric?.unit)}`
      });
    }
  }
  const cutoff = new Date(Date.parse(now2) - TIMELINE_DAYS * 864e5).toISOString().slice(0, 10);
  const visible = rows.filter((row) => row.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  if (!visible.length) return `<p class="empty">No events in the last ${TIMELINE_DAYS} days.</p>`;
  let lastDate = "";
  const items = visible.map((row) => {
    const heading = row.date === lastDate ? "" : `<li class="day">${row.date}</li>`;
    lastDate = row.date;
    const short = row.text.length > 150 ? `${row.text.slice(0, 150).trimEnd()}\u2026` : row.text;
    const title = short === row.text ? "" : ` title="${esc(row.text)}"`;
    return `${heading}<li class="row row-${row.kind}"${title}><span class="mark"></span>${esc(short)}</li>`;
  });
  return `<ul class="timeline">${items.join("")}</ul>`;
}
function taskColumn(tasks, owner, title) {
  const open2 = tasks.filter((task) => task.owner === owner && task.status !== "done");
  const done = tasks.filter((task) => task.owner === owner && task.status === "done");
  const item = (task) => `<li class="task task-${task.status}"><strong>${esc(task.title)}</strong>${task.when ? `<span class="when">when: ${esc(task.when)}</span>` : ""}${task.why ? `<span>${esc(task.why)}</span>` : ""}</li>`;
  return `<div class="col">
  <h3>${esc(title)} <span class="count">${open2.length}</span></h3>
  <ul>${open2.map(item).join("") || `<li class="empty">nothing open</li>`}</ul>
  ${done.length ? `<details><summary>${done.length} done</summary><ul>${done.map(item).join("")}</ul></details>` : ""}
</div>`;
}
function summarize(mission2, snapshots, now2) {
  if (unconfigured(mission2)) {
    return "rungs: not configured \u2014 run /rungs init in your agent (it scans the repo, asks 3 questions, writes mission.json), or edit rungs/mission.json.";
  }
  const goal = latestOf(snapshots, mission2.goal.metric);
  const daysLeft = daysBetween(now2, mission2.goal.deadline);
  const lines = [];
  lines.push(
    `rungs: ${mission2.goal.statement} \u2014 ${goal.value === null ? "not measurable yet" : `${fmt(goal.value)}/${mission2.goal.target}`} \xB7 ${daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d PAST DEADLINE`}`
  );
  const active = mission2.gates.find((gate) => (latestOf(snapshots, gate.metric).value ?? 0) < gate.target);
  if (!active) {
    lines.push("all gates cleared.");
    return lines.join("\n");
  }
  const metric = mission2.metrics.find((m) => m.id === active.metric);
  const left = active.deadline ? daysBetween(now2, active.deadline) : null;
  lines.push(
    `active gate: ${active.label} \u2014 ${fmt(latestOf(snapshots, active.metric).value, metric?.unit)}/${fmt(active.target, metric?.unit)}${left === null ? "" : left >= 0 ? ` \xB7 ${left}d left` : ` \xB7 ${-left}d OVERDUE`}`
  );
  const flat = daysFlat(seriesOf(snapshots, active.metric), now2);
  const limit = active.stallDays ?? mission2.stallDays;
  if (flat !== null && flat >= limit) {
    lines.push(`STALLED ${flat}d (limit ${limit}) \u2014 strategy for this gate needs revisiting.`);
    if (active.kill) lines.push(`kill criterion on this gate: ${active.kill}`);
  }
  return lines.join("\n");
}
var STYLES = `
:root {
  --bg:#f6f9fc; --fg:#0a2540; --dim:#6b7c93; --line:#e3e8ee; --card:#fff;
  --accent:#635bff; --warn:#b42318; --up:#188653; --down:#b42318;
  --ok-bg:#d7f7c2; --ok-fg:#186429; --warn-bg:#fbe5e3; --warn-fg:#a61d10;
  --shadow:0 1px 2px rgba(10,37,64,.06), 0 4px 12px -8px rgba(10,37,64,.12);
}
@media (prefers-color-scheme: dark) { :root {
  --bg:#0c111b; --fg:#e6edf3; --dim:#8b98a9; --line:#222c3c; --card:#121a28;
  --accent:#857dff; --warn:#f47067; --up:#3dd68c; --down:#f47067;
  --ok-bg:rgba(61,214,140,.13); --ok-fg:#3dd68c; --warn-bg:rgba(244,112,103,.13); --warn-fg:#f47067;
  --shadow:none;
} }
* { box-sizing:border-box; }
body { margin:0; padding:2.5rem 1.5rem 6rem; background:var(--bg); color:var(--fg); font:14px/1.6 ui-sans-serif,-apple-system,"Segoe UI","Inter",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
main { max-width:960px; margin:0 auto; }
h1 { font-size:1.4rem; margin:0 0 .3rem; letter-spacing:-.015em; font-weight:650; }
h2 { font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; color:var(--dim); margin:3rem 0 1rem; font-weight:600; }
h3 { font-size:.92rem; margin:0 0 .4rem; font-weight:600; }
.big, .value, .gate-num, .count { font-variant-numeric:tabular-nums; }
.sub { color:var(--dim); margin:0 0 1.6rem; font-size:.85rem; }
.status { font-size:.64rem; text-transform:uppercase; letter-spacing:.06em; font-weight:650; border-radius:999px; padding:.2rem .6rem; vertical-align:middle; }
.status-ok { background:var(--ok-bg); color:var(--ok-fg); }
.status-warn { background:var(--warn-bg); color:var(--warn-fg); }
.status-dim { background:var(--line); color:var(--dim); }
.hero { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.5rem 1.75rem; box-shadow:var(--shadow); }
.hero .big { font-size:2.7rem; font-weight:650; letter-spacing:-.025em; line-height:1.1; }
.hero .big small { font-size:1rem; color:var(--dim); font-weight:450; }
.next { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:12px; padding:1.1rem 1.6rem; margin-top:.9rem; box-shadow:var(--shadow); }
.next-label { display:block; font-size:.64rem; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); font-weight:650; margin-bottom:.35rem; }
.next strong { font-size:1.02rem; font-weight:650; }
.next span { display:block; color:var(--dim); font-size:.82rem; margin-top:.28rem; }
.next .next-when { font-style:italic; }
.bar { height:6px; background:var(--line); border-radius:99px; overflow:hidden; margin-top:.65rem; }
.bar span { display:block; height:100%; background:var(--accent); border-radius:99px; }
.gate-done .bar span { background:var(--up); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:.9rem; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1rem 1.1rem; box-shadow:var(--shadow); }
.card.is-blocked { opacity:.7; box-shadow:none; }
.value { font-size:1.5rem; font-weight:650; margin:.1rem 0 .5rem; letter-spacing:-.015em; }
.value .target { font-size:.78rem; color:var(--dim); font-weight:450; }
.none { font-weight:450; color:var(--dim); }
.value .none { font-size:.92rem; }
.hero .big .none { font-size:1.25rem; letter-spacing:0; }
.spark { width:100%; height:32px; display:block; }
.spark polyline { fill:none; stroke:var(--accent); stroke-width:1.6; vector-effect:non-scaling-stroke; }
.spark line.goal { stroke:var(--dim); stroke-width:1; stroke-dasharray:3 3; opacity:.5; vector-effect:non-scaling-stroke; }
.spark.empty { font-size:.72rem; color:var(--dim); height:auto; }
.tier { font-size:.58rem; text-transform:uppercase; letter-spacing:.06em; background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:.08rem .32rem; color:var(--dim); vertical-align:middle; font-weight:600; }
.tier-browser, .tier-manual { border-color:var(--warn); color:var(--warn); background:transparent; }
.stale { font-size:.66rem; color:var(--warn); }
.blocked { font-size:.76rem; color:var(--dim); margin:.55rem 0 0; }
ul.gates { list-style:none; padding:0; margin:0; }
.gate { border-left:2px solid var(--line); padding:0 0 1.25rem 1.15rem; margin-left:.35rem; position:relative; }
.gate:last-child { border-color:transparent; }
.gate-head { display:flex; align-items:center; gap:.55rem; flex-wrap:wrap; }
.gate-head strong { font-weight:600; }
.gate-dot { position:absolute; left:-6px; top:.35rem; width:10px; height:10px; border-radius:99px; background:var(--line); border:2px solid var(--bg); }
.gate-done .gate-dot { background:var(--up); }
.gate-active .gate-dot { background:var(--accent); }
.gate-locked { opacity:.55; }
.gate-num { color:var(--dim); font-size:.8rem; margin-left:auto; }
.stall { color:var(--warn-fg); font-size:.78rem; margin:.5rem 0 0; font-weight:500; }
.kill { font-size:.75rem; color:var(--dim); margin:.4rem 0 0; }
.gate-active .kill { color:var(--warn-fg); }
.gate-deadline { font-size:.7rem; color:var(--dim); }
.gate-deadline.overdue { color:var(--warn-fg); font-weight:650; }
.kind-input { border-color:var(--accent); color:var(--accent); background:transparent; }
.task .when { font-style:italic; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; }
.col ul { list-style:none; padding:0; margin:0; }
.col .count { color:var(--dim); font-weight:450; }
.task { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:.65rem .8rem; margin-bottom:.55rem; font-size:.85rem; box-shadow:var(--shadow); }
.task strong { font-weight:600; }
.task span { display:block; color:var(--dim); font-size:.76rem; margin-top:.2rem; }
.task-done { opacity:.5; box-shadow:none; }
ul.timeline { list-style:none; padding:0; margin:0; }
.timeline .day { font-size:.7rem; color:var(--dim); margin:1.1rem 0 .35rem; letter-spacing:.05em; font-weight:600; }
.timeline .row { display:flex; gap:.6rem; padding:.24rem 0; font-size:.85rem; align-items:baseline; }
.timeline .mark { width:6px; height:6px; border-radius:99px; background:var(--line); flex:0 0 auto; margin-top:.42rem; }
.row-up .mark { background:var(--up); } .row-down .mark { background:var(--down); }
.row-strategy .mark { background:var(--accent); } .row-strategy { font-weight:500; }
.rev { border-left:2px solid var(--line); padding:0 0 .9rem 1rem; font-size:.85rem; }
.rev time { color:var(--dim); font-size:.74rem; display:block; }
.rev strong { font-weight:600; }
.rev p { margin:.2rem 0 0; color:var(--dim); }
.empty { color:var(--dim); font-size:.85rem; }
.setup { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:12px; padding:1.4rem 1.6rem; box-shadow:var(--shadow); }
.setup ol { margin:.75rem 0 0; padding-left:1.2rem; }
.setup li { margin:.45rem 0; }
.setup code { background:var(--bg); border:1px solid var(--line); border-radius:5px; padding:.1rem .35rem; font-size:.85em; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
details summary { cursor:pointer; color:var(--dim); font-size:.8rem; margin:.4rem 0; }
@media (max-width:620px) { .cols { grid-template-columns:1fr; } }
`;
function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}
function renderOnboarding(mission2, now2) {
  const ladder = mission2.gates.map((gate) => `<li class="gate gate-locked"><div class="gate-head"><span class="gate-dot"></span><strong>${esc(gate.label)}</strong></div></li>`).join("");
  return page(
    "Mission \u2014 not set up yet",
    `<h1>Mission is installed \u2014 not set up yet</h1>
<p class="sub">generated ${esc(now2.slice(0, 16).replace("T", " "))}</p>
<div class="setup">
  <strong>Two minutes to your board:</strong>
  <ol>
    <li>In your coding agent, run <code>/rungs init</code> \u2014 it scans this repo for bindable
        sources (Stripe, Supabase, analytics, deployed URLs), asks you three questions,
        and writes <code>rungs/mission.json</code> for you.</li>
    <li>No agent handy? Edit <code>rungs/mission.json</code> yourself \u2014 the placeholder
        ladder below is a working template; see the README for metric sources.</li>
  </ol>
</div>
<h2>The ladder you'll climb</h2>
<ul class="gates">${ladder}</ul>
<p class="empty">Each gate is evidence the next one is worth building. Your goal, deadlines, and kill criteria replace these labels after init.</p>`
  );
}
function render(input) {
  const { mission: mission2, snapshots, tasks, revisions, events, now: now2 } = input;
  if (unconfigured(mission2)) return renderOnboarding(mission2, now2);
  const goal = latestOf(snapshots, mission2.goal.metric);
  const goalValue = goal.value ?? 0;
  const goalPct = Math.max(0, Math.min(100, goalValue / mission2.goal.target * 100));
  const daysLeft = daysBetween(now2, mission2.goal.deadline);
  const activeIndex = (() => {
    for (let i = 0; i < mission2.gates.length; i++) {
      const gate = mission2.gates[i];
      if (!gate) continue;
      const value = latestOf(snapshots, gate.metric).value ?? 0;
      if (value < gate.target) return i;
    }
    return mission2.gates.length;
  })();
  const activeGate = mission2.gates[activeIndex];
  const activeMetric = activeGate ? mission2.metrics.find((m) => m.id === activeGate.metric) : void 0;
  const flat = activeGate ? daysFlat(seriesOf(snapshots, activeGate.metric), now2) : null;
  const stallLimit = activeGate?.stallDays ?? mission2.stallDays;
  const stalled = flat !== null && flat >= stallLimit;
  const gateValue = activeGate ? latestOf(snapshots, activeGate.metric).value : null;
  const status = !activeGate ? `<span class="status status-ok">all gates cleared</span>` : daysLeft < 0 ? `<span class="status status-warn">past deadline</span>` : stalled ? `<span class="status status-warn">stalled ${flat}d</span>` : gateValue === null ? `<span class="status status-dim">no data yet</span>` : `<span class="status status-ok">on track</span>`;
  const next = pickNextAction(tasks, activeGate?.id);
  const nextCard = `<div class="next">
  <span class="next-label">Your one next action</span>
  ${next ? `<strong>${esc(next.title)}</strong>${next.when ? `<span class="next-when">when: ${esc(next.when)}</span>` : ""}${next.why ? `<span>${esc(next.why)}</span>` : ""}` : `<strong class="none">none set</strong><span>run /rungs in your agent \u2014 every run should end with exactly one</span>`}
</div>`;
  return page(
    `Mission \u2014 ${mission2.goal.statement}`,
    `<h1>${esc(mission2.goal.statement)}</h1>
<p class="sub">${status} \xB7 ${daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days past`} \xB7 deadline ${esc(mission2.goal.deadline)} \xB7 generated ${esc(now2.slice(0, 16).replace("T", " "))}</p>

<div class="hero">
  <div class="big">${goal.value === null ? `<span class="none">not measurable yet</span><small> \xB7 target ${mission2.goal.target}</small>` : `${fmt(goal.value)}<small> / ${mission2.goal.target}</small>`}</div>
  <div class="bar"><span style="width:${goalPct.toFixed(0)}%"></span></div>
  ${goal.value === null ? `<p class="blocked">${esc(mission2.metrics.find((m) => m.id === mission2.goal.metric)?.blocked ?? "not collectable yet")}</p>` : ""}
  ${activeGate ? `<p class="blocked">Active gate: <strong>${esc(activeGate.label)}</strong> \u2014 advanced by ${esc(activeMetric?.label ?? activeGate.metric)}.</p>` : `<p class="blocked">All gates cleared.</p>`}
  ${stalled ? `<p class="stall">stalled \u2014 ${flat} days without movement (limit ${stallLimit}). Strategy for this gate needs revisiting.</p>` : ""}
</div>

${nextCard}

<h2>Gates</h2>
<ul class="gates">${mission2.gates.map((gate, i) => gateRow(gate, mission2, snapshots, now2, i, activeIndex)).join("")}</ul>

<h2>Metrics</h2>
<div class="grid">${mission2.metrics.map((metric) => metricCard(metric, snapshots, now2)).join("")}</div>

<h2>Tasks</h2>
<div class="cols">${taskColumn(tasks, "agent", "Agent can do")}${taskColumn(tasks, "human", "Only you")}</div>

<h2>Timeline</h2>
${timeline(snapshots, events, revisions, mission2, now2)}

<h2>Strategy revisions</h2>
${revisions.slice().reverse().map((r) => `<div class="rev"><time>${esc(r.ts)}</time><strong>${esc(r.change)}</strong><p>${esc(r.evidence)}</p></div>`).join("") || `<p class="empty">No revisions logged.</p>`}`
  );
}

// rungs/core/receipt.ts
var WINDOW_DAYS = 7;
function fmt2(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
function valuesBefore(snapshots, cutoff) {
  const known = /* @__PURE__ */ new Map();
  for (const snapshot of snapshots) {
    if (snapshot.ts >= cutoff) continue;
    for (const reading of snapshot.readings) {
      if (reading.value !== null) known.set(reading.id, reading.value);
    }
  }
  return known;
}
function metricLine(metric, was, current) {
  const unit = metric.unit ?? "";
  if (was === void 0 || was === current) return `- ${metric.label}: ${fmt2(current)}${unit}${was === current ? " (no change)" : ""}`;
  const delta = current - was;
  return `- ${metric.label}: ${fmt2(was)}${unit} \u2192 ${fmt2(current)}${unit} (${delta > 0 ? "+" : ""}${fmt2(delta)})`;
}
function receipt(input) {
  const { mission: mission2, snapshots, tasks, revisions, events, now: now2 } = input;
  const start = new Date(Date.parse(now2) - WINDOW_DAYS * 864e5).toISOString();
  const startDay = start.slice(0, 10);
  const today = now2.slice(0, 10);
  const before = valuesBefore(snapshots, start);
  const current = valuesBefore(snapshots, "9999-12-31");
  const section = (kind) => mission2.metrics.filter((m) => m.kind === kind && current.has(m.id)).map((m) => metricLine(m, before.get(m.id), current.get(m.id)));
  const inputs = section("input");
  const outcomes = section("outcome");
  const misses = mission2.metrics.filter((m) => !current.has(m.id)).map((m) => {
    const last = snapshots[snapshots.length - 1]?.readings.find((r) => r.id === m.id);
    return `- ${m.label}: not measured \u2014 ${m.blocked ?? last?.error ?? "no reading yet"}`;
  });
  const changed = [
    ...events.filter((e) => e.date >= startDay).map((e) => `- ${e.date} \u2014 ${e.text}`),
    ...revisions.filter((r) => r.ts.slice(0, 10) >= startDay).map((r) => `- ${r.ts.slice(0, 10)} \u2014 strategy change: ${r.change} (${r.evidence})`)
  ];
  const goalValue = current.get(mission2.goal.metric);
  const daysLeft = Math.round((Date.parse(mission2.goal.deadline) - Date.parse(now2)) / 864e5);
  const activeGate = mission2.gates.find((gate) => (current.get(gate.metric) ?? 0) < gate.target);
  const next = pickNextAction(tasks, activeGate?.id);
  const lines = [
    `## Week receipt \u2014 ${mission2.goal.statement}`,
    `${startDay} \u2192 ${today} \xB7 ${goalValue === void 0 ? "goal not measurable yet" : `goal ${fmt2(goalValue)}/${mission2.goal.target}`} \xB7 ${daysLeft >= 0 ? `${daysLeft}d left` : `${-daysLeft}d past deadline`}`,
    "",
    "**Inputs (work done)**",
    ...inputs.length ? inputs : ["- none recorded \u2014 that IS the diagnosis if outcomes are flat"],
    "",
    "**Outcomes (what the world did)**",
    ...outcomes.length ? outcomes : ["- none recorded"]
  ];
  if (misses.length) lines.push("", "**Not measured**", ...misses);
  lines.push("", "**What changed**", ...changed.length ? changed : ["- quiet week \u2014 nothing logged"]);
  lines.push(
    "",
    "**Next**",
    next ? `- ${next.title}${next.when ? ` (when: ${next.when})` : ""}` : "- no next action set",
    "",
    "\u2014",
    "Real numbers, misses included. Tracked with Rungs \u2192 https://github.com/ivan629/rungs"
  );
  return lines.join("\n");
}

// rungs/cli.ts
var argv = process.argv.slice(2);
var has = (flag) => argv.includes(flag);
var valueOf = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? void 0 : argv[index + 1];
};
var allOf = (flag) => argv.flatMap((arg, index) => arg === flag && argv[index + 1] ? [argv[index + 1]] : []);
var mission = loadMission();
var now = (/* @__PURE__ */ new Date()).toISOString();
async function collectAll() {
  const readings = await Promise.all(mission.metrics.map((metric) => collect(metric)));
  for (const reading of readings) {
    const label = mission.metrics.find((m) => m.id === reading.id)?.label ?? reading.id;
    if (reading.value === null) console.log(`  \u2717 ${label.padEnd(30)} ${reading.error ?? ""}`);
    else console.log(`  \u2713 ${label.padEnd(30)} ${reading.value}  (${reading.tier})`);
  }
  return readings;
}
function build(quiet = false) {
  const file = writeOut(
    "index.html",
    render({
      mission,
      snapshots: readJsonl("metrics.jsonl"),
      tasks: readJsonl("tasks.jsonl"),
      revisions: readJsonl("strategy.jsonl"),
      events: loadEvents(mission),
      now
    })
  );
  if (!quiet) console.log(`
${file}`);
  return file;
}
function open(file) {
  if (has("--no-open") || has("--brief")) return;
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(opener, [file], () => void 0);
}
if (has("--discover")) {
  console.log(describe(await discover(mission), mission));
} else if (allOf("--set").length) {
  const tier = valueOf("--tier") ?? "manual";
  const readings = allOf("--set").map((pair) => {
    const [id, raw] = pair.split("=");
    if (!id || raw === void 0) throw new Error(`--set expects id=value, got "${pair}"`);
    if (!mission.metrics.some((metric) => metric.id === id)) throw new Error(`unknown metric "${id}"`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`--set ${id}: "${raw}" is not a number \u2014 nothing written`);
    return { id, value, tier };
  });
  appendJsonl("metrics.jsonl", { ts: now, readings });
  for (const reading of readings) console.log(`  \u2713 ${reading.id} = ${reading.value}  (${tier})`);
  open(build());
} else if (has("--render-only")) {
  open(build());
} else if (has("--receipt")) {
  const text = receipt({
    mission,
    snapshots: readJsonl("metrics.jsonl"),
    tasks: readJsonl("tasks.jsonl"),
    revisions: readJsonl("strategy.jsonl"),
    events: loadEvents(mission),
    now
  });
  console.log(text);
  console.log(`
${writeOut("receipt.md", text)}`);
} else if (has("--brief")) {
  const last = readJsonl("metrics.jsonl").at(-1);
  if (!last || Date.parse(now) - Date.parse(last.ts) > 12 * 36e5) {
    const readings = await Promise.all(mission.metrics.map((metric) => collect(metric)));
    appendJsonl("metrics.jsonl", { ts: now, readings });
  }
  build(true);
  console.log(summarize(mission, readJsonl("metrics.jsonl"), now));
} else {
  console.log("collecting\u2026");
  const readings = await collectAll();
  if (!has("--dry")) appendJsonl("metrics.jsonl", { ts: now, readings });
  open(build());
}
