import { registerTools } from "./tools.js";
import { hydrate, memos, deliberations, plans, focusLine, clearState } from "./state.js";
let hasIntent = false;
let hasPlan = false;
let fails = 0;
let needsDebug = false;
function isDebugGoal(goal) {
    return typeof goal === "string" && /debug/i.test(goal);
}
function getToolName(ev) {
    return ev.toolName ?? ev.name ?? "";
}
function getFocus() {
    return globalThis.__pi_ess_focus ?? focusLine ?? null;
}
export default function (pi) {
    registerTools(pi);
    pi.on("before_agent_start", async (ev) => {
        try {
            const opts = ev?.systemPromptOptions;
            if (!opts)
                return;
            // proactive guidance — shown before first tool call, so agent never hits a blind block
            const guidelines = Array.isArray(opts.promptGuidelines) ? [...opts.promptGuidelines] : [];
            const hasEss = guidelines.some((g) => g.includes("pi-essentials"));
            if (!hasEss) {
                guidelines.push("pi-essentials: ALWAYS intent{goal, hypotheses:[A,B]} → plan{goal, tasks[3-10]} BEFORE any write/edit/bash");
                guidelines.push("After intent call plan; after plan call intel (once); after edits call check; after PASS mark plan done + memo remember");
                guidelines.push("If check FAIL, fix and re-check. After 2 consecutive fails writes are blocked until intent{goal:'debug ...'}");
                opts.promptGuidelines = guidelines;
            }
            const sections = (opts.sections ?? {});
            if (!sections["pi-essentials"]) {
                sections["pi-essentials"] = `<pi-essentials>
Happy flow: intent → plan → intel → reads/edits → check PASS → plan {done} → memo remember
Unhappy: check FAIL → fix → re-check; 2 consecutive fails → blocked until intent{goal:'debug ...'}
All write/edit/bash blocked until intent+plan done. Run /essentials for status. Tools: intent/plan/memo/intel/check.
</pi-essentials>`;
                opts.sections = sections;
            }
        }
        catch { }
    });
    pi.on("session_start", async (_ev, ctx) => {
        const entries = ctx.entries ?? ctx.store?.entries ?? [];
        const combined = Array.isArray(entries) ? entries : [];
        try {
            hydrate(combined);
        }
        catch { }
        hasIntent = deliberations.length > 0;
        hasPlan = plans.size > 0;
        fails = 0;
        needsDebug = false;
        if (focusLine)
            globalThis.__pi_ess_focus = focusLine;
    });
    pi.on("tool_call", async (ev) => {
        const name = getToolName(ev);
        const isWrite = name === "write" || name === "edit";
        const isBash = name === "bash";
        const isMutating = isWrite || isBash;
        if (needsDebug) {
            if (name === "intent") {
                const bag = ev;
                const params = (bag["params"] ?? bag["input"] ?? bag["args"] ?? bag["toolInput"] ?? {});
                const goal = (params["goal"] ?? bag["goal"] ?? "");
                if (!goal || isDebugGoal(goal))
                    return undefined;
                return {
                    block: true,
                    reason: "Blocked: 2 consecutive fails → need intent{goal:'debug ...'} (got non-debug intent) before write/edit/bash. Run: intent{goal:'debug <what failed>', hypotheses:['fix A | risk:2','fix B | risk:5']}",
                };
            }
            if (isMutating) {
                return {
                    block: true,
                    reason: "Blocked: 2 consecutive fails → need intent{goal:'debug ...'} before write/edit/bash. Run: intent{goal:'debug <what failed>', hypotheses:['fix A | risk:2','fix B | risk:5']}",
                };
            }
        }
        if (isMutating && (!hasIntent || !hasPlan)) {
            return {
                block: true,
                reason: "Blocked: need intent → plan before write/edit/bash. Happy flow: 1) intent{goal:'...', hypotheses:['A | risk:2','B | risk:5'], files:['...'], acceptance:'...'} 2) plan{goal:'...', tasks:['t1 | refs:src/a.ts','t2 | refs:src/a.ts check:npm test','t3 | refs:src/a.ts']} 3) then write/edit/bash. Check /essentials for status.",
            };
        }
        return undefined;
    });
    pi.on("tool_result", async (ev, _ctx) => {
        const toolEv = ev;
        const name = getToolName(toolEv);
        const isError = Boolean(toolEv.isError);
        const details = (toolEv.result?.details ?? toolEv.details ?? {});
        if (name === "intent" && !isError) {
            hasIntent = true;
            const delib = details["deliberation"];
            const goal = delib?.["goal"] ?? "";
            if (isDebugGoal(goal)) {
                needsDebug = false;
                fails = 0;
            }
        }
        if (name === "plan" && !isError)
            hasPlan = true;
        if (name === "check") {
            const ok = details["ok"];
            if (!isError && ok === false) {
                fails++;
                if (fails >= 2)
                    needsDebug = true;
                if (fails === 1) {
                    const orig = Array.isArray(toolEv.content) ? toolEv.content : [];
                    return {
                        content: [
                            ...orig,
                            { type: "text", text: "⚠️ 1 consecutive FAIL — next fail will block write/edit/bash until intent{goal:'debug ...'}. Fix the error above and re-run check before writing." },
                        ],
                    };
                }
            }
            else if (ok === true) {
                fails = 0;
            }
            else if (isError) {
                fails++;
                if (fails >= 2)
                    needsDebug = true;
                if (fails === 1) {
                    const orig = Array.isArray(toolEv.content) ? toolEv.content : [];
                    return {
                        content: [...orig, { type: "text", text: "⚠️ 1 error — next fail will block writes until debug intent. Inspect and fix." }],
                    };
                }
            }
        }
        if (name === "write" || name === "edit" || name === "bash") {
            if (isError) {
                fails++;
                if (fails >= 2)
                    needsDebug = true;
                if (fails === 1) {
                    const orig = Array.isArray(toolEv.content) ? toolEv.content : [];
                    return {
                        content: [...orig, { type: "text", text: "⚠️ 1 consecutive write/edit/bash error — one more fail will require intent{goal:'debug ...'} before further writes." }],
                    };
                }
            }
            else {
                fails = 0;
            }
        }
        return undefined;
    });
    pi.on("session_before_compact", async (ev) => {
        const fl = getFocus();
        if (!fl)
            return undefined;
        const summary = ev.summary ?? "";
        if (summary.startsWith(fl))
            return undefined;
        return { summary: fl + "\n\n" + summary };
    });
    pi.on("context", async (ev, ctx) => {
        let pct = null;
        try {
            const u = ctx.getContextUsage?.();
            if (u) {
                const v = u.percent ??
                    (u.tokens && u.contextWindow
                        ? Math.round((u.tokens / u.contextWindow) * 100)
                        : null);
                if (typeof v === "number" && Number.isFinite(v))
                    pct = v;
            }
        }
        catch { }
        if (pct !== null && pct >= 90) {
            const msgs = ev.messages ?? [];
            const last = [...msgs].reverse().find((m) => m.role === "user");
            if (last) {
                const note = `\n\n[pi-essentials] budget CRITICAL ${pct}% -> finish edit, run check, compact next turn.`;
                const idx = msgs.indexOf(last);
                const newMsgs = msgs.map((m) => ({ ...m }));
                const clonedLast = { ...last };
                if (typeof clonedLast["content"] === "string")
                    clonedLast["content"] += note;
                else if (Array.isArray(clonedLast["content"]))
                    clonedLast["content"] = [...clonedLast["content"], { type: "text", text: note }];
                else
                    clonedLast["content"] = String(clonedLast["content"] ?? "") + note;
                newMsgs[idx] = clonedLast;
                return { messages: newMsgs };
            }
        }
        return undefined;
    });
    pi.registerCommand("essentials", {
        description: "pi-essentials status: intent/plan/memo/intel/check",
        handler: async (_args, ctx) => {
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
            const lines = ["pi-essentials (pi core + 1)"];
            lines.push(`intent: ${hasIntent ? "done" : "need intent{goal, hypotheses:[A,B]}"}`);
            lines.push(`plan: ${hasPlan ? "done" : "need plan{goal,tasks[3-10]}"}`);
            let pct = "n/a";
            try {
                const u = ctx.getContextUsage?.();
                if (u) {
                    const v = u.percent ?? null;
                    pct = typeof v === "number" && Number.isFinite(v) ? `${v}%` : "unknown";
                }
            }
            catch { }
            lines.push(`budget: ${pct} | fails: ${fails}${needsDebug ? " -> need debug intent" : ""}`);
            lines.push(`memos: ${memos.size}`);
            lines.push(`focus: ${getFocus() ?? "none"}`);
            ctx.ui?.notify?.(lines.join("\n"), "info");
        },
    });
}
//# sourceMappingURL=index.js.map