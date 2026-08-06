import { describe, expect, it } from "vitest";
import { collect } from "./collect.js";
import type { MetricDef } from "./types.js";

function metric(overrides: Partial<MetricDef>): MetricDef {
  return { id: "m", label: "Metric", sources: [], ...overrides };
}

describe("collect", () => {
  it("reads a shell source and records the tier", async () => {
    const reading = await collect(metric({ sources: [{ tier: "shell", cmd: "echo 5" }] }));
    expect(reading).toMatchObject({ value: 5, tier: "shell" });
  });

  it("applies expr to shell stdout", async () => {
    const reading = await collect(metric({ sources: [{ tier: "shell", cmd: "echo 4", expr: "Number(d) * 10" }] }));
    expect(reading.value).toBe(40);
  });

  it("falls through a failing source to the next one", async () => {
    const reading = await collect(metric({ sources: [{ tier: "shell", cmd: "exit 1" }, { tier: "shell", cmd: "echo 2" }] }));
    expect(reading).toMatchObject({ value: 2, tier: "shell" });
  });

  it("rejects an expr that does not produce a number", async () => {
    const reading = await collect(metric({ sources: [{ tier: "shell", cmd: "echo hi", expr: "d" }] }));
    expect(reading.value).toBeNull();
    expect(reading.error).toContain("expression did not produce a number");
  });

  it("returns null with the blocked reason without touching sources", async () => {
    const reading = await collect(metric({ blocked: "no billing yet", sources: [{ tier: "shell", cmd: "echo 9" }] }));
    expect(reading).toEqual({ id: "m", value: null, tier: null, error: "no billing yet" });
  });

  it("defers agent-only tiers with a 'needs agent' reason", async () => {
    const reading = await collect(metric({ sources: [{ tier: "browser", note: "check the dashboard" }, { tier: "manual" }] }));
    expect(reading.value).toBeNull();
    expect(reading.error).toContain("needs agent (browser, manual)");
  });
});
