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

1. **intent** — `intent{goal, hypotheses:[A,B], files?, acceptance?}` — picks winner (risk-based), sets focus line that survives `compact/fork` via `pi-ess:deliberation` + `pi-ess:focus` entries. Replaces `think` + `focus`.
2. **plan** — `plan{goal, tasks[3-10], id?, done?}` — verifiable DAG. `title | refs:src/a.ts check:bash: npm test depends:0,1`. The strict gate.
3. **memo** — `memo{action:remember|recall, cue/summary/tags/refs | query/tags/limit}` — durable memory via `pi-ess:memo` entries. One tool, one index.
4. **intel** — `intel{refresh?, projectPath?}` — cached project profile (lang, scripts, test/lint/build). Call once, free after.
5. **check** — `check{command, cwd?, timeout?}` — `PASS/FAIL/TIMEOUT` + `budget: 42% (moderate)` in one call. Never claim success without it.

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

## Design principles

- **KV-cache friendly**: all 5 tools registered upfront, no dynamic activation.
- **Branch-durable**: state via `appendEntry` + `globalThis` rebuild on `session_start`.
- **Minimal**: one file per concern (`state.ts` + `tools.ts` + `index.ts`), no vector DB, no 10k-line scoring.
