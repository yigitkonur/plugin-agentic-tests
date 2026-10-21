# plugin-agentic-tests

A Claude Code plugin marketplace (`agentic-tests`) for agentic end-to-end test campaigns. One core plugin holds the engine and orchestration; four domain plugins hold the agents for web, HTTP APIs, MCP servers and mobile apps.

## Layout

```
.claude-plugin/marketplace.json   catalog of the five plugins (hand-written; versions = VERSION)
plugins/agentic-tests/            core plugin
  engine/run-agentic-tests/       the engine: CLI, schemas, role references, templates (portable skill format)
  skills/run, skills/setup        /agentic-tests:run and /agentic-tests:setup (manual-only)
  agents/                         GENERATED: planner, plan-auditor, verifier, diagnostician, ticket-writer,
                                  implementer, integrator, orchestrator
  runners/                        vendored docs of ego-browser, test-by-mcpc-cli, test-by-maestro (VENDORED.md)
  scripts/                        at.mjs (controller wrapper: batching, teardown, leftovers), pull-evidence.sh,
                                  schema-check.mjs, select-mac.sh, device-session.sh, maestro-env.sh, maestro-run.sh,
                                  android-setup.sh, ego-run.sh, timeout.sh
plugins/agentic-tests-web|api|mcp|mobile/agents/   GENERATED domain agents
plugins/agentic-tests-mobile/.mcp.json, scripts/maestro-mcp.sh   Maestro MCP server for mobile sessions
src/agents/*.md                   agent sources; the build-only key `plugins: [...]` lists target plugins
src/fragments/*.md                shared prompt fragments, inlined with {{> name}}; runner-*.md are the runner cards
scripts/vendor-runners.sh         refreshes plugins/agentic-tests/runners from ~/.agents/skills
scripts/build.mjs                 renders src into plugins/*/agents (--check in CI)
scripts/validate.mjs              manifests, versions, agent frontmatter, manual-only skills, helpers
tests/engine/                     the engine's node:test suite
fixtures/                         web app, API (OpenAPI), MCP server, SwiftUI app used for live checks
```

## Rules

- Edit agents in `src/`, never in `plugins/*/agents/`. Run `node scripts/build.mjs`, then `node scripts/validate.mjs`.
- Every skill stays `disable-model-invocation: true`. Agent descriptions stay short (at most 60 words): they cost tokens in every session where a plugin is enabled.
- Agents pin `model` and `effort` in frontmatter, set `omitClaudeMd: true`, and carry the safety rules in `src/fragments/limits.md` because they do not read the user's CLAUDE.md.
- Reviewers (verifier, plan-auditor) have no shell. They edit a draft; the controller validates and publishes it.
- The engine is the source of truth for records. Do not weaken its invariants (distinct worker handles, blind review, accepted is not PASS) to make a run pass. Fix the prompt or the orchestration instead.
- Helper scripts live once, in the core plugin's `scripts/`; handoffs give workers their path (`Helpers:`). Shell snippets that agents `source` must work in zsh and bash (no unmatched globs). Secrets travel by stdin or exported variables, never as literals on a command line.
- The runner cards (`src/fragments/runner-*.md`) are curated from the vendored docs. When `vendor-runners.sh` changes a vendored file, re-read the matching card.
- Bump `VERSION`, every `plugin.json` version and the marketplace versions together; `validate.mjs` fails on drift.

## Commands

```bash
node scripts/build.mjs && node scripts/validate.mjs        # after editing src/
node --test tests/engine/*.test.mjs                        # engine suite, about 5 minutes
claude plugin validate --strict .                          # marketplace manifest
claude --plugin-dir plugins/agentic-tests --plugin-dir plugins/agentic-tests-web   # local session with plugins
```

## Live checks

`scripts/live-project.sh <web|api|mcp|mobile|defect> <dir> [port]` builds a throwaway Git project from a fixture with its settings file; `scripts/run-stats.mjs <run.jsonl>` splits a headless run's tokens between the main session and workers. Run headless sessions with the account variables exported (`FIXTURE_USER`, `FIXTURE_PASSWORD`) and, for `--detach`, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.

Changes to agents, skills or the controller are verified by running a real campaign against a fixture, not by unit tests: copy `fixtures/web-app` to a temporary Git repo, start a headless session with the plugins, run `/agentic-tests:run`, and read the campaign's `status`, evidence and report.
