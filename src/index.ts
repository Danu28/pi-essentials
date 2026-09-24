import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTools } from "./tools.js";
import { hydrate, memos, deliberations, plans, focusLine } from "./state.js";

let hasIntent = false;
let hasPlan = false;
let fails = 0;
let needsDebug = false;

function isDebugGoal(goal: unknown): boolean {
  return typeof goal === "string" && /debug/i.test(goal);
}

function getToolName(ev: any): string {
  return ev?.toolName ?? ev?.name ?? "";
}

export default function (pi: ExtensionAPI) {
  registerTools(pi);

  pi.on("session_start" as any, async (_ev: any, ctx: any) => {
    const entries: unknown[] = ctx?.entries ?? (ctx as any)?.entries ?? [];
    const extra = (ctx as any)?.store?.entries ?? [];
    const combined = [...(Array.isArray(entries) ? entries : []), ...(Array.isArray(extra) ? extra : [])];
    try {
      hydrate(combined);
    } catch {}
    hasIntent = deliberations.length > 0;
    hasPlan = plans.size > 0;
    fails = 0;
    needsDebug = false;
    if (focusLine) (globalThis as any).__pi_ess_focus = focusLine;
  });

  pi.on("tool_call" as any, async (ev: any) => {
    const name = getToolName(ev);
    const isWrite = name === "write" || name === "edit";
    const isBash = name === "bash";
    const isMutating = isWrite || isBash;

    if (needsDebug) {
      if (name === "intent") {
        const goal =
          ev?.params?.goal ??
          ev?.input?.goal ??
          ev?.args?.goal ??
          ev?.goal ??
          ev?.toolInput?.goal ??
          "";
        if (!goal || isDebugGoal(goal)) return undefined;
        return {
          block: true,
          message:
            "Blocked: 2 consecutive fails -> need intent{goal:'debug ...'} (got non-debug intent) before write/edit/bash",
        } as any;
      }
      if (isMutating) {
        return {
          block: true,
          message:
            "Blocked: 2 consecutive fails -> need intent{goal:'debug ...'} before write/edit/bash",
        } as any;
      }
    }

    if (isMutating && (!hasIntent || !hasPlan)) {
      return {
        block: true,
        message: "Blocked: need intent -> plan before write/edit/bash (happy flow)",
      } as any;
    }
    return undefined;
  });

  pi.on("tool_result" as any, async (ev: any) => {
    const name = getToolName(ev);
    const isError = !!ev?.isError;
    const details = ev?.result?.details ?? {};

    if (name === "intent" && !isError) {
      hasIntent = true;
      const goal = details?.deliberation?.goal ?? "";
      if (isDebugGoal(goal)) {
        needsDebug = false;
        fails = 0;
      }
    }
    if (name === "plan" && !isError) hasPlan = true;

    if (name === "check") {
      const ok = details?.ok;
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

  pi.on("session_before_compact" as any, async (ev: any) => {
    const fl = (globalThis as any).__pi_ess_focus ?? focusLine;
    if (!fl) return undefined;
    const summary: string = ev?.summary ?? "";
    if (summary.startsWith(fl)) return undefined;
    return { summary: fl + "\n\n" + summary } as any;
  });

  pi.on("context" as any, async (ev: any, ctx: any) => {
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
      const msgs: any[] = ev?.messages ?? [];
      const last = [...msgs].reverse().find((m: any) => m.role === "user");
      if (last) {
        const note = `\n\n[pi-essentials] budget CRITICAL ${pct}% -> finish edit, run check, compact next turn.`;
        const newMsgs = msgs.map((m: any) => ({ ...m }));
        const idx = newMsgs.indexOf(last);
        const clonedLast: any = { ...last };
        if (typeof clonedLast.content === "string") clonedLast.content += note;
        else if (Array.isArray(clonedLast.content))
          clonedLast.content = [...clonedLast.content, { type: "text", text: note }];
        else clonedLast.content = String(clonedLast.content ?? "") + note;
        newMsgs[idx] = clonedLast;
        return { messages: newMsgs } as any;
      }
    }
    return undefined;
  });

  pi.registerCommand("essentials", {
    description: "pi-essentials status: intent/plan/memo/intel/check",
    handler: async (_args: string, ctx: any) => {
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
      lines.push(`focus: ${(globalThis as any).__pi_ess_focus ?? focusLine ?? "none"}`);
      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });
}
