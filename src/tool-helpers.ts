import { truncate } from "./state.js";
import { spawn } from "node:child_process";

export const MAX_TASKS = 10;
export const MAX_OUTPUT = 64 * 1024;

export const INTENT_VERBS = ["add","fix","implement","create","update","refactor","remove","delete","migrate","audit","test","build","wire","ship","design","expand","enforce","handle","support","render","parse","validate","introduce","improve","optimize","document"];
export const VAGUE_HYPOTHESIS_PATTERNS = ["fix bug","maybe","do thing","quick fix","improve stuff","handle thing","stuff","thing","some bug","general"];

export function lintIntent(p: { goal: string; hypotheses: [string, string]; files?: string[]; acceptance?: string }): string[] {
  const warns: string[] = [];
  const goal = p.goal ?? "";
  if (goal.trim().length < 10) warns.push("goal short (<10 chars) — be specific: 'add JWT auth to /api/login' not 'auth'");
  const hasVerb = INTENT_VERBS.some((v) => new RegExp(`\\b${v}\\b`, "i").test(goal));
  if (!hasVerb) warns.push("goal has no verb — start with action: add/fix/implement/create (e.g. 'add JWT auth')");
  if (!p.acceptance?.trim()) warns.push("missing acceptance — define PASS condition: e.g. acceptance:'check npm test PASS' or 'route returns 200'");
  if (!p.files?.length) warns.push("missing files — list 1-3 refs: files:['src/auth.ts'] helps focus survive compaction");
  for (let i = 0; i < 2; i++) {
    const raw = p.hypotheses[i] ?? "";
    const title = raw.split("|")[0].trim();
    if (title.length < 10) warns.push(`hypothesis ${i + 1} vague (<10 chars title): "${title}" — e.g. "jwt via jose, 15m expiry | risk:2"`);
    const lower = title.toLowerCase();
    if (VAGUE_HYPOTHESIS_PATTERNS.some((pat) => lower.includes(pat))) warns.push(`hypothesis ${i + 1} generic ("${title}") — include mechanism + risk: e.g. "session store redis | risk:5"`);
    if (!/risk\s*:/i.test(raw)) warns.push(`hypothesis ${i + 1} missing risk — add " | risk:2" (lower = safer)`);
  }
  return warns;
}

export function lintPlan(tasks: Array<{ title: string; refs?: string[]; check?: string }>): string[] {
  const warns: string[] = [];
  if (!tasks.some((t) => t.refs?.length)) warns.push("plan has no refs — every task should have refs:src/a.ts (enables input scoping)");
  if (!tasks.some((t) => t.check)) warns.push("plan has no check — at least one task should have check:npm test (enables PASS gate)");
  tasks.forEach((t, i) => {
    if (!t.refs?.length) warns.push(`task ${i + 1} "${t.title}" missing refs — add | refs:src/a.ts`);
    if (!t.check) warns.push(`task ${i + 1} "${t.title}" missing check — add | check:npm test (or per-task lint)`);
  });
  return warns;
}

export function truncationWarnings(original: string, truncated: string): string | null {
  if (original.length > truncated.length) {
    const hadEllipsis = truncated.endsWith("\u2026");
    const limit = hadEllipsis ? truncated.length - 1 : truncated.length;
    return `${original.length}\u2192${limit} chars (\u2026truncated)`;
  }
  return null;
}

export function parseRisk(h: string): number {
  const m = h.match(/risk\s*:\s*(\d+)/i);
  if (!m) return 5;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 5;
}

export function validateDepends(depends: number[] | undefined, taskCount: number, selfIndex?: number): string | null {
  if (!depends?.length) return null;
  for (const d of depends) {
    if (!Number.isInteger(d) || d < 0 || d >= taskCount) return `depends index ${d} out of range [0,${taskCount - 1}]`;
    if (selfIndex !== undefined && d === selfIndex) return `task ${selfIndex + 1} cannot depend on itself`;
  }
  if (new Set(depends).size !== depends.length) return "duplicate depends indices";
  return null;
}

export function parseTask(raw: string): {
  title: string;
  refs?: string[];
  check?: string;
  depends?: number[];
} {
  const title = raw.split("|")[0].trim();
  const refsMatch = raw.match(/refs:([^|]+)/i);
  const checkMatch = raw.match(/check:([^|]+)/i);
  const dependsMatch = raw.match(/depends:([0-9,\s]+)/i);
  let refs: string[] | undefined;
  if (refsMatch) {
    const parts = refsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) refs = parts.map((p) => truncate(p, 120));
  }
  let check: string | undefined;
  if (checkMatch) check = checkMatch[1].trim();
  let depends: number[] | undefined;
  if (dependsMatch) {
    const nums = dependsMatch[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (nums.length) depends = nums;
  }
  return { title: truncate(title, 120), refs, check, depends };
}

export function slugify(cue: string): string {
  const base = cue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, 24);
  return base || "memo";
}

export function runCmd(
  cmd: string,
  cwd: string | undefined,
  timeoutMs: number,
): Promise<{ ok: boolean; code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, { shell: true, cwd: cwd ?? process.cwd() });
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString();
      if (out.length < MAX_OUTPUT) {
        out += s;
        if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + "\n…[truncated]";
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      if (err.length < MAX_OUTPUT) {
        err += s;
        if (err.length > MAX_OUTPUT) err = err.slice(0, MAX_OUTPUT) + "\n…[truncated]";
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: code === 0 && !timedOut, code: code ?? 1, stdout: out, stderr: err, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, code: 1, stdout: "", stderr: String(e), timedOut: false });
    });
  });
}
