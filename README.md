# pi-essentials — pi core + 1 extension

**5 high-signal tools that make pi Better = Faster + Cheaper + Reliable + Durable.**

Replaces `pi-brain` (7 tools) + `smart-pi` (4 tools) = 11 tools → **5 tools**.

## Why

| Before | After | How |
|--------|-------|-----|
| 11 tools, 2 extensions, overlapping gates | 5 tools, 1 extension | Fuse overlapping tools |
| think + focus = 2 calls | `intent` = 1 call | Debate + working memory together. Saves 1 turn, focus rides compaction |
| remember + recall = 2 tools | `memo` action=remember\|recall | Unified TF-IDF memory, one KV-cache shape |
| verify + budget = 2 tools | `check` does both | PASS/FAIL + budget % in same result |
| intel re-scanned each turn | `intel` cached | 0 reads after first |
| plan ad-hoc | `plan` DAG | 3-10 tasks, refs/check/depends, blocked until deps done |

## Tools

| # | Tool | Params | Purpose |
|---|------|--------|---------|
| 1 | **intent** | `goal: string (≥1)`, `hypotheses: [string, string]` (each `risk: N`), `files?: string[]`, `acceptance?: string`, `conclusion?: string` | Picks lower-risk winner, sets `[pi-essentials focus]` that survives `compact/fork` via `pi-ess:deliberation` + `pi-ess:focus`. Replaces `think` + `focus`. |
| 2 | **plan** | `goal?: string`, `tasks?: string[]` (`title \| refs:src/a.ts check:bash: npm test depends:0,1`), `id?: string`, `done?: number[]` | Verifiable DAG 3-10 tasks. `refs` truncated 120ch, `depends` DAG validated, `check` per-task. The strict gate. |
| 3 | **memo** | `action: "remember" \| "recall"`, `cue?: string`, `summary?: string`, `detail?: string`, `query?: string`, `tags?: string[]`, `refs?: string[]`, `limit?: 1-20` | Unified TF-IDF memory via `pi-ess:memo` (MAX 100 LRU). `remember` dedups by cue, `recall` scores `cue×2 + summary×1 + detail×0.5` + tag boost. |
| 4 | **intel** | `refresh?: boolean`, `projectPath?: string` | Cached `lang/scripts/test/lint/build` profile. Auto-invalidates when `package.json` mtime > `scannedAt`. Call once per plan. |
| 5 | **check** | `command: string (≥1)`, `cwd?: string`, `timeout?: 1-600s` (default 120) | `spawn {shell:true}`, 64KB trunc, `PASS/FAIL/TIMEOUT` + `budget: 42% (clear/moderate/getting-full/CRITICAL)` in one call. |

**Coverage:** `88.61% stmts` (`state 99%`, `tools 89%`, `tool-helpers 76%`, `index 84%`) via `npm run test:coverage` (thresholds `45/40/35/45`).

## Flow (your happy/unhappy, now with 1 extension)

```
happy:   [memo recall?] -> intent -> plan -> intel -> batch exec (read xN -> edit xN) -> check PASS -> plan done -> memo remember -> commit
unhappy: 2 consecutive fails (check FAIL or write/edit/bash error) -> blocked until intent{goal:'debug ...'} -> continue -> plan done -> memo remember -> commit
```

Hooks enforced by code, not prompt:
- `write/edit` blocked until `intent` + `plan` done.
- After 2 fails, `write/edit/bash` blocked until `intent{goal:'debug ...'}`.
- Focus auto-injected into `session_before_compact` summary (zero steady-state cost).
- Budget warning only at >=90% (one line, not every turn).

## Usage

```bash
pi  # in your project
> intent {goal:"add auth", hypotheses:["jwt | cost:2 risk:2","session | cost:5 risk:5"], files:["src/routes"], acceptance:"check npm test PASS"}
> plan {goal:"add auth", tasks:["design token | refs:src/auth.ts","impl login | refs:src/auth.ts check:npx vitest run","wire middleware | depends:1"]}
> intel  # once, get testCmd
> # ... reads/edits ...
> check {command:"npx vitest run"}  # PASS + budget
> plan {id:"plan:...", done:[0,1,2]}
> memo {action:"remember", cue:"auth-jwt", summary:"jwt via jose, 15m expiry", tags:["auth"], refs:["src/auth.ts"]}
```

## Install

One-line install (recommended):

```bash
pi install git:github.com/Danu28/pi-essentials
```

Or add manually to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["git:github.com/Danu28/pi-essentials"]
}
```

Then remove `pi-brain` and `smart-pi` from packages. `pi-essentials` owns the strict flow.

Verify:

```bash
pi packages:list   # should show pi-essentials
pi tools:list      # should show intent, plan, memo, intel, check
```

## Security

- `check` uses `spawn({ shell: true })` **intentionally** — it must run arbitrary project commands (`npm test`, `cargo test`). No allowlist — pi is a coding agent; the sandbox is the OS/container, not the tool. Output capped 64KB + `[truncated]`, `SIGKILL` on timeout, `MAX_OUTPUT` prevents OOM.
- `intel` reads only `package.json`/`Cargo.toml`/`go.mod`/`pyproject.toml` + `stat`; no network, no secrets.

## Bundle size

```bash
npm run build && du -sh dist
# dist: ~120KB (index 10KB + state 5KB + tools 25KB + helpers 6KB + maps)
```
Run `npm run size` for a quick check.

## Design principles

- **KV-cache friendly**: all 5 tools registered upfront, no dynamic activation.
- **Branch-durable**: state via `appendEntry` + `globalThis` rebuild on `session_start`.
- **Minimal**: `state.ts` + `tool-helpers.ts` + `tools.ts` + `index.ts`, no vector DB, no 10k-line scoring.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
