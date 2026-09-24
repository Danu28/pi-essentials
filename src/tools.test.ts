import { describe, it, expect } from "vitest";
import { validateDepends, parseTask, MAX_TASKS } from "./tools.js";

describe("validateDepends", () => {
  it("accepts valid depends", () => {
    expect(validateDepends([0, 1], 3)).toBeNull();
    expect(validateDepends(undefined, 3)).toBeNull();
    expect(validateDepends([], 3)).toBeNull();
  });
  it("rejects out-of-range", () => {
    expect(validateDepends([3], 3)).toMatch(/out of range/);
    expect(validateDepends([-1], 3)).toMatch(/out of range/);
  });
  it("rejects self-depend", () => {
    expect(validateDepends([2], 3, 2)).toMatch(/cannot depend on itself/);
  });
  it("rejects duplicate", () => {
    expect(validateDepends([0, 0], 3)).toMatch(/duplicate/);
  });
});

describe("parseTask", () => {
  it("parses title/refs/check/depends", () => {
    const t = parseTask("my task | refs:src/a.ts,src/b.ts | check:npm test | depends:0,1");
    expect(t.title).toBe("my task");
    expect(t.refs).toEqual(["src/a.ts", "src/b.ts"]);
    expect(t.check).toBe("npm test");
    expect(t.depends).toEqual([0, 1]);
  });
  it("handles missing parts", () => {
    const t = parseTask("just title");
    expect(t.title).toBe("just title");
    expect(t.refs).toBeUndefined();
    expect(t.depends).toBeUndefined();
  });
  it("truncates long title", () => {
    const long = "a".repeat(200);
    expect(parseTask(long).title.length).toBeLessThanOrEqual(121); // 120 + "…"
  });
});

describe("MAX_TASKS", () => {
  it("is 10", () => expect(MAX_TASKS).toBe(10));
});
