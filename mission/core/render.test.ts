import { describe, expect, it } from "vitest";
import { pickNextAction, render, summarize } from "./render.js";
import type { Mission, Snapshot, Task } from "./types.js";

const NOW = "2026-08-06T12:00:00.000Z";

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    goal: { statement: "First 10 paying customers for ShipCheck", metric: "customers", target: 10, deadline: "2026-11-01" },
    stallDays: 10,
    gates: [
      { id: "users", label: "10 strangers used it", metric: "users", target: 10, stallDays: 7 },
      { id: "paid", label: "Paid tier selling", metric: "customers", target: 10, kill: "no sale by Nov → pricing is wrong" },
    ],
    metrics: [
      { id: "users", label: "Weekly users", kind: "outcome", target: 10, direction: "up", sources: [] },
      { id: "customers", label: "Paying customers", kind: "outcome", target: 10, direction: "up", sources: [] },
      { id: "posts", label: "Posts (7d)", kind: "input", direction: "up", sources: [] },
    ],
    ...overrides,
  };
}

function snapshot(ts: string, values: Record<string, number | null>): Snapshot {
  return { ts, readings: Object.entries(values).map(([id, value]) => ({ id, value, tier: value === null ? null : "http" })) };
}

function task(overrides: Partial<Task>): Task {
  return { id: "t1", title: "a task", owner: "human", status: "open", created: "2026-08-01", ...overrides };
}

describe("summarize", () => {
  it("points an unconfigured mission at /mission init", () => {
    const placeholder = mission({ goal: { statement: "First 10 paying customers for MY-PRODUCT", metric: "customers", target: 10, deadline: "2026-11-01" } });
    expect(summarize(placeholder, [], NOW)).toContain("/mission init");
  });

  it("reports the goal, the active gate, and no stall while values move", () => {
    const out = summarize(mission(), [snapshot("2026-08-01T00:00:00Z", { users: 3 }), snapshot("2026-08-05T00:00:00Z", { users: 5 })], NOW);
    expect(out).toContain("First 10 paying customers");
    expect(out).toContain("active gate: 10 strangers used it — 5/10");
    expect(out).not.toContain("STALLED");
  });

  it("declares a stall after stallDays without movement and surfaces the kill criterion", () => {
    const snapshots = [snapshot("2026-07-20T00:00:00Z", { users: 12, customers: 2 }), snapshot("2026-07-25T00:00:00Z", { customers: 3 }), snapshot("2026-08-05T00:00:00Z", { customers: 3 })];
    const out = summarize(mission(), snapshots, NOW);
    expect(out).toContain("active gate: Paid tier selling");
    expect(out).toContain("STALLED 18d (limit 10)");
    expect(out).toContain("kill criterion");
  });

  it("flags a passed deadline", () => {
    const late = mission({ goal: { statement: "g", metric: "customers", target: 10, deadline: "2026-08-01" } });
    expect(summarize(late, [snapshot("2026-08-05T00:00:00Z", { customers: 1 })], NOW)).toContain("PAST DEADLINE");
  });
});

describe("pickNextAction", () => {
  it("prefers doing > active gate > has a when > oldest, and ignores agent/done tasks", () => {
    const tasks: Task[] = [
      task({ id: "old", title: "oldest open", created: "2026-07-01" }),
      task({ id: "when", title: "has when", when: "when X drops", created: "2026-08-02" }),
      task({ id: "gate", title: "advances gate", gate: "users", created: "2026-08-03" }),
      task({ id: "doing", title: "in progress", status: "doing", created: "2026-08-04" }),
      task({ id: "agent", title: "agent job", owner: "agent", status: "doing" }),
      task({ id: "done", title: "finished", status: "done" }),
    ];
    expect(pickNextAction(tasks, "users")?.id).toBe("doing");
    expect(pickNextAction(tasks.filter((t) => t.id !== "doing"), "users")?.id).toBe("gate");
    expect(pickNextAction(tasks.filter((t) => t.id !== "doing" && t.id !== "gate"), "users")?.id).toBe("when");
    expect(pickNextAction([], "users")).toBeNull();
  });
});

describe("render", () => {
  const base = { tasks: [] as Task[], revisions: [], events: [], now: NOW };

  it("renders the guided setup page while mission.json is the placeholder", () => {
    const placeholder = mission({ goal: { statement: "First 10 paying customers for MY-PRODUCT", metric: "customers", target: 10, deadline: "2026-11-01" } });
    const html = render({ mission: placeholder, snapshots: [], ...base });
    expect(html).toContain("/mission init");
    expect(html).toContain("not set up yet");
    expect(html).not.toContain("no reading");
  });

  it("leads with the one next action", () => {
    const tasks = [task({ title: "Post the launch thread", when: "when the Show HN window opens", gate: "users" })];
    const html = render({ mission: mission(), snapshots: [snapshot("2026-08-05T00:00:00Z", { users: 4 })], ...base, tasks });
    expect(html).toContain("Your one next action");
    expect(html).toContain("Post the launch thread");
    expect(html).toContain("when the Show HN window opens");
  });

  it("shows a placeholder next-action card when no human task is open", () => {
    const html = render({ mission: mission(), snapshots: [], ...base });
    expect(html).toContain("none set");
  });

  it("draws a dashed target line on sparklines once there is history and a target", () => {
    const snapshots = [snapshot("2026-08-01T00:00:00Z", { users: 3 }), snapshot("2026-08-05T00:00:00Z", { users: 5 })];
    const html = render({ mission: mission(), snapshots, ...base });
    expect(html).toContain('class="goal"');
  });

  it("records movement across partial snapshots in the timeline", () => {
    const snapshots = [
      snapshot("2026-08-01T00:00:00Z", { users: 5, customers: 1 }),
      snapshot("2026-08-03T00:00:00Z", { customers: 1 }),
      snapshot("2026-08-05T00:00:00Z", { users: 7 }),
    ];
    const html = render({ mission: mission(), snapshots, ...base });
    expect(html).toContain("Weekly users 5 → 7");
  });

  it("marks the active gate stalled in the header status", () => {
    const snapshots = [snapshot("2026-07-20T00:00:00Z", { users: 4 }), snapshot("2026-08-05T00:00:00Z", { users: 4 })];
    const html = render({ mission: mission(), snapshots, ...base });
    expect(html).toContain("stalled 18d");
  });
});
