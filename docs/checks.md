# Checks — OS-Aware, Timeout-Bounded, Read-Preferred

> **Goal:** Zero wasted LLM calls on `ls is not recognized` / 2-minute `find` hangs. One failure = 1 LLM call.

## 1. Prefer `read` over `bash` for file verification

`bash cat/type/findstr` is fragile cross-platform. `read` is OS-agnostic and cheap.

| Need | Don't (bash) | Do (read) |
|------|--------------|-----------|
| File exists? | `bash: ls login.html` / `dir login.html` | `read login.html limit:5` — exists if content returns |
| Has `<form`? | `bash: cat login.html \| grep -c "<form"` | `read login.html` then string search |
| Line count? | `bash: findstr /R /N "^" file \| find /c` (scans 1M lines, 2m) | `read` with truncation or `wc -l` with `timeout:10` |

**Rule:** Use `bash` only for `intel` test/lint/build commands (`npm test`, `cargo test`). For file checks, use `read`.

## 2. OS-Aware check templates

`intel` tells you the OS is Windows (`cmd.exe`) not `bash` on some hosts. The `check` tool spawns `{shell:true}` — so `ls`/`cat` fails on Windows.

**Always quote paths with spaces:** `"New folder/login.html"` not `New folder/login.html`.

| Intent | Linux / git-bash | Windows `cmd.exe` | Recommended (cross-platform) |
|--------|------------------|-------------------|------------------------------|
| Exists | `ls -lh "login.html"` | `dir "login.html"` | `read` or `ls -1 "login.html"` with fallback |
| Content head | `cat "login.html" \| head -n 5` | `type "login.html"` | `read` |
| Search | `grep -c "<form" "login.html"` | `findstr "<form" "login.html"` | `read` + search |
| Count lines | `wc -l "login.html"` | `find /c /v "" "login.html"` (slow) | `read` |

**Anti-pattern (from session):**
```bash
# SLOW 2m02s, truncates 1M lines
findstr /R /N "^" login.html | find /c /v ""
# FAIL on Windows git-bash vs cmd confusion
ls login.html && cat login.html | head
```

**Good:**
```bash
# Fast, bounded
dir "login.html"                          # Windows, 1s
ls -1 "login.html"                        # Linux, 1s
# Or better: read login.html (no shell)
```

## 3. Always bound `bash` with `timeout`

Every `bash`/`check` must have `timeout: 5-30`. No unbounded `find`.

```js
// file existence: 10s max
check({ command: 'dir "login.html"', timeout: 10 })
check({ command: 'ls -1 "login.html"', timeout: 10 })

// test suite: 30-60s
check({ command: 'npm test', timeout: 60 })
check({ command: 'vitest run', timeout: 30 })

// NEVER
check({ command: 'findstr /R /N "^" login.html | find /c /v ""' }) // no timeout, scans all
```

**Harness defaults:** `check` default is now `30s` (was `120s`). If you need longer, pass explicit `timeout: 60`. The tool caps at `600s` and kills with `SIGKILL` on timeout, 64KB output cap.

## 4. Plan `check:` syntax — lightweight gates

Keep `plan` checks <1s. Heavy checks belong in `check` step with timeout, not in plan string.

```js
// Good — plan gate is stat
plan({ tasks: [
  "design HTML structure | refs:login.html check:bash: dir \"login.html\"",
  "implement form validation | refs:login.html check:bash: findstr \"<form\" \"login.html\"",
  "responsive polish | refs:login.html check:bash: findstr \"viewport\" \"login.html\""
]})

// Bad — plan gate does heavy scan
plan({ tasks: ["verify | refs:login.html check:bash: findstr /R /N \"^\" login.html | find /c /v \"\""] })
```

## 5. Pre-flight lint (saves 1 LLM call per failure)

Before `intent`/`plan` submit, lint locally:

* `intent`: goal verb + ≥10ch, `| risk:N` on both hypotheses, `files[]`, `acceptance`
* `plan`: 3-10 tasks, each `refs:`, at least one `check:`, no `depends` out of range
* `check`: command is OS-compatible, quoted paths, `timeout` set

If lint warns (`⚠️ input lint` / `✂️ truncated`), fix input **before** editing — don't burn a call on a known fail.

## 6. Checklist — Before `write/edit/bash`

1. `intel` once — get `testCmd` and OS
2. `read` to verify files, not `bash cat`
3. `bash`/`check` always with `timeout: 10` (file) or `timeout: 30-60` (test)
4. Quote paths with spaces
5. No lint warnings in `intent`/`plan` response

See `prompt-templates.md` and `tool-helpers.ts:lintIntent/lintPlan` for exact rules.
