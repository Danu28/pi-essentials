export interface MemoEpisode {
  id: string;
  cue: string;
  summary: string;
  detail?: string;
  tags?: string[];
  refs?: string[];
  ts: number;
}

export interface Deliberation {
  id: string;
  goal: string;
  hypotheses: string[];
  winner?: string;
  conclusion?: string;
  ts: number;
  links?: string[];
}

export interface PlanTask {
  title: string;
  done: boolean;
  refs?: string[];
  check?: string;
  depends?: number[];
}

export interface Plan {
  id: string;
  goal: string;
  tasks: PlanTask[];
  ts: number;
}

export interface IntelProfile {
  cwd: string;
  lang: string;
  name?: string;
  scripts: Record<string, string>;
  testCmd: string;
  lintCmd: string;
  buildCmd: string;
  os?: string;
  shell?: string;
  suggestedCheck?: string;
  scannedAt: number;
  text: string;
}

export const MAX_MEMOS = 100;
export const memos = new Map<string, MemoEpisode>();
export const deliberations: Deliberation[] = [];
export const plans = new Map<string, Plan>();
export let latestPlan: Plan | undefined;
export let focusLine: string | null = null;
export let intelCache: IntelProfile | null = null;

/** Evict oldest memos (by ts) until size <= MAX_MEMOS. LRU-ish. */
export function enforceMemoCap(): string[] {
  if (memos.size <= MAX_MEMOS) return [];
  const sorted = [...memos.values()].sort((a, b) => a.ts - b.ts);
  const toEvict = sorted.slice(0, memos.size - MAX_MEMOS);
  for (const e of toEvict) memos.delete(e.id);
  return toEvict.map((e) => e.id);
}

declare global {
  var __pi_ess_focus: string | undefined;
  var __pi_ess_intel: IntelProfile | undefined;
  var __pi_ess_plan: Plan | undefined;
}

export function tokenize(s: string): string[] {
  const raw = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return raw.filter((t) => t.length >= 2 || t === "c" || t === "r");
}

export function scoreEpisode(
  e: MemoEpisode,
  q: string,
  filterTags?: string[],
): number {
  if (!q.trim() && !filterTags?.length) return 0.5;
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
    if (cue.includes(t)) s += 2;
    if (sum.includes(t)) s += 1;
    if (det.includes(t)) s += 0.75; // boosted from 0.5 — detail matters
  }
  if (filterTags?.length) {
    const et = new Set((e.tags ?? []).map((t) => t.toLowerCase()));
    const matches = filterTags.filter((ft) => et.has(ft.toLowerCase())).length;
    if (matches === 0) return 0;
    if (s === 0) s = matches * 0.5;
    else s = s * (1 + 0.5 * (matches / filterTags.length));
  }
  // recency decay: recent memos get small boost, old memos naturally decay via LRU
  if (s > 0) {
    const ageDays = (Date.now() - e.ts) / (24 * 60 * 60 * 1000);
    let recencyBoost = 0;
    if (ageDays < 1) recencyBoost = 0.3;
    else if (ageDays < 7) recencyBoost = 0.15;
    else if (ageDays < 30) recencyBoost = 0.05;
    if (recencyBoost) s = s * (1 + recencyBoost);
  }
  return s;
}

export function truncate(s: string, n = 800): string {
  return s.length > n ? s.slice(0, n) + "\u2026" : s;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractKeyValue(entry: unknown): { key: string; value: unknown } {
  if (!isRecord(entry)) return { key: "", value: entry };
  const key =
    (entry["key"] as string) ??
    (entry["type"] as string) ??
    (entry["kind"] as string) ??
    (entry["name"] as string) ??
    "";
  const value =
    (entry["value"] as unknown) ??
    (entry["data"] as unknown) ??
    (entry["payload"] as unknown) ??
    (entry["entry"] as unknown) ??
    entry;
  if (
    isRecord(value) &&
    "key" in value &&
    "value" in value &&
    typeof value["key"] === "string"
  ) {
    return { key: value["key"] as string, value: value["value"] };
  }
  return { key, value };
}

export function hydrate(entries: unknown[]): void {
  memos.clear();
  deliberations.length = 0;
  plans.clear();
  latestPlan = undefined;
  focusLine = null;
  intelCache = null;
  for (const raw of entries) {
    const { key, value } = extractKeyValue(raw);
    if (key === "pi-ess:memo" && isRecord(value) && typeof value["cue"] === "string") {
      const ep = value as unknown as MemoEpisode;
      memos.set(ep.id, ep);
    } else if (key === "pi-ess:deliberation" && isRecord(value) && typeof value["goal"] === "string") {
      const d = value as unknown as Deliberation;
      deliberations.push(d);
      if (deliberations.length > 20) deliberations.shift();
    } else if (key === "pi-ess:plan" && isRecord(value) && typeof value["id"] === "string") {
      const p = value as unknown as Plan;
      plans.set(p.id, p);
      latestPlan = p;
    } else if (key === "pi-ess:focus" && isRecord(value) && typeof value["goal"] === "string") {
      const v = value as { goal: string; files?: string[]; acceptance?: string };
      focusLine =
        `[pi-essentials focus] ${v.goal}` +
        (v.files?.length ? ` files:[${v.files.join(",")}]` : "") +
        (v.acceptance ? ` acceptance:${v.acceptance}` : "");
      globalThis.__pi_ess_focus = focusLine ?? undefined;
    } else if (key === "pi-ess:intel" && isRecord(value) && typeof value["cwd"] === "string") {
      const v = value as unknown as IntelProfile;
      intelCache = v;
      globalThis.__pi_ess_intel = v;
    } else if (isRecord(value)) {
      if (typeof value["cue"] === "string" && typeof value["summary"] === "string" && "ts" in value) {
        const ep = value as unknown as MemoEpisode;
        if (ep.id) memos.set(ep.id, ep);
      } else if (typeof value["goal"] === "string" && Array.isArray(value["hypotheses"])) {
        const d = value as unknown as Deliberation;
        deliberations.push(d);
        if (deliberations.length > 20) deliberations.shift();
      }
    }
  }
  enforceMemoCap();
  if (!focusLine && globalThis.__pi_ess_focus) focusLine = globalThis.__pi_ess_focus;
  if (!intelCache && globalThis.__pi_ess_intel) intelCache = globalThis.__pi_ess_intel;
  if (!latestPlan && globalThis.__pi_ess_plan) {
    latestPlan = globalThis.__pi_ess_plan;
    if (latestPlan) plans.set(latestPlan.id, latestPlan);
  }
}

export function clearState(): void {
  memos.clear();
  deliberations.length = 0;
  plans.clear();
  latestPlan = undefined;
  focusLine = null;
  intelCache = null;
  // also clear durable globals so next session starts clean
  try { delete (globalThis as unknown as Record<string, unknown>).__pi_ess_focus; } catch {}
  try { delete (globalThis as unknown as Record<string, unknown>).__pi_ess_intel; } catch {}
  try { delete (globalThis as unknown as Record<string, unknown>).__pi_ess_plan; } catch {}
}
