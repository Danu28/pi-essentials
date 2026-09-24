import { describe, it, expect, beforeEach } from "vitest";
import { memos, enforceMemoCap, MAX_MEMOS, clearState, scoreEpisode } from "./state.js";

function makeMemo(id: string, ts: number) {
  return { id, cue: `cue-${id}`, summary: `summary ${id}`, ts, tags: ["t"] } as any;
}

describe("enforceMemoCap", () => {
  beforeEach(() => clearState());

  it("evicts oldest when over MAX_MEMOS", () => {
    for (let i = 0; i < MAX_MEMOS + 5; i++) {
      memos.set(`m:${i}`, makeMemo(`m:${i}`, 1000 + i));
    }
    expect(memos.size).toBe(MAX_MEMOS + 5);
    const evicted = enforceMemoCap();
    expect(evicted.length).toBe(5);
    expect(memos.size).toBe(MAX_MEMOS);
    // oldest 5 gone
    expect(memos.has("m:0")).toBe(false);
    expect(memos.has("m:4")).toBe(false);
    expect(memos.has(`m:${MAX_MEMOS + 4}`)).toBe(true);
  });

  it("no-op when under cap", () => {
    memos.set("a", makeMemo("a", 1));
    memos.set("b", makeMemo("b", 2));
    const evicted = enforceMemoCap();
    expect(evicted.length).toBe(0);
    expect(memos.size).toBe(2);
  });

  it("clearState wipes everything", () => {
    memos.set("x", makeMemo("x", 1));
    clearState();
    expect(memos.size).toBe(0);
  });
});

describe("scoreEpisode", () => {
  it("weights cue > summary > detail", () => {
    const e: any = { cue: "auth jwt", summary: "session login", detail: "token expiry", tags: ["auth"] };
    expect(scoreEpisode(e, "auth")).toBeGreaterThan(0);
    // cue match should score higher than summary-only
    const cueScore = scoreEpisode({ ...e, cue: "auth", summary: "other" } as any, "auth");
    const sumScore = scoreEpisode({ ...e, cue: "other", summary: "auth" } as any, "auth");
    expect(cueScore).toBeGreaterThan(sumScore);
  });

  it("filters by tags", () => {
    const e: any = { cue: "x", summary: "y", tags: ["auth", "jwt"] };
    expect(scoreEpisode(e, "", ["auth"])).toBeGreaterThan(0);
    expect(scoreEpisode(e, "", ["missing"])).toBe(0);
  });
});
