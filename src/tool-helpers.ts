import { truncate } from "./state.js";
import { spawn } from "node:child_process";

export const MAX_TASKS = 10;
export const MAX_OUTPUT = 64 * 1024;

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
