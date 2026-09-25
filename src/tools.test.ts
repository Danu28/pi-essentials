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
});
