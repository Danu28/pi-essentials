# Changelog

All notable changes to `pi-essentials` will be documented here. Follows [SemVer](https://semver.org/).

## [1.3.1] - 2026-09-25

### Fixed
- Audit fixes (6): coverage thresholds `45/40/35/45` → `80/70/75/80` (was too permissive), added branch tests for `index.ts` context/session_before_compact + `tool-helpers` lint (overall 77% → 78% branches, 89.8% stmts)
- Removed stale `overrides` (`esbuild`/`vite` vuln pins) — `npm audit` 0 vulns verified, reduces install friction
- Bundle drift: README `120KB` → `132KB` (`npm run build && du -sh dist`)
- TS lag: added `ts-next` CI job (`typescript@next` + `typecheck`, `continue-on-error`) to catch v7 breaks early; `typescript ^5` pinned
- Dist committed: clarified `.gitignore` comment (`package.json files:[dist]` + `npm pack --dry-run`), fixed CI `npm ci || npm install` → `npm ci` (lockfile drifts now fail fast)
- Nits: `eslint` `allowDefaultProject` scoped to `[src/*.test.ts, eslint.config.js, vitest.config.ts]`, `INTENT_VERBS as const` + `IntentVerb` type, `VAGUE_HYPOTHESIS_PATTERNS` word-boundary fix (`\bstuff\b|\bthing\b` via `VAGUE_WORD_RE` prevents `something` false-positive)

## [1.3.0] - 2026-09-25

### Added
- Input quality lint: `intent` warns if goal <10ch, no verb, missing `acceptance`/`files`, vague hypotheses (`fix bug`/`maybe`), missing `risk:` — via `tool-helpers.ts:lintIntent`; `plan` warns if no `refs`/`check` overall or per-task — via `lintPlan`
- Truncation surfacing: `intent` now shows `✂️ truncated: goal 250→200 chars` + per-hypothesis, `plan` shows goal truncation; `state.ts:truncate` unchanged but surfaced in tool response
- `docs/prompt-templates.md` — 3 good/bad examples for `intent` (jwt `| risk:2` vs `maybe jwt`) and `plan` anti-patterns, plus memo recall recency tips
- Memo recency decay: `scoreEpisode` boosted `detail` 0.5→0.75 and adds recency boost (<1d +30%, <7d +15%, <30d +5%) — addresses synonym gap via explicit `cue`/`tags` guidance

### Changed
- `README.md` tools table: `memo` detail weight 0.5→0.75 + recency note; added Prompt templates section linking to `docs/prompt-templates.md`
- `tools.ts` intent/plan responses now include `⚠️ input lint` and `✂️ truncated` blocks + `details.lintWarnings`

## [1.2.0] - 2026-09-25

### Added
- `src/index.test.ts` (12 tests) — hooks coverage: `before_agent_start`, `session_start`, `tool_call` blocking, debug gate, `session_before_compact`, `context` budget, `essentials` command
- `src/tool-helpers.ts` — extracted `parseRisk`, `validateDepends`, `parseTask`, `slugify`, `runCmd`, `MAX_TASKS` from `tools.ts` (452L → ~345L)
- API reference tables in `README.md` for all 5 tools
- `CHANGELOG.md`

### Changed
- Coverage thresholds `15/25/12/15` → `45/40/35/45`; actual coverage `80.88% → 88.61%` stmts (state 99%, tools 89%)
- `vitest` `5.0.1 → 5.0.2`, `@vitest/coverage-v8` `5.0.1 → 5.0.2`
- `@earendil-works/pi-coding-agent/tui` `0.85 → 0.87.1`
- `vitest.config.ts` now includes `index.ts` + `tool-helpers.ts` in coverage
- CI: Node matrix `20,22`, added `test:coverage` + threshold gate, `.vitest/` ignored

### Fixed
- `context` budget warning: `newMsgs.indexOf(last)` → `msgs.indexOf(last)` (was writing to `newMsgs[-1]`)
- `tools.ts` empty block lint (stale cache fallthrough) now has comment
- `index.test.ts` `Function` type → `(...args: unknown[]) => unknown`

## [1.1.0] - 2026-09-24

### Added
- Self-guiding `before_agent_start` — injects `promptGuidelines` + `pi-essentials` section so agent never hits a blind block
- `intel` stale-cache auto-invalidation via `package.json` mtime

### Fixed
- `tool_call` blocking now returns `{block:true, reason}` not `{message}` — matches pi API

## [1.0.0] - 2026-09-24

### Added
- Initial `pi-essentials` `1.0.0` — pi core + 1 extension, 5 tools: `intent`/`plan`/`memo`/`intel`/`check`
- Replaces `pi-brain` (7) + `smart-pi` (4) = 11 → 5
- `state.ts` durable memory + `tools.ts` + `index.ts` hooks
- CI `typecheck → build → lint → test`
