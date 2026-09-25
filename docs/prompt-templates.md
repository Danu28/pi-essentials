# Prompt Templates — Better Input Beats Better Models

> **Principle:** Structured, specific inputs outperform model upgrades. This guide shows good vs bad inputs for `intent` and `plan`. Lint warnings now fire when you get it wrong.

## intent — Good vs Bad

### 1. Goal + Hypotheses + Risk

**Bad — vague, no verb, no risk:**
```js
intent({
  goal: "auth",
  hypotheses: ["maybe jwt", "session maybe"]
})
// ⚠️ input lint:
// - goal short (<10 chars) — be specific: 'add JWT auth to /api/login' not 'auth'
// - goal has no verb — start with action: add/fix/implement/create
// - missing acceptance
// - missing files
// - hypothesis 1 missing risk — add " | risk:2"
// - hypothesis 2 vague (<10 chars title): "maybe" — e.g. "jwt via jose, 15m expiry | risk:2"
```

**Good — specific, verb-led, mechanism + risk:**
```js
intent({
  goal: "add JWT auth to /api/login with 15m expiry",
  hypotheses: [
    "jwt via jose, 15m expiry + refresh rotation | risk:2",
    "session store redis, server-side revoke | risk:5"
  ],
  files: ["src/auth.ts", "src/routes/login.ts"],
  acceptance: "check npm test PASS, POST /api/login returns 200 + set-cookie"
})
// => Winner: jwt via jose, 15m expiry + refresh rotation (lower risk)
// No lint warnings. Focus survives compaction.
```

**Why better:** The good input forces a *comparable* trade-off (stateless JWT vs stateful session) with quantified risk. The model doesn't have to guess.

### 2. Missing Acceptance / Files (soft-required)

**Bad — passes schema but weak signal:**
```js
intent({
  goal: "fix login bug",
  hypotheses: ["quick patch | risk:2", "full rewrite | risk:5"]
})
// ⚠️ input lint:
// - goal generic ("fix bug") — include mechanism + risk
// - missing acceptance — define PASS condition
// - missing files — list 1-3 refs
// - truncation: none, but lint helps
```

**Good:**
```js
intent({
  goal: "fix login 401 when email has + alias (normalize before lookup)",
  hypotheses: [
    "normalize email lower+trim before DB lookup | risk:2",
    "migrate DB to CITEXT collation | risk:7"
  ],
  files: ["src/auth.ts"],
  acceptance: "check npm test PASS — reproduction test for + alias passes"
})
```

### 3. Truncation Surfacing

Inputs truncate: `goal→200ch`, `hypothesis→300ch`, `conclusion→300ch`.

**Bad — silently lost nuance (before fix):**
```js
intent({ goal: "a".repeat(250), hypotheses: [...] }) // silently cut to 200
```

**Now — explicit warning:**
```
✂️ truncated:
- goal 250→200 chars (…truncated)
- hypothesis 1 310→300 chars (…truncated)
```
> Tip: Keep `goal` < 180 chars, hypotheses < 280 chars. Put detail in `files[]` and `acceptance`.

---

## plan — Good vs Bad

`plan` parses `title | refs:src/a.ts check:bash: npm test depends:0,1`

### 1. Missing refs / check (now linted)

**Bad:**
```js
plan({
  goal: "ship feature",
  tasks: ["do thing", "do other thing", "more things"]
})
// ⚠️ plan lint:
// - plan has no refs — every task should have refs:src/a.ts
// - plan has no check — at least one task should have check:npm test
// - task 1 "do thing" missing refs — add | refs:src/a.ts
// - task 1 "do thing" missing check — add | check:npm test
```

**Good:**
```js
plan({
  goal: "ship JWT auth",
  tasks: [
    "design token shape | refs:src/auth.ts",
    "implement login | refs:src/auth.ts,src/routes/login.ts check:npx vitest run",
    "wire middleware | refs:src/middleware/auth.ts depends:0,1 check:npx vitest run"
  ]
})
// No lint warnings. DAG validated, PASS gate present.
```

### 2. Vague Titles

**Bad:** `"fix stuff | refs:src/a.ts"`

**Good:** `"normalize email + alias before lookup | refs:src/auth.ts check:npx vitest run"`

> Rules: Title is the *intent* of the task. Keep it < 120ch, truncated after. Include *what* not *where* — refs handles where.

### 3. Depends DAG Anti-Patterns

**Bad:**
```js
plan({ tasks: ["a | refs:src/a.ts depends:5", "b", "c"] }) // out of range
// Invalid depends for task 1: depends index 5 out of range [0,2]
```

**Good:**
```js
plan({
  tasks: [
    "a | refs:src/a.ts",
    "b | refs:src/b.ts depends:0",
    "c | refs:src/c.ts depends:0,1 check:npm test"
  ]
})
```

---

## memo — Recall Tips (keyword + recency)

Scoring is `cue×2 + summary×1 + detail×0.75` + tag boost + recency ( <1d: +30%, <7d: +15%, <30d: +5%).

**Bad recall:** `memo {action:"recall", query:"stuff"}` → vague, no hits.
**Good recall:**
```js
memo({ action:"recall", query:"auth jwt", tags:["auth"], limit:5 })
// cue match "auth jwt" scores 2 per token, recent memos rank higher
```
> For synonyms (`auth` vs `login`), store *both* terms in `cue`/`tags`: `cue:"auth-login jwt"` or `tags:["auth","login"]`. No embedding — keep it explicit. Detail field now weighted 0.75 (was 0.5) so put nuance there.

---

## Checklist — Before write/edit/bash

1. `intent` with verb-led goal ≥10ch, 2 hypotheses with `| risk:N`, `files[]`, `acceptance`
2. `plan` with 3-10 tasks, each `| refs:` and at least one `| check:`
3. `intel` once for correct `testCmd` + OS (Windows `cmd.exe` vs `bash` — `ls`/`cat` fails on `cmd`)
4. Prefer `read` over `bash` for file checks; if `bash`/`check`, always `timeout:10` (file stat) or `timeout:30-60` (tests), quote paths with spaces — see `docs/checks.md`
5. No lint/truncation warnings in `intent`/`plan` response — if you see `⚠️ input lint` or `✂️ truncated` or `heavy check`, fix input before editing.

See `README.md` happy flow and `src/tool-helpers.ts:lintIntent/lintPlan` for exact rules.
