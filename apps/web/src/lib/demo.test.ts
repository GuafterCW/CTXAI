import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoRateLimit } from "./demo";

describe("demoRateLimit", () => {
  beforeEach(() => {
    process.env.DEMO_MODE = "1";
    // The module holds a reference to this map — clear it, don't replace it.
    const hits = (globalThis as Record<symbol, unknown>)[
      Symbol.for("ctxai.demoRateHits")
    ] as Map<string, number[]> | undefined;
    hits?.clear();
  });

  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  it("is a no-op outside demo mode", () => {
    delete process.env.DEMO_MODE;
    for (let i = 0; i < 100; i++) {
      expect(demoRateLimit("u1", "job")).toBeNull();
    }
  });

  it("allows the budget, then blocks within the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) {
      expect(demoRateLimit("u1", "job", now + i)).toBeNull();
    }
    expect(demoRateLimit("u1", "job", now + 31)).toMatch(/Demo limit/);
  });

  it("frees the budget once hits fall out of the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) demoRateLimit("u1", "job", now);
    expect(demoRateLimit("u1", "job", now)).toMatch(/Demo limit/);
    expect(demoRateLimit("u1", "job", now + 61 * 60 * 1000)).toBeNull();
  });

  it("tracks users and kinds independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) demoRateLimit("u1", "job", now);
    expect(demoRateLimit("u1", "job", now)).toMatch(/Demo limit/);
    expect(demoRateLimit("u2", "job", now)).toBeNull();
    expect(demoRateLimit("u1", "compose", now)).toBeNull();
  });
});
