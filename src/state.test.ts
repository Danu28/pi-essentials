import { describe, it, expect, beforeEach } from "vitest";
import {
  memos,
  deliberations,
  plans,
  enforceMemoCap,
  MAX_MEMOS,
  clearState,
  scoreEpisode,
  tokenize,
  truncate,
  hydrate,
  focusLine,
} from "./state.js";

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
    deliberations.push({ id: "d1", goal: "g", hypotheses: ["a", "b"], ts: 1 } as any);
    plans.set("p1", { id: "p1", goal: "g", tasks: [], ts: 1 } as any);
    clearState();
    expect(memos.size).toBe(0);
    expect(deliberations.length).toBe(0);
    expect(plans.size).toBe(0);
  });
});

describe("scoreEpisode", () => {
  it("weights cue > summary > detail", () => {
    const e: any = { cue: "auth jwt", summary: "session login", detail: "token expiry", tags: ["auth"] };
    expect(scoreEpisode(e, "auth")).toBeGreaterThan(0);
    const cueScore = scoreEpisode({ ...e, cue: "auth", summary: "other" } as any, "auth");
    const sumScore = scoreEpisode({ ...e, cue: "other", summary: "auth" } as any, "auth");
    expect(cueScore).toBeGreaterThan(sumScore);
  });

  it("filters by tags", () => {
    const e: any = { cue: "x", summary: "y", tags: ["auth", "jwt"] };
    expect(scoreEpisode(e, "", ["auth"])).toBeGreaterThan(0);
    expect(scoreEpisode(e, "", ["missing"])).toBe(0);
  });

  it("returns 0.5 for empty query and no tags", () => {
    const e: any = { cue: "hello", summary: "world" };
    expect(scoreEpisode(e, "")).toBe(0.5);
    expect(scoreEpisode(e, "   ")).toBe(0.5);
  });

  it("matches detail with lower weight", () => {
    const e: any = { cue: "other", summary: "other", detail: "secret detail token", tags: [] };
    expect(scoreEpisode(e, "secret")).toBeGreaterThan(0);
    expect(scoreEpisode(e, "secret")).toBeLessThan(scoreEpisode({ cue: "secret", summary: "other" } as any, "secret"));
  });

  it("boosts score when tags match", () => {
    const e: any = { cue: "auth", summary: "auth", tags: ["auth"] };
    const withoutTag = scoreEpisode({ ...e, tags: [] } as any, "auth");
    const withTag = scoreEpisode(e, "auth", ["auth"]);
    expect(withTag).toBeGreaterThan(withoutTag);
  });

  it("returns 0 when tag filter misses", () => {
    const e: any = { cue: "auth", summary: "auth", tags: ["jwt"] };
    expect(scoreEpisode(e, "auth", ["missing"])).toBe(0);
  });
});

describe("tokenize", () => {
  it("lowercases and splits on non-alphanum", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
    expect(tokenize("auth+jwt/token")).toEqual(["auth", "jwt", "token"]);
  });

  it("filters single letters except c and r", () => {
    expect(tokenize("a b c r d")).toEqual(["c", "r"]);
    expect(tokenize("I am a dev")).toEqual(["am", "dev"]);
  });

  it("handles empty and numeric", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("123 45")).toEqual(["123", "45"]);
  });
});

describe("truncate", () => {
  it("returns short string unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("truncates long string with ellipsis", () => {
    const s = "a".repeat(100);
    const out = truncate(s, 10);
    expect(out.length).toBe(11); // 10 + "…"
    expect(out.endsWith("…")).toBe(true);
  });
  it("default limit 800", () => {
    const s = "x".repeat(900);
    expect(truncate(s).length).toBe(801);
  });
});

describe("hydrate", () => {
  beforeEach(() => clearState());

  it("hydrates memo, deliberation, plan, focus, intel", () => {
    const now = Date.now();
    hydrate([
      { key: "pi-ess:memo", value: { id: "m1", cue: "cue1", summary: "s1", ts: now } },
      { key: "pi-ess:deliberation", value: { id: "d1", goal: "do thing", hypotheses: ["a", "b"], ts: now } },
      { key: "pi-ess:plan", value: { id: "p1", goal: "ship", tasks: [{ title: "t1", done: false }], ts: now } },
      { key: "pi-ess:focus", value: { goal: "focus goal", files: ["src/a.ts"], acceptance: "done" } },
      { key: "pi-ess:intel", value: { cwd: "/tmp", lang: "node", scripts: {}, testCmd: "npm test", lintCmd: "npm lint", buildCmd: "npm build", scannedAt: now, text: "txt" } },
    ]);
    expect(memos.has("m1")).toBe(true);
    expect(deliberations.length).toBe(1);
    expect(plans.has("p1")).toBe(true);
    expect(focusLine).toContain("focus goal");
  });

  it("handles legacy shape without key wrapper", () => {
    hydrate([{ cue: "legacy cue", summary: "legacy sum", id: "leg1", ts: Date.now() } as any]);
    expect(memos.has("leg1")).toBe(true);
  });

  it("enforces memo cap during hydrate", () => {
    const entries: any[] = [];
    for (let i = 0; i < MAX_MEMOS + 2; i++) {
      entries.push({ key: "pi-ess:memo", value: { id: `mm:${i}`, cue: `c${i}`, summary: `s${i}`, ts: 1000 + i } });
    }
    hydrate(entries);
    expect(memos.size).toBe(MAX_MEMOS);
  });

  it("clears previous state before hydrating", () => {
    memos.set("old", makeMemo("old", 1));
    hydrate([]);
    expect(memos.has("old")).toBe(false);
  });

  it("handles empty entries", () => {
    hydrate([]);
    expect(memos.size).toBe(0);
    expect(deliberations.length).toBe(0);
  });
});

describe("clearState", () => {
  it("clears globals", () => {
    (globalThis as any).__pi_ess_focus = "focus";
    (globalThis as any).__pi_ess_intel = { cwd: "/" };
    (globalThis as any).__pi_ess_plan = { id: "p" };
    clearState();
    expect((globalThis as any).__pi_ess_focus).toBeUndefined();
    expect((globalThis as any).__pi_ess_intel).toBeUndefined();
    expect((globalThis as any).__pi_ess_plan).toBeUndefined();
  });
});
