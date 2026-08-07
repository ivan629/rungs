// Mission control — portable core. Nothing in rungs/core imports from the
// host project; everything project-specific lives in mission.json (data) and
// collectors.local.ts (the one file you delete when extracting).

/** Collection channels, ordered by reliability. See rungs/README.md. */
export type Tier = "http" | "shell" | "mcp" | "browser" | "manual";

/** Tiers a plain node process can execute. The rest need the agent. */
export const AUTO_TIERS: readonly Tier[] = ["http", "shell"];

export interface Source {
  tier: Tier;
  /** http: URL, `${VAR}` expanded from .env / process.env */
  url?: string;
  headers?: Record<string, string>;
  /** shell: command run in the repo root; `d` is stdout */
  cmd?: string;
  /** JS expression over `d` (parsed JSON for http, stdout string for shell) */
  expr?: string;
  /** mcp/browser/manual: what the agent must do to produce this value */
  note?: string;
}

export interface MetricDef {
  id: string;
  label: string;
  unit?: string;
  target?: number | null;
  direction?: "up" | "down";
  sources: Source[];
  /** Set when no source can exist yet; renders as blocked, never as zero. */
  blocked?: string;
  /**
   * "input" = work you control (posts sent, outreach done); "outcome" = results
   * (users, revenue). A flat outcome with flat inputs means you stopped trying,
   * not that the strategy failed — the distinction changes the stall diagnosis.
   */
  kind?: "input" | "outcome";
}

export interface Gate {
  id: string;
  label: string;
  metric: string;
  target: number;
  /** Days of no movement before the strategy for this gate is declared stalled. */
  stallDays?: number;
  /** Hard date this gate should clear by — the external forcing function. */
  deadline?: string;
  /**
   * Kill/pivot criterion — a state and a date, decided in advance
   * ("under 20 by Oct 1 → pivot to X"). Prevents zombie projects.
   */
  kill?: string;
}

export interface Mission {
  goal: { statement: string; metric: string; target: number; deadline: string };
  stallDays: number;
  gates: Gate[];
  metrics: MetricDef[];
  /** Optional narrative feed merged into the timeline. */
  events?: { file: string; format: "dated-bullets" };
}

export interface Reading {
  id: string;
  value: number | null;
  tier: Tier | null;
  error?: string;
}

export interface Snapshot {
  ts: string;
  readings: Reading[];
}

export interface Task {
  id: string;
  title: string;
  owner: "agent" | "human";
  status: "open" | "doing" | "done";
  gate?: string;
  why?: string;
  /** Implementation intention — the concrete "when/if X" that triggers this task. */
  when?: string;
  created: string;
  done?: string;
}

export interface Revision {
  ts: string;
  change: string;
  evidence: string;
}

export interface EventItem {
  date: string;
  text: string;
}
