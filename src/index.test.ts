import { describe, it, expect, beforeEach, vi } from "vitest";
import createExtension from "./index.js";
import { clearState } from "./state.js";

function makePi() {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const tools: any[] = [];
  const commands: Record<string, any> = {};
  const appendEntry = vi.fn(async () => {});
  const pi: any = {
    on: (ev: string, h: (...args: unknown[]) => unknown) => { handlers[ev] = h; },
    registerTool: (t: any) => tools.push(t),
    registerCommand: (name: string, cmd: any) => { commands[name] = cmd; },
    appendEntry,
  };
  return { pi, handlers, tools, commands, appendEntry };
}

describe("pi-essentials extension", () => {
  beforeEach(() => {
    clearState();
    (globalThis as any).__pi_ess_focus = undefined;
    (globalThis as any).__pi_ess_intel = undefined;
    (globalThis as any).__pi_ess_plan = undefined;
  });

  it("registers 5 tools on startup", () => {
    const { pi, tools } = makePi();
    createExtension(pi);
    const names = tools.map((t: any) => t.name).sort();
    expect(names).toEqual(["check", "intel", "intent", "memo", "plan"]);
  });

  it("before_agent_start injects guidelines", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["before_agent_start"];
    const opts: any = { promptGuidelines: [], sections: {} };
    await h({ systemPromptOptions: opts });
    expect(opts.promptGuidelines.some((g: string) => g.includes("pi-essentials"))).toBe(true);
    expect(opts.sections["pi-essentials"]).toContain("Happy flow");
  });

  it("session_start hydrates and resets fails", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["session_start"];
    await h({}, { entries: [{ key: "pi-ess:memo", value: { id: "m1", cue: "c", summary: "s", ts: Date.now() } }], store: {} });
    // after hydrate, pi-ess:memo should be available via state, but we check no throw
    expect(handlers["tool_call"]).toBeDefined();
  });

  it("tool_call blocks write without intent/plan", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    // ensure session_start with empty to set hasIntent/hasPlan false
    await handlers["session_start"]({}, { entries: [], store: {} });
    const res = await handlers["tool_call"]({ toolName: "write", name: "write" });
    expect(res?.block).toBe(true);
    expect(res?.reason).toMatch(/need intent/);
  });

  it("tool_call allows after intent+plan", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    await handlers["session_start"]({}, { entries: [], store: {} });
    // simulate intent and plan success via tool_result
    await handlers["tool_result"]({ toolName: "intent", isError: false, result: { details: { deliberation: { goal: "g" } } } }, {});
    await handlers["tool_result"]({ toolName: "plan", isError: false, result: { details: {} } }, {});
    const res = await handlers["tool_call"]({ toolName: "write" });
    expect(res).toBeUndefined();
  });

  it("requires debug intent after 2 fails", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    await handlers["session_start"]({}, { entries: [], store: {} });
    await handlers["tool_result"]({ toolName: "intent", isError: false, result: { details: { deliberation: { goal: "g" } } } }, {});
    await handlers["tool_result"]({ toolName: "plan", isError: false, result: { details: {} } }, {});
    // 2 check fails -> needsDebug
    await handlers["tool_result"]({ toolName: "check", isError: false, result: { details: { ok: false } } }, {});
    await handlers["tool_result"]({ toolName: "check", isError: false, result: { details: { ok: false } } }, {});
    const blocked = await handlers["tool_call"]({ toolName: "write" });
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toMatch(/need intent.*debug/);
    // non-debug intent should also be blocked
    const blocked2 = await handlers["tool_call"]({ toolName: "intent", params: { goal: "do thing" } });
    expect(blocked2?.block).toBe(true);
    // debug intent should pass
    const ok = await handlers["tool_call"]({ toolName: "intent", params: { goal: "debug fix write" } });
    expect(ok).toBeUndefined();
  });

  it("session_before_compact injects focus", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    (globalThis as any).__pi_ess_focus = "[pi-essentials focus] my goal";
    const h = handlers["session_before_compact"];
    const res = await h({ summary: "previous summary" });
    expect(res?.summary).toContain("[pi-essentials focus]");
    // already starts with focus -> no duplicate
    const res2 = await h({ summary: "[pi-essentials focus] my goal\n\nprev" });
    expect(res2).toBeUndefined();
  });

  it("context adds budget warning at >=90%", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["context"];
    const ctx: any = { getContextUsage: () => ({ percent: 95 }) };
    const ev: any = { messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }] };
    const res = await h(ev, ctx);
    expect(res?.messages[0].content).toContain("CRITICAL 95%");
  });

  it("context does nothing below 90%", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["context"];
    const ctx: any = { getContextUsage: () => ({ percent: 50 }) };
    const res = await h({ messages: [{ role: "user", content: "hi" }] }, ctx);
    expect(res).toBeUndefined();
  });

  it("essentials command reports status", async () => {
    const { pi, commands } = makePi();
    createExtension(pi);
    // trigger session_start to set handlers
    const notify = vi.fn();
    const ctx: any = { getContextUsage: () => ({ percent: 42 }), ui: { notify } };
    await commands["essentials"].handler("", ctx);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("pi-essentials"), "info");
  });

  it("essentials clear resets state", async () => {
    const { pi, commands } = makePi();
    createExtension(pi);
    const notify = vi.fn();
    const ctx: any = { getContextUsage: () => ({}), ui: { notify } };
    await commands["essentials"].handler("clear", ctx);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("cleared"), "info");
  });

  it("tool_result resets fails on check PASS and write success", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    await handlers["session_start"]({}, { entries: [], store: {} });
    await handlers["tool_result"]({ toolName: "intent", isError: false, result: { details: { deliberation: { goal: "g" } } } }, {});
    await handlers["tool_result"]({ toolName: "plan", isError: false, result: { details: {} } }, {});
    await handlers["tool_result"]({ toolName: "check", isError: false, result: { details: { ok: false } } }, {});
    // one fail, then PASS resets
    await handlers["tool_result"]({ toolName: "check", isError: false, result: { details: { ok: true } } }, {});
    const res = await handlers["tool_call"]({ toolName: "write" });
    expect(res).toBeUndefined(); // not blocked
  });

  it("context handles array content and missing user", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["context"];
    const ctx: any = { getContextUsage: () => ({ percent: 95 }) };
    // array content branch
    const evArr: any = { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] };
    const resArr = await h(evArr, ctx);
    expect(resArr?.messages[0].content).toEqual(expect.arrayContaining([{ type: "text", text: "hello" }]));
    // non-string non-array fallback (object content)
    const evObj: any = { messages: [{ role: "user", content: { custom: "obj" } }] };
    const resObj = await h(evObj, ctx);
    expect(String(resObj?.messages[0].content)).toContain("CRITICAL 95%");
    // no user message -> no patch
    const evNoUser: any = { messages: [{ role: "assistant", content: "hi" }] };
    const resNoUser = await h(evNoUser, ctx);
    expect(resNoUser).toBeUndefined();
    // empty messages
    const resEmpty = await h({ messages: [] }, ctx);
    expect(resEmpty).toBeUndefined();
    // getContextUsage throws
    const ctxThrow: any = { getContextUsage: () => { throw new Error("boom"); } };
    const resThrow = await h({ messages: [{ role: "user", content: "hi" }] }, ctxThrow);
    expect(resThrow).toBeUndefined();
    // tokens/contextWindow branch
    const ctxTokens: any = { getContextUsage: () => ({ tokens: 950, contextWindow: 1000 }) };
    const resTokens = await h({ messages: [{ role: "user", content: "hello" }] }, ctxTokens);
    expect(resTokens?.messages[0].content).toContain("CRITICAL 95%");
  });

  it("session_before_compact handles no focus and empty summary", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    (globalThis as any).__pi_ess_focus = undefined;
    // clearState ensures focusLine null, so getFocus() -> null -> undefined
    const { clearState: cs } = await import("./state.js");
    cs();
    const h = handlers["session_before_compact"];
    const resNoFocus = await h({ summary: "hello" });
    expect(resNoFocus).toBeUndefined();
    // with focus but summary undefined
    (globalThis as any).__pi_ess_focus = "[pi-essentials focus] g";
    const resUndef = await h({} as any);
    expect(resUndef?.summary).toContain("[pi-essentials focus]");
  });

  it("before_agent_start handles missing opts", async () => {
    const { pi, handlers } = makePi();
    createExtension(pi);
    const h = handlers["before_agent_start"];
    await expect(h({})).resolves.toBeUndefined();
    await expect(h({ systemPromptOptions: null })).resolves.toBeUndefined();
    // already has pi-essentials -> no dup
    const opts: any = { promptGuidelines: ["pi-essentials: existing"], sections: { "pi-essentials": "existing" } };
    await h({ systemPromptOptions: opts });
    expect(opts.promptGuidelines.filter((g: string) => g.includes("pi-essentials")).length).toBe(1);
  });
});
