import { describe, expect, it } from "vitest";
import { receipt } from "./receipt.js";
import type { Mission, Snapshot, Task } from "./types.js";

const NOW = "2026-08-06T12:00:00.000Z";

const MISSION: Mission = {
  goal: { statement: "First 10 paying customers", metric: "customers", target: 10, deadline: "2026-11-01" },
  stallDays: 10,
  gates: [{ id: "users", label: "10 strangers used it", metric: "users", target: 10 }],
  metrics: [
    { id: "posts", label: "Posts (7d)", kind: "input", sources: [] },
    { id: "users", label: "Weekly users", kind: "outcome", sources: [] },
    { id: "customers", label: "Paying customers", kind: "outcome", sources: [], blocked: "no billing yet" },
  ],
};

function snapshot(ts: string, values: Record<string, number>): Snapshot {
  return { ts, readings: Object.entries(values).map(([id, value]) => ({ id, value, tier: "http" })) };
}

describe("receipt", () => {
  it("computes deltas against the last value before the 7-day window", () => {
    const snapshots = [
      snapshot("2026-07-20T00:00:00Z", { users: 3, posts: 10 }),
      snapshot("2026-07-28T00:00:00Z", { users: 4 }),
      snapshot("2026-08-05T00:00:00Z", { users: 9, posts: 16 }),
    ];
    const out = receipt({ mission: MISSION, snapshots, tasks: [], revisions: [], events: [], now: NOW });
    expect(out).toContain("Weekly users: 4 → 9 (+5)");
    expect(out).toContain("Posts (7d): 10 → 16 (+6)");
  });

  it("lists never-measured metrics under Not measured with the blocked reason", () => {
    const out = receipt({ mission: MISSION, snapshots: [snapshot("2026-08-05T00:00:00Z", { users: 2 })], tasks: [], revisions: [], events: [], now: NOW });
    expect(out).toContain("**Not measured**");
    expect(out).toContain("Paying customers: not measured — no billing yet");
    expect(out).toContain("goal not measurable yet");
  });

  it("includes only this week's events and revisions, the next action, and the footer", () => {
    const tasks: Task[] = [{ id: "t", title: "Post the receipt", owner: "human", status: "open", when: "Thursday thread opens", created: "2026-08-01" }];
    const out = receipt({
      mission: MISSION,
      snapshots: [snapshot("2026-08-05T00:00:00Z", { users: 2 })],
      tasks,
      revisions: [
        { ts: "2026-08-04", change: "switch pond to r/selfhosted", evidence: "12 posts, 0 signups" },
        { ts: "2026-06-01", change: "ancient change", evidence: "old" },
      ],
      events: [
        { date: "2026-08-03", text: "shipped onboarding" },
        { date: "2026-07-01", text: "old event" },
      ],
      now: NOW,
    });
    expect(out).toContain("shipped onboarding");
    expect(out).not.toContain("old event");
    expect(out).toContain("switch pond to r/selfhosted");
    expect(out).not.toContain("ancient change");
    expect(out).toContain("Post the receipt (when: Thursday thread opens)");
    expect(out).toContain("Tracked with mission");
  });
});
