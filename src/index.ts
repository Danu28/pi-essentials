import type { ExtensionAPI, PiSessionContext, PiToolEvent, PiToolResultEvent, PiBeforeCompactEvent, PiContextEvent } from "@earendil-works/pi-coding-agent";
import { registerTools } from "./tools.js";
import { hydrate, memos, deliberations, plans, focusLine, clearState } from "./state.js";

type GlobalEss = {
  __pi_ess_focus?: string;
  __pi_ess_intel?: unknown;
  __pi_ess_plan?: unknown;
};

let hasIntent = false;
let hasPlan = false;
let fails = 0;
let needsDebug = false;

function isDebugGoal(goal: unknown): boolean {
  return typeof goal === "string" && /debug/i.test(goal);
}

function getToolName(ev: PiToolEvent | PiToolResultEvent): string {
  return ev.toolName ?? ev.name ?? "";
}

function getFocus(): string | null {
  return (globalThis as unknown as GlobalEss).__pi_ess_focus ?? focusLine ?? null;
}

export default function (pi: ExtensionAPI) {
  registerTools(pi);

  pi.on("session_start", async (_ev: unknown, ctx: PiSessionContext) => {
    const entries: unknown[] = ctx.entries ?? ctx.store?.entries ?? [];
    const combined = Array.isArray(entries) ? entries : [];
    try {
      hydrate(combined);
    } catch {}
    hasIntent = deliberations.length > 0;
    hasPlan = plans.size > 0;
    fails = 0;
    needsDebug = false;
    if (focusLine) (globalThis as unknown as GlobalEss).__pi_ess_focus = focusLine;
  });

  pi.on("tool_call", async (ev: PiToolEvent) => {
    const name = getToolName(ev);
    const isWrite = name === "write" || name === "edit";
    const isBash = name === "bash";
    const isMutating = isWrite || isBash;

    if (needsDebug) {
      if (name === "intent") {
        const bag = ev as Record<string, unknown>;
        const params = (bag["params"] ?? bag["input"] ?? bag["args"] ?? bag["toolInput"] ?? {}) as Record<string, unknown>;
        const goal = (params["goal"] ?? bag["goal"] ?? "") as unknown;
        if (!goal || isDebugGoal(goal)) return undefined;
        return {
          block: true,
          message:
            "Blocked: 2 consecutive fails -> need intent{goal:'debug ...'} (got non-debug intent) before write/edit/bash",
        } as unknown;
      }
      if (isMutating) {
        return {
          block: true,
          message:
            "Blocked: 2 consecutive fails -> need intent{goal:'debug ...'} before write/edit/bash",
        } as unknown;
      }
    }

    if (isMutating && (!hasIntent || !hasPlan)) {
      return {
        block: true,
        message: "Blocked: need intent -> plan before write/edit/bash (happy flow)",
      } as unknown;
    }
    return undefined;
  });

  pi.on("tool_result", async (ev: PiToolResultEvent) => {
    const name = getToolName(ev);
    const isError = Boolean(ev.isError);
    const details = (ev.result?.details ?? {}) as Record<string, unknown>;

    if (name === "intent" && !isError) {
      hasIntent = true;
      const delib = details["deliberation"] as Record<string, unknown> | undefined;
      const goal = delib?.["goal"] ?? "";
      if (isDebugGoal(goal)) {
        needsDebug = false;
        fails = 0;
      }
    }
    if (name === "plan" && !isError) hasPlan = true;

    if (name === "check") {
      const ok = details["ok"] as boolean | undefined;
      if (!isError && ok === false) {
        fails++;
        if (fails >= 2) needsDebug = true;
      } else if (ok === true) {
        fails = 0;
      } else if (isError) {
        fails++;
        if (fails >= 2) needsDebug = true;
      }
    }

    if (name === "write" || name === "edit" || name === "bash") {
      if (isError) {
        fails++;
        if (fails >= 2) needsDebug = true;
      } else {
        fails = 0;
      }
    }
    return undefined;
  });

  pi.on("session_before_compact", async (ev: PiBeforeCompactEvent) => {
    const fl = getFocus();
    if (!fl) return undefined;
    const summary: string = ev.summary ?? "";
    if (summary.startsWith(fl)) return undefined;
    return { summary: fl + "\n\n" + summary } as unknown;
  });

  pi.on("context", async (ev: PiContextEvent, ctx: PiSessionContext) => {
    let pct: number | null = null;
    try {
      const u = ctx.getContextUsage?.();
      if (u) {
        const v =
          u.percent ??
          (u.tokens && u.contextWindow
            ? Math.round((u.tokens / u.contextWindow) * 100)
            : null);
        if (typeof v === "number" && Number.isFinite(v)) pct = v;
      }
    } catch {}
    if (pct !== null && pct >= 90) {
      const msgs = ev.messages ?? [];
      const last = [...msgs].reverse().find((m) => m.role === "user");
      if (last) {
        const note = `\n\n[pi-essentials] budget CRITICAL ${pct}% -> finish edit, run check, compact next turn.`;
        const newMsgs = msgs.map((m) => ({ ...m }));
        const idx = newMsgs.indexOf(last);
        const clonedLast: Record<string, unknown> = { ...last } as Record<string, unknown>;
        if (typeof clonedLast["content"] === "string") clonedLast["content"] += note;
        else if (Array.isArray(clonedLast["content"]))
          clonedLast["content"] = [...(clonedLast["content"] as unknown[]), { type: "text", text: note }];
        else clonedLast["content"] = String(clonedLast["content"] ?? "") + note;
        newMsgs[idx] = clonedLast as typeof last;
        return { messages: newMsgs } as unknown;
      }
    }
    return undefined;
  });

  pi.registerCommand("essentials", {
    description: "pi-essentials status: intent/plan/memo/intel/check",
    handler: async (_args: string, ctx: PiSessionContext) => {
      // support `essentials clear` to reset durable state
      if (_args.trim().toLowerCase() === "clear") {
        clearState();
        hasIntent = false;
        hasPlan = false;
        fails = 0;
        needsDebug = false;
        ctx.ui?.notify?.("pi-essentials state cleared", "info");
        return;
      }
      const lines: string[] = ["pi-essentials (pi core + 1)"];
      lines.push(`intent: ${hasIntent ? "done" : "need intent{goal, hypotheses:[A,B]}"}`);
      lines.push(`plan: ${hasPlan ? "done" : "need plan{goal,tasks[3-10]}"}`);
      let pct = "n/a";
      try {
        const u = ctx.getContextUsage?.();
        if (u) {
          const v = u.percent ?? null;
          pct = typeof v === "number" && Number.isFinite(v) ? `${v}%` : "unknown";
        }
      } catch {}
      lines.push(`budget: ${pct} | fails: ${fails}${needsDebug ? " -> need debug intent" : ""}`);
      lines.push(`memos: ${memos.size}`);
      lines.push(`focus: ${getFocus() ?? "none"}`);
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });
}
