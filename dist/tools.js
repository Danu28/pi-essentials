import { Type } from "typebox";
import { memos, deliberations, plans, scoreEpisode, truncate, enforceMemoCap, } from "./state.js";
import { readFile, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { parseRisk, validateDepends, parseTask, slugify, runCmd, MAX_TASKS } from "./tool-helpers.js";
export { validateDepends, parseTask, MAX_TASKS } from "./tool-helpers.js";
export function registerTools(pi) {
    pi.registerTool({
        name: "intent",
        label: "intent",
        description: "Deliberate + set working memory in ONE call. Goal + 2 hypotheses + files + acceptance. Picks winner, sets focus that survives compaction. REQUIRED before any write/edit/bash.",
        promptSnippet: "intent — deliberate + focus (required before write/edit/bash)",
        promptGuidelines: ["ALWAYS call intent with 2 hypotheses before plan/write", "Sets focus that survives compaction and links relevant memos"],
        parameters: Type.Object({
            goal: Type.String({ minLength: 1 }),
            hypotheses: Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 2 }),
            files: Type.Optional(Type.Array(Type.String())),
            acceptance: Type.Optional(Type.String()),
            conclusion: Type.Optional(Type.String()),
        }),
        async execute(_id, p) {
            const id = `think:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
            const risks = p.hypotheses.map(parseRisk);
            let winner = p.hypotheses[0].split("|")[0].trim();
            if (risks[1] < risks[0])
                winner = p.hypotheses[1].split("|")[0].trim();
            const links = [...memos.values()].filter((e) => scoreEpisode(e, p.goal) > 1).slice(0, 2).map((e) => e.id);
            const entry = {
                id,
                goal: truncate(p.goal, 200),
                hypotheses: p.hypotheses.map((h) => truncate(h, 300)),
                winner,
                conclusion: p.conclusion ? truncate(p.conclusion, 300) : `Winner: ${winner}`,
                ts: Date.now(),
                links,
            };
            deliberations.push(entry);
            if (deliberations.length > 20)
                deliberations.shift();
            const fl = `[pi-essentials focus] ${p.goal}` + (p.files?.length ? ` files:[${p.files.join(",")}]` : "") + (p.acceptance ? ` acceptance:${p.acceptance}` : "");
            globalThis.__pi_ess_focus = fl;
            try {
                await pi.appendEntry?.("pi-ess:focus", { goal: p.goal, files: p.files ?? [], acceptance: p.acceptance, ts: Date.now() });
            }
            catch { }
            try {
                await pi.appendEntry?.("pi-ess:deliberation", entry);
            }
            catch { }
            return {
                content: [{ type: "text", text: `intent ${id}: ${p.goal}\nA: ${p.hypotheses[0]}\nB: ${p.hypotheses[1]}\n=> Winner: ${winner}` + (links.length ? ` links:[${links.join(",")}]` : "") + `\nFocus: ${fl}\n→ Next: plan{goal:"${p.goal}", tasks:["task 1 | refs:src/...","task 2 | refs:src/... check:${"npm test"}","task 3 | refs:src/... depends:0"]} (3-10 tasks) → intel → edits → check` }],
                details: { deliberation: entry, focusLine: fl },
            };
        },
    });
    pi.registerTool({
        name: "plan",
        label: "plan",
        description: "Create/update verifiable plan: goal + 3-10 tasks. Each task: title | refs:src/a.ts check:bash: npm test depends:0,1. DAG blocked until earlier done. REQUIRED before any write/edit/bash.",
        promptSnippet: "plan — DAG 3-10 tasks (required before write)",
        promptGuidelines: ["NEVER write/edit/bash without intent→plan", "Each task: title | refs:src/a.ts check:cmd depends:0,1"],
        parameters: Type.Object({
            goal: Type.Optional(Type.String()),
            tasks: Type.Optional(Type.Array(Type.String())),
            id: Type.Optional(Type.String()),
            done: Type.Optional(Type.Array(Type.Number())),
        }),
        async execute(_id, p) {
            if (p.id && plans.has(p.id)) {
                const pl = plans.get(p.id);
                if (p.done?.length) {
                    for (const i of p.done) {
                        if (!Number.isInteger(i) || i < 0 || i >= pl.tasks.length) {
                            return { content: [{ type: "text", text: `Invalid done index ${i} (range 0-${pl.tasks.length - 1})` }], details: { error: "range" } };
                        }
                        const task = pl.tasks[i];
                        const blocked = task.depends?.some((d) => !pl.tasks[d]?.done);
                        if (blocked) {
                            return { content: [{ type: "text", text: `Blocked: Task ${i + 1} depends on [${task.depends.map((d) => d + 1).join(",")}]` }], details: { error: "depends" } };
                        }
                        task.done = true;
                    }
                }
                if (p.tasks?.length) {
                    if (pl.tasks.length >= MAX_TASKS) {
                        return { content: [{ type: "text", text: `plan cap: already ${MAX_TASKS} tasks (max ${MAX_TASKS})` }], details: { error: "cap" } };
                    }
                    const seen = new Set(pl.tasks.map((t) => t.title.toLowerCase()));
                    const pending = [];
                    for (const raw of p.tasks) {
                        const parsed = parseTask(raw);
                        if (!parsed.title)
                            continue;
                        if (seen.has(parsed.title.toLowerCase()))
                            continue;
                        pending.push(parsed);
                        seen.add(parsed.title.toLowerCase());
                    }
                    const totalAfter = pl.tasks.length + pending.length;
                    if (totalAfter > MAX_TASKS) {
                        return { content: [{ type: "text", text: `plan cap: adding ${pending.length} would exceed ${MAX_TASKS} (have ${pl.tasks.length})` }], details: { error: "cap" } };
                    }
                    const finalCount = totalAfter;
                    for (let idx = 0; idx < pending.length; idx++) {
                        const selfIdx = pl.tasks.length + idx;
                        const err = validateDepends(pending[idx].depends, finalCount, selfIdx);
                        if (err)
                            return { content: [{ type: "text", text: `Invalid depends for task ${selfIdx + 1}: ${err}` }], details: { error: "depends" } };
                    }
                    for (const parsed of pending) {
                        pl.tasks.push({ ...parsed, done: false });
                    }
                }
                if (p.goal)
                    pl.goal = truncate(p.goal, 200);
                try {
                    await pi.appendEntry?.("pi-ess:plan", pl);
                }
                catch { }
                globalThis.__pi_ess_plan = pl;
                const allDone = pl.tasks.every((t) => t.done);
                return {
                    content: [{ type: "text", text: `${pl.goal}\n` + pl.tasks.map((t, i) => `${t.done ? "[x]" : "[ ]"} ${i + 1}. ${t.title}` + (t.check ? ` | check:${t.check}` : "") + (t.refs?.length ? ` | refs:${t.refs.join(",")}` : "") + (t.depends?.length ? ` | depends:${t.depends.join(",")}` : "")).join("\n") + `\n(id: ${pl.id})` + (allDone ? "\n→ All tasks done → memo remember + commit" : "\n→ Next: intel (once) → reads/edits → check → plan {id:\"" + pl.id + "\", done:[...]}") }],
                    details: { plan: pl },
                };
            }
            if (!p.goal || !p.tasks?.length) {
                return { content: [{ type: "text", text: "plan: need goal + tasks[3-10] on create, or id+done to update" }], details: { error: "missing" } };
            }
            if (p.tasks.length < 3 || p.tasks.length > MAX_TASKS) {
                return { content: [{ type: "text", text: `plan: need 3-${MAX_TASKS} tasks, got ${p.tasks.length}` }], details: { error: "count" } };
            }
            const parsedAll = p.tasks.map((raw) => parseTask(raw)).filter((t) => t.title);
            if (parsedAll.length < 3) {
                return { content: [{ type: "text", text: `plan: need 3-${MAX_TASKS} non-empty tasks, got ${parsedAll.length} after filtering` }], details: { error: "count" } };
            }
            if (parsedAll.length > MAX_TASKS) {
                return { content: [{ type: "text", text: `plan: need 3-${MAX_TASKS} tasks, got ${parsedAll.length} after filtering` }], details: { error: "count" } };
            }
            const deduped = [];
            const seenCreate = new Set();
            for (const t of parsedAll) {
                const k = t.title.toLowerCase();
                if (seenCreate.has(k))
                    continue;
                seenCreate.add(k);
                deduped.push(t);
            }
            if (deduped.length < 3) {
                return { content: [{ type: "text", text: `plan: need 3-${MAX_TASKS} unique tasks, got ${deduped.length} after dedup` }], details: { error: "count" } };
            }
            for (let i = 0; i < deduped.length; i++) {
                const err = validateDepends(deduped[i].depends, deduped.length, i);
                if (err)
                    return { content: [{ type: "text", text: `Invalid depends for task ${i + 1}: ${err}` }], details: { error: "depends" } };
            }
            const tasks = deduped.map((parsed) => ({ ...parsed, done: false }));
            const id = `plan:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
            const pl = { id, goal: truncate(p.goal, 200), tasks, ts: Date.now() };
            plans.set(id, pl);
            globalThis.__pi_ess_plan = pl;
            try {
                await pi.appendEntry?.("pi-ess:plan", pl);
            }
            catch { }
            return {
                content: [{ type: "text", text: `${pl.goal}\n` + tasks.map((t, i) => `[ ] ${i + 1}. ${t.title}` + (t.check ? ` | check:${t.check}` : "") + (t.refs?.length ? ` | refs:${t.refs.join(",")}` : "")).join("\n") + `\n(id: ${id})\n→ Next: intel → reads/edits → check → plan {id:"${id}", done:[...]}` }],
                details: { plan: pl },
            };
        },
    });
    pi.registerTool({
        name: "memo",
        label: "memo",
        description: "Unified durable memory. action=remember to encode or action=recall to retrieve. One tool instead of two.",
        promptSnippet: "memo — remember/recall durable memory",
        promptGuidelines: ["Use memo recall before intent to load relevant context", "Use memo remember after plan done"],
        parameters: Type.Object({
            action: Type.Union([Type.Literal("remember"), Type.Literal("recall")]),
            cue: Type.Optional(Type.String()),
            summary: Type.Optional(Type.String()),
            detail: Type.Optional(Type.String()),
            query: Type.Optional(Type.String()),
            tags: Type.Optional(Type.Array(Type.String())),
            refs: Type.Optional(Type.Array(Type.String())),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
        }),
        async execute(_id, p) {
            if (p.action === "remember") {
                if (!p.cue?.trim() || !p.summary?.trim()) {
                    return { content: [{ type: "text", text: "memo remember: need cue + summary" }], details: { error: "missing" } };
                }
                const norm = p.cue.trim().toLowerCase();
                const exists = [...memos.values()].find((e) => e.cue.toLowerCase() === norm);
                if (exists) {
                    exists.summary = truncate(p.summary, 400);
                    if (p.detail)
                        exists.detail = truncate(p.detail, 600);
                    if (p.tags)
                        exists.tags = p.tags.slice(0, 8);
                    if (p.refs)
                        exists.refs = p.refs.slice(0, 5);
                    exists.ts = Date.now();
                    try {
                        await pi.appendEntry?.("pi-ess:memo", exists);
                    }
                    catch { }
                    return { content: [{ type: "text", text: `Updated ${exists.id} (merged)\n→ Next: intent/plan can now link this memo` }], details: { id: exists.id, episode: exists } };
                }
                const id = `${slugify(p.cue)}:${Date.now()}:${Math.random().toString(36).slice(2, 4)}`;
                const ep = {
                    id,
                    cue: truncate(p.cue.trim(), 80),
                    summary: truncate(p.summary, 400),
                    detail: p.detail ? truncate(p.detail, 600) : undefined,
                    tags: p.tags?.slice(0, 8),
                    refs: p.refs?.slice(0, 5),
                    ts: Date.now(),
                };
                memos.set(id, ep);
                const evicted = enforceMemoCap();
                try {
                    await pi.appendEntry?.("pi-ess:memo", ep);
                }
                catch { }
                return { content: [{ type: "text", text: `Encoded ${id}` + (evicted.length ? ` (evicted ${evicted.length} LRU)` : "") + "\n→ Next: intent will auto-link relevant memos" }], details: { id, episode: ep, evicted } };
            }
            else {
                const q = p.query ?? p.cue ?? "";
                const lim = Math.min(Math.max(p.limit ?? 5, 1), 20);
                const tags = p.tags;
                let cand = [...memos.values()];
                if (tags?.length) {
                    cand = cand.filter((e) => tags.every((t) => (e.tags ?? []).map((x) => x.toLowerCase()).includes(t.toLowerCase())));
                }
                const scored = cand.map((e) => ({ e, s: scoreEpisode(e, q, tags) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, lim);
                if (!scored.length) {
                    return { content: [{ type: "text", text: cand.length ? `No relevant memos for "${q}"` : "No memos yet. Use memo {action:remember} first." }], details: { episodes: [] } };
                }
                const text = scored.map(({ e, s }) => `[${e.cue}] (${s.toFixed(1)}) ${e.summary}` + (e.tags?.length ? ` [${e.tags.join(",")}]` : "") + (e.refs?.length ? ` refs:${e.refs.join(",")}` : "")).join("\n") + "\n→ Next: intent will auto-link these memos via scoreEpisode";
                return { content: [{ type: "text", text }], details: { episodes: scored.map((x) => x.e) } };
            }
        },
    });
    pi.registerTool({
        name: "intel",
        label: "intel",
        description: "Project profile cached: lang, scripts, test/lint/build. Call ONCE at task start — later calls free (cache).",
        promptSnippet: "intel — cached project profile (call once)",
        promptGuidelines: ["Call intel once after plan to get test/lint/build cmds, then proceed to edits"],
        parameters: Type.Object({
            refresh: Type.Optional(Type.Boolean()),
            projectPath: Type.Optional(Type.String()),
        }),
        async execute(_id, p, _sig, _upd, ctx) {
            const rawCwd = p.projectPath ?? ctx.cwd;
            const cwd = resolve(rawCwd);
            const cached = globalThis.__pi_ess_intel;
            if (cached && resolve(cached.cwd) === cwd && !p.refresh) {
                try {
                    const pkgStat = await stat(join(cwd, "package.json"));
                    if (pkgStat.mtimeMs > cached.scannedAt) {
                        // stale cache -> fall through to fresh scan
                    }
                    else {
                        return { content: [{ type: "text", text: cached.text + "\n→ Next: reads/edits → check (test: " + cached.testCmd + ")" }], details: { profile: cached, source: "cache" } };
                    }
                }
                catch {
                    return { content: [{ type: "text", text: cached.text + "\n→ Next: reads/edits → check (test: " + cached.testCmd + ")" }], details: { profile: cached, source: "cache" } };
                }
            }
            const files = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "README.md"];
            const present = new Set();
            for (const f of files) {
                try {
                    await stat(join(cwd, f));
                    present.add(f);
                }
                catch { }
            }
            let lang = "unknown";
            let scripts = {};
            let testCmd;
            let lintCmd;
            let buildCmd;
            let name;
            if (present.has("package.json")) {
                try {
                    const raw = await readFile(join(cwd, "package.json"), "utf8");
                    const pkg = JSON.parse(raw);
                    lang = "node";
                    name = pkg.name;
                    scripts = pkg.scripts ?? {};
                    testCmd = scripts["test"];
                    lintCmd = scripts["lint"];
                    buildCmd = scripts["build"];
                }
                catch { }
            }
            else if (present.has("Cargo.toml")) {
                lang = "rust";
                testCmd = "cargo test";
                buildCmd = "cargo build";
            }
            else if (present.has("go.mod")) {
                lang = "go";
                testCmd = "go test ./...";
            }
            else if (present.has("pyproject.toml")) {
                lang = "python";
                testCmd = "pytest";
            }
            const profile = {
                cwd,
                lang,
                name,
                scripts,
                testCmd: testCmd ?? "not detected",
                lintCmd: lintCmd ?? "not detected",
                buildCmd: buildCmd ?? "not detected",
                scannedAt: Date.now(),
                text: "",
            };
            const displayName = name ?? basename(cwd);
            const text = `project: ${displayName} (${lang})\n` + `test: ${profile.testCmd} | lint: ${profile.lintCmd} | build: ${profile.buildCmd}\n` + `scripts: ${Object.entries(scripts).slice(0, 6).map(([k, v]) => `${k}->${v}`).join(" | ") || "none"}`;
            const entry = { ...profile, text };
            globalThis.__pi_ess_intel = entry;
            try {
                await pi.appendEntry?.("pi-ess:intel", entry);
            }
            catch { }
            return { content: [{ type: "text", text: text + "\n→ Next: reads/edits → check (test: " + profile.testCmd + ")" }], details: { profile: entry, source: "fresh" } };
        },
    });
    pi.registerTool({
        name: "check",
        label: "check",
        description: "Run a check and get PASS/FAIL + budget in same call. Use testCmd from intel. Never claim success without PASS.",
        promptSnippet: "check — verify PASS/FAIL + budget",
        promptGuidelines: ["ALWAYS run check after edits; never mark plan done without PASS", "On FAIL fix and re-check; after 2 fails need debug intent"],
        parameters: Type.Object({
            command: Type.String({ minLength: 1 }),
            cwd: Type.Optional(Type.String()),
            timeout: Type.Optional(Type.Number({ minimum: 1, maximum: 600 })),
        }),
        async execute(_id, p, _sig, _upd, ctx) {
            const cmd = p.command.trim();
            if (!cmd)
                return { content: [{ type: "text", text: "check: command required" }], details: { error: "empty" } };
            const cwd = p.cwd ?? ctx.cwd;
            const toMs = Math.min(p.timeout ?? 120, 600) * 1000;
            const start = Date.now();
            const res = await runCmd(cmd, cwd, toMs);
            const elapsed = Math.round((Date.now() - start) / 1000);
            let pct = null;
            let tier = "unknown";
            try {
                const u = ctx.getContextUsage?.();
                if (u) {
                    const v = u.percent ?? (u.tokens && u.contextWindow ? Math.round((u.tokens / u.contextWindow) * 100) : null);
                    if (typeof v === "number" && Number.isFinite(v)) {
                        pct = v;
                        if (pct < 50)
                            tier = "clear";
                        else if (pct < 70)
                            tier = "moderate";
                        else if (pct < 90)
                            tier = "getting-full";
                        else
                            tier = "CRITICAL";
                    }
                }
            }
            catch { }
            const verdict = res.timedOut ? "TIMEOUT" : res.ok ? "PASS" : "FAIL";
            const body = res.timedOut ? `TIMEOUT after ${elapsed}s` : res.ok ? truncate((res.stdout || res.stderr).trim() || "(no output)", 500) : truncate((res.stderr || res.stdout).split("\n").slice(-40).join("\n"), 1200);
            const budgetLine = pct !== null ? `budget: ${pct}% (${tier})${tier === "CRITICAL" ? " -> compact next" : ""}` : "budget: unknown";
            const text = `check: ${verdict} (exit ${res.code}) in ${elapsed}s -- ${cmd}\n` + body + `\n${budgetLine}` + (res.ok ? "\n→ Next: plan {id,done:[...]} → memo remember" : "\n→ Next: fix error above → re-run check (hint: intel test cmd, after 2 fails → intent{goal:'debug ...'})");
            return { content: [{ type: "text", text }], details: { ok: res.ok, code: res.code, timedOut: res.timedOut, budget: { pct, tier } } };
        },
    });
}
//# sourceMappingURL=tools.js.map