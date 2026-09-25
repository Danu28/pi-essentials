# Changelog

All notable changes to `pi-essentials` will be documented here. Follows [SemVer](https://semver.org/).

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
