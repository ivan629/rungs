import { execSync } from "node:child_process";
import { expand } from "./config.js";
import { PROJECT_ROOT } from "./store.js";
import { AUTO_TIERS, type MetricDef, type Reading, type Source } from "./types.js";

const TIMEOUT_MS = 15_000;

/** `expr` is a JS expression over `d`, written by the repo owner in mission.json. */
function evaluate(expr: string | undefined, data: unknown): number {
  if (!expr) return Number(data);
  const fn = new Function("d", `return (${expr});`) as (d: unknown) => unknown;
  return Number(fn(data));
}

async function fromHttp(source: Source): Promise<number> {
  if (!source.url) throw new Error("http source needs a url");
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source.headers ?? {})) headers[key] = expand(value);
  const response = await fetch(expand(source.url), { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON bodies stay strings so `expr` can parse them */
  }
  return evaluate(source.expr, data);
}

function fromShell(source: Source): number {
  if (!source.cmd) throw new Error("shell source needs a cmd");
  const stdout = execSync(expand(source.cmd), { cwd: PROJECT_ROOT, timeout: TIMEOUT_MS, encoding: "utf8" });
  return evaluate(source.expr, stdout.trim());
}

async function readOne(source: Source): Promise<number> {
  const value = source.tier === "http" ? await fromHttp(source) : fromShell(source);
  if (!Number.isFinite(value)) throw new Error("expression did not produce a number");
  return value;
}

/**
 * Walks a metric's sources in declared order and returns the first that works.
 * mcp/browser/manual sources are skipped here — a node process can't drive an
 * MCP server or a logged-in browser; the agent collects those and writes them
 * back with `--set`. A metric that only has agent tiers reports `null` with the
 * reason, and the renderer carries its last known value forward.
 */
export async function collect(metric: MetricDef): Promise<Reading> {
  if (metric.blocked) return { id: metric.id, value: null, tier: null, error: metric.blocked };

  const errors: string[] = [];
  for (const source of metric.sources) {
    if (!AUTO_TIERS.includes(source.tier)) continue;
    try {
      return { id: metric.id, value: await readOne(source), tier: source.tier };
    } catch (error) {
      errors.push(`${source.tier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const agentTiers = metric.sources.filter((s) => !AUTO_TIERS.includes(s.tier)).map((s) => s.tier);
  const reason = agentTiers.length
    ? `needs agent (${[...new Set(agentTiers)].join(", ")})${errors.length ? ` — ${errors.join("; ")}` : ""}`
    : errors.join("; ") || "no source declared";
  return { id: metric.id, value: null, tier: null, error: reason };
}
