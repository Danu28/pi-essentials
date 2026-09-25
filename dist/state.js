export const MAX_MEMOS = 100;
export const memos = new Map();
export const deliberations = [];
export const plans = new Map();
export let latestPlan;
export let focusLine = null;
export let intelCache = null;
/** Evict oldest memos (by ts) until size <= MAX_MEMOS. LRU-ish. */
export function enforceMemoCap() {
    if (memos.size <= MAX_MEMOS)
        return [];
    const sorted = [...memos.values()].sort((a, b) => a.ts - b.ts);
    const toEvict = sorted.slice(0, memos.size - MAX_MEMOS);
    for (const e of toEvict)
        memos.delete(e.id);
    return toEvict.map((e) => e.id);
}
export function tokenize(s) {
    const raw = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return raw.filter((t) => t.length >= 2 || t === "c" || t === "r");
}
export function scoreEpisode(e, q, filterTags) {
    if (!q.trim() && !filterTags?.length)
        return 0.5;
    const qt = new Set(tokenize(q));
    if (!qt.size && filterTags?.length) {
        const et = new Set((e.tags ?? []).map((t) => t.toLowerCase()));
        return filterTags.every((t) => et.has(t.toLowerCase())) ? 1 : 0;
    }
    let s = 0;
    const cue = tokenize(e.cue);
    const sum = tokenize(e.summary);
    const det = tokenize(e.detail ?? "");
    for (const t of qt) {
        if (cue.includes(t))
            s += 2;
        if (sum.includes(t))
            s += 1;
        if (det.includes(t))
            s += 0.75; // boosted from 0.5 — detail matters
    }
    if (filterTags?.length) {
        const et = new Set((e.tags ?? []).map((t) => t.toLowerCase()));
        const matches = filterTags.filter((ft) => et.has(ft.toLowerCase())).length;
        if (matches === 0)
            return 0;
        if (s === 0)
            s = matches * 0.5;
        else
            s = s * (1 + 0.5 * (matches / filterTags.length));
    }
    // recency decay: recent memos get small boost, old memos naturally decay via LRU
    if (s > 0) {
        const ageDays = (Date.now() - e.ts) / (24 * 60 * 60 * 1000);
        let recencyBoost = 0;
        if (ageDays < 1)
            recencyBoost = 0.3;
        else if (ageDays < 7)
            recencyBoost = 0.15;
        else if (ageDays < 30)
            recencyBoost = 0.05;
        if (recencyBoost)
            s = s * (1 + recencyBoost);
    }
    return s;
}
export function truncate(s, n = 800) {
    return s.length > n ? s.slice(0, n) + "\u2026" : s;
}
function isRecord(v) {
    return typeof v === "object" && v !== null;
}
function extractKeyValue(entry) {
    if (!isRecord(entry))
        return { key: "", value: entry };
    const key = entry["key"] ??
        entry["type"] ??
        entry["kind"] ??
        entry["name"] ??
        "";
    const value = entry["value"] ??
        entry["data"] ??
        entry["payload"] ??
        entry["entry"] ??
        entry;
    if (isRecord(value) &&
        "key" in value &&
        "value" in value &&
        typeof value["key"] === "string") {
        return { key: value["key"], value: value["value"] };
    }
    return { key, value };
}
export function hydrate(entries) {
    memos.clear();
    deliberations.length = 0;
    plans.clear();
    latestPlan = undefined;
    focusLine = null;
    intelCache = null;
    for (const raw of entries) {
        const { key, value } = extractKeyValue(raw);
        if (key === "pi-ess:memo" && isRecord(value) && typeof value["cue"] === "string") {
            const ep = value;
            memos.set(ep.id, ep);
        }
        else if (key === "pi-ess:deliberation" && isRecord(value) && typeof value["goal"] === "string") {
            const d = value;
            deliberations.push(d);
            if (deliberations.length > 20)
                deliberations.shift();
        }
        else if (key === "pi-ess:plan" && isRecord(value) && typeof value["id"] === "string") {
            const p = value;
            plans.set(p.id, p);
            latestPlan = p;
        }
        else if (key === "pi-ess:focus" && isRecord(value) && typeof value["goal"] === "string") {
            const v = value;
            focusLine =
                `[pi-essentials focus] ${v.goal}` +
                    (v.files?.length ? ` files:[${v.files.join(",")}]` : "") +
                    (v.acceptance ? ` acceptance:${v.acceptance}` : "");
            globalThis.__pi_ess_focus = focusLine ?? undefined;
        }
        else if (key === "pi-ess:intel" && isRecord(value) && typeof value["cwd"] === "string") {
            const v = value;
            intelCache = v;
            globalThis.__pi_ess_intel = v;
        }
        else if (isRecord(value)) {
            if (typeof value["cue"] === "string" && typeof value["summary"] === "string" && "ts" in value) {
                const ep = value;
                if (ep.id)
                    memos.set(ep.id, ep);
            }
            else if (typeof value["goal"] === "string" && Array.isArray(value["hypotheses"])) {
                const d = value;
                deliberations.push(d);
                if (deliberations.length > 20)
                    deliberations.shift();
            }
        }
    }
    enforceMemoCap();
    if (!focusLine && globalThis.__pi_ess_focus)
        focusLine = globalThis.__pi_ess_focus;
    if (!intelCache && globalThis.__pi_ess_intel)
        intelCache = globalThis.__pi_ess_intel;
    if (!latestPlan && globalThis.__pi_ess_plan) {
        latestPlan = globalThis.__pi_ess_plan;
        if (latestPlan)
            plans.set(latestPlan.id, latestPlan);
    }
}
export function clearState() {
    memos.clear();
    deliberations.length = 0;
    plans.clear();
    latestPlan = undefined;
    focusLine = null;
    intelCache = null;
    // also clear durable globals so next session starts clean
    try {
        delete globalThis.__pi_ess_focus;
    }
    catch { }
    try {
        delete globalThis.__pi_ess_intel;
    }
    catch { }
    try {
        delete globalThis.__pi_ess_plan;
    }
    catch { }
}
//# sourceMappingURL=state.js.map