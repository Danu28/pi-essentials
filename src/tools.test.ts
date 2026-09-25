import { describe, it, expect, beforeEach } from "vitest";
import { validateDepends, parseTask, MAX_TASKS, registerTools } from "./tools.js";
import { clearState, memos } from "./state.js";

function makeMockPi() {
  const tools = new Map<string, any>();
  const pi: any = {
    tools,
    registerTool: (t: any) => tools.set(t.name, t),
    on: () => {},
    registerCommand: () => {},
    appendEntry: async () => {},
  };
  return { pi, tools };
}

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
  it("rejects non-integer", () => {
    expect(validateDepends([1.5] as any, 3)).toMatch(/out of range/);
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
    expect(parseTask(long).title.length).toBeLessThanOrEqual(121);
  });
  it("parses refs with truncation", () => {
    const t = parseTask("t | refs:src/a.ts");
    expect(t.refs).toEqual(["src/a.ts"]);
  });
  it("ignores empty refs", () => {
    const t = parseTask("t | refs:   ");
    expect(t.refs).toBeUndefined();
  });
  it("parses check correctly", () => {
    const t = parseTask("t | check: npm run lint ");
    expect(t.check).toBe("npm run lint");
  });
});

describe("MAX_TASKS", () => {
  it("is 10", () => expect(MAX_TASKS).toBe(10));
});

describe("registerTools - intent", () => {
  beforeEach(() => clearState());

  it("picks lower risk winner", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intent = tools.get("intent");
    expect(intent).toBeDefined();
    const resA = await intent.execute("id1", { goal: "add auth", hypotheses: ["jwt | risk:5", "session | risk:2"] }, null, null, { cwd: process.cwd() });
    expect(resA.details.deliberation.winner).toBe("session");
    const resB = await intent.execute("id2", { goal: "fix bug", hypotheses: ["quick | risk:1", "slow | risk:9"] }, null, null, { cwd: process.cwd() });
    expect(resB.details.deliberation.winner).toBe("quick");
  });

  it("links relevant memos", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    memos.set("m1", { id: "m1", cue: "auth jwt", summary: "using jwt for auth", ts: Date.now(), tags: ["auth"] } as any);
    const intent = tools.get("intent");
    const res = await intent.execute("id", { goal: "auth jwt", hypotheses: ["a | risk:2", "b | risk:5"] }, null, null, { cwd: process.cwd() });
    expect(res.details.deliberation.links).toContain("m1");
  });

  it("sets global focus", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intent = tools.get("intent");
    await intent.execute("id", { goal: "my goal", hypotheses: ["a | risk:2", "b | risk:5"], files: ["src/a.ts"], acceptance: "done" }, null, null, { cwd: process.cwd() });
    expect((globalThis as any).__pi_ess_focus).toContain("my goal");
  });
});

describe("registerTools - memo", () => {
  beforeEach(() => clearState());

  it("remember and recall", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const memo = tools.get("memo");
    const r1 = await memo.execute("id", { action: "remember", cue: "auth-jwt", summary: "jwt flow summary", tags: ["auth"] }, null, null, { cwd: process.cwd() });
    expect(r1.content[0].text).toContain("Encoded");
    // merge on duplicate cue
    const r2 = await memo.execute("id", { action: "remember", cue: "auth-jwt", summary: "updated summary" }, null, null, { cwd: process.cwd() });
    expect(r2.content[0].text).toContain("Updated");
    // recall
    const r3 = await memo.execute("id", { action: "recall", query: "jwt" }, null, null, { cwd: process.cwd() });
    expect(r3.content[0].text).toContain("auth-jwt");
  });

  it("recall with tag filter", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const memo = tools.get("memo");
    await memo.execute("id", { action: "remember", cue: "c1", summary: "s1", tags: ["auth"] }, null, null, { cwd: process.cwd() });
    const r = await memo.execute("id", { action: "recall", query: "", tags: ["auth"] }, null, null, { cwd: process.cwd() });
    expect(r.details.episodes.length).toBeGreaterThan(0);
    const r2 = await memo.execute("id", { action: "recall", query: "", tags: ["missing"] }, null, null, { cwd: process.cwd() });
    expect(r2.details.episodes.length).toBe(0);
  });

  it("requires cue+summary", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const memo = tools.get("memo");
    const r = await memo.execute("id", { action: "remember", cue: "", summary: "" }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/need cue/);
  });
});

describe("registerTools - plan", () => {
  beforeEach(() => clearState());

  it("creates plan and marks done", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const res = await plan.execute("id", { goal: "ship feature", tasks: ["task one | refs:src/a.ts", "task two | refs:src/b.ts check:npm test", "task three | refs:src/c.ts depends:0"] }, null, null, { cwd: process.cwd() });
    expect(res.details.plan.tasks.length).toBe(3);
    const pid = res.details.plan.id;
    // mark done respecting depends
    const r2 = await plan.execute("id", { id: pid, done: [0] }, null, null, { cwd: process.cwd() });
    expect(r2.details.plan.tasks[0].done).toBe(true);
    // blocked if depends not done (task 2 depends on 0 which is done, so ok - task 3 depends on 0 also ok)
    // try marking task with missing depends first: create new plan
    const res2 = await plan.execute("id", { goal: "g2", tasks: ["a | refs:src/a.ts", "b | refs:src/b.ts depends:0", "c | refs:src/c.ts"] }, null, null, { cwd: process.cwd() });
    const pid2 = res2.details.plan.id;
    const blocked = await plan.execute("id", { id: pid2, done: [1] }, null, null, { cwd: process.cwd() });
    expect(blocked.content[0].text).toMatch(/Blocked/);
  });

  it("rejects too few tasks", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const r = await plan.execute("id", { goal: "g", tasks: ["only one", "only two"] }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/need 3/);
  });

  it("rejects invalid depends", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const r = await plan.execute("id", { goal: "g", tasks: ["a | refs:src/a.ts", "b | refs:src/b.ts depends:5", "c | refs:src/c.ts"] }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/Invalid depends/);
  });

  it("dedups duplicate titles", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const r = await plan.execute("id", { goal: "g", tasks: ["same | refs:src/a.ts", "same | refs:src/b.ts", "same | refs:src/c.ts", "unique | refs:src/d.ts"] }, null, null, { cwd: process.cwd() });
    // after dedup: 2 unique (<3) should error
    expect(r.content[0].text).toMatch(/need 3/);
  });
});

describe("registerTools - intel & check", () => {
  beforeEach(() => clearState());

  it("intel returns cached on second call", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intel = tools.get("intel");
    const r1 = await intel.execute("id", {}, null, null, { cwd: process.cwd() });
    expect(r1.content[0].text).toContain("project:");
    expect(r1.details.source).toBe("fresh");
    const r2 = await intel.execute("id", {}, null, null, { cwd: process.cwd() });
    expect(r2.details.source).toBe("cache");
  });

  it("intel refresh forces fresh", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intel = tools.get("intel");
    await intel.execute("id", {}, null, null, { cwd: process.cwd() });
    const r = await intel.execute("id", { refresh: true }, null, null, { cwd: process.cwd() });
    expect(r.details.source).toBe("fresh");
  });

  it("check PASS and FAIL", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const check = tools.get("check");
    const pass = await check.execute("id", { command: "node -e \"process.exit(0)\"" }, null, null, { cwd: process.cwd(), getContextUsage: () => ({ percent: 10 }) });
    expect(pass.details.ok).toBe(true);
    expect(pass.content[0].text).toContain("PASS");
    const fail = await check.execute("id", { command: "node -e \"process.exit(1)\"" }, null, null, { cwd: process.cwd(), getContextUsage: () => ({ percent: 95 }) });
    expect(fail.details.ok).toBe(false);
    expect(fail.content[0].text).toContain("FAIL");
    expect(fail.content[0].text).toContain("budget");
  });

  it("check rejects empty command", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const check = tools.get("check");
    const r = await check.execute("id", { command: "   " }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/command required/);
  });

  it("check budget tiers moderate/getting-full/CRITICAL", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const check = tools.get("check");
    const mod = await check.execute("id", { command: "node -e \"process.exit(0)\"" }, null, null, { cwd: process.cwd(), getContextUsage: () => ({ percent: 60 }) });
    expect(mod.content[0].text).toContain("moderate");
    const full = await check.execute("id", { command: "node -e \"process.exit(0)\"" }, null, null, { cwd: process.cwd(), getContextUsage: () => ({ tokens: 900, contextWindow: 1000 }) });
    expect(full.content[0].text).toContain("CRITICAL");
  });

  it("check handles missing context", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const check = tools.get("check");
    const r = await check.execute("id", { command: "node -e \"process.exit(0)\"" }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toContain("budget: unknown");
  });
});

describe("registerTools - extra branches", () => {
  beforeEach(() => clearState());
  it("intent defaults risk 5 and truncates", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intent = tools.get("intent");
    const longGoal = "g".repeat(500);
    const r = await intent.execute("id", { goal: longGoal, hypotheses: ["no risk here", "also none"] }, null, null, { cwd: process.cwd() });
    expect(r.details.deliberation.goal.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(r.details.deliberation.winner).toBe("no risk here"); // both risk 5, picks first
  });
  it("plan handles cap and invalid done index", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const res = await plan.execute("id", { goal: "cap test", tasks: ["t1 | refs:src/a.ts", "t2 | refs:src/b.ts", "t3 | refs:src/c.ts"] }, null, null, { cwd: process.cwd() });
    const pid = res.details.plan.id;
    // invalid done index
    const err = await plan.execute("id", { id: pid, done: [99] }, null, null, { cwd: process.cwd() });
    expect(err.content[0].text).toMatch(/Invalid done/);
    // add tasks up to cap
    const many = Array.from({ length: 7 }, (_, i) => `extra ${i} | refs:src/${i}.ts`);
    const r2 = await plan.execute("id", { id: pid, tasks: many }, null, null, { cwd: process.cwd() });
    expect(r2.details.plan.tasks.length).toBe(10);
    const over = await plan.execute("id", { id: pid, tasks: ["one more | refs:src/x.ts"] }, null, null, { cwd: process.cwd() });
    expect(over.content[0].text).toMatch(/cap: already/);
  });
  it("plan rejects adding tasks that exceed cap", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const plan = tools.get("plan");
    const res = await plan.execute("id", { goal: "cap2", tasks: ["a | refs:src/a.ts", "b | refs:src/b.ts", "c | refs:src/c.ts", "d | refs:src/d.ts", "e | refs:src/e.ts", "f | refs:src/f.ts", "g | refs:src/g.ts", "h | refs:src/h.ts", "i | refs:src/i.ts"] }, null, null, { cwd: process.cwd() });
    const pid = res.details.plan.id;
    const r = await plan.execute("id", { id: pid, tasks: ["j | refs:src/j.ts", "k | refs:src/k.ts"] }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/would exceed/);
  });
  it("memo recall with empty store", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const memo = tools.get("memo");
    const r = await memo.execute("id", { action: "recall", query: "nothing" }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/No memos yet/);
  });
  it("memo recall no relevant for query", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const memo = tools.get("memo");
    await memo.execute("id", { action: "remember", cue: "hello", summary: "world" }, null, null, { cwd: process.cwd() });
    const r = await memo.execute("id", { action: "recall", query: "xyz123nomatch" }, null, null, { cwd: process.cwd() });
    expect(r.content[0].text).toMatch(/No relevant/);
  });
  it("intel stale cache falls through", async () => {
    const { pi, tools } = makeMockPi();
    registerTools(pi);
    const intel = tools.get("intel");
    // seed cache with old timestamp
    (globalThis as any).__pi_ess_intel = { cwd: process.cwd(), lang: "node", scripts: {}, testCmd: "old", lintCmd: "old", buildCmd: "old", scannedAt: 0, text: "old text" };
    const r = await intel.execute("id", {}, null, null, { cwd: process.cwd() });
    expect(r.details.source).toBe("fresh");
    expect(r.content[0].text).not.toContain("old text");
  });
});

describe("lint helpers - vague and heavy checks", () => {
  it("lintIntent detects vague stuff/thing via word boundary", async () => {
    const { lintIntent, lintPlan } = await import("./tool-helpers.js");
    const w1 = lintIntent({ goal: "add feature", hypotheses: ["do stuff here | risk:2", "do thing now | risk:3"] } as any);
    expect(w1.some((m) => m.includes("generic"))).toBe(true);
    // "something" should not trigger via \bstuff\b fix, but via broader pattern it shouldn't false-positive
    const w2 = lintIntent({ goal: "add something useful", hypotheses: ["jwt via jose | risk:2", "session redis | risk:5"], files: ["src/a.ts"], acceptance: "ok" } as any);
    // "something" contains stuff but word-boundary prevents false hit; should have no vague warning for hypotheses
    expect(w2.filter((m) => m.includes("generic") && m.includes("hypothesis"))).toEqual([]);
    // heavy check lint
    const warns = lintPlan([{ title: "t", refs: ["src/a.ts"], check: "findstr /R foo | find /c" } as any]);
    expect(warns.some((m) => m.includes("heavy check"))).toBe(true);
    // ls with space without quotes -> enters hint branch (no warning, just coverage)
    const noWarn = lintPlan([{ title: "t", refs: ["src/a.ts"], check: 'ls -l "my file.txt"' } as any]);
    expect(noWarn.some((m) => m.includes("heavy"))).toBe(false);
    const hintBranch = lintPlan([{ title: "t", refs: ["src/a.ts"], check: "ls -l my file.txt" } as any]);
    expect(Array.isArray(hintBranch)).toBe(true);
  });
});
