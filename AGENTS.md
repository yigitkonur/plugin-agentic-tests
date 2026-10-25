# plugin-agentic-tests

A Claude Code and Codex plugin marketplace (`agentic-tests`) for agentic end-to-end test campaigns. On Claude Code, one core plugin holds the engine and orchestration and four domain plugins hold the agents for web, HTTP APIs, MCP servers and mobile apps. Codex plugins cannot ship agents, so on Codex the core plugin alone covers every domain: its run skill spawns Codex subagents that read generated role files.

## Layout

```
.claude-plugin/marketplace.json   catalog of the five plugins (hand-written; each entry's version = its plugin.json)
.agents/plugins/marketplace.json  Codex catalog: the core plugin only
plugins/agentic-tests/            core plugin
  .codex-plugin/plugin.json       Codex manifest (version = the Claude manifest's; skills: ./codex/skills/)
  codex/skills/run, codex/skills/setup   Codex adapters: follow skills/run|setup/SKILL.md with Codex substitutions
  codex/roles/                    GENERATED: every role except the orchestrator, body only, for Codex workers
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
- The five plugins are versioned and released one by one by the kit (multi-plugin mode: a commit counts for a plugin only when it touches that plugin's folder). A change to the core plugin that a domain plugin needs must also touch a file in that domain plugin's folder, or the domain plugin gets no release.
- The Claude skills are the single source of the run and setup procedures. The Codex skills only map Claude terms to Codex (`spawn_agent`, `wait_agent`, `send_input`, `close_agent`); change a procedure in `skills/`, and the Codex table only when a Claude-specific term is added.

<!-- kit:agents:start -->
## Releases, versions and installs (shared by every plugin repo)

- **Never bump a version by hand.** `.github/workflows/release.yml` runs after `ci` is green on `main`. `scripts/kit/release.py` reads the conventional-commit subjects since the last release tag (`feat` is a minor, `fix`/`perf`/unprefixed a patch, `type!:` or a BREAKING CHANGE line a major, a minor while the version is 0.x; docs, ci, chore, test, style, build and refactor release nothing) and counts only commits that touch shipped files (in a several-plugin repo, a commit counts for a plugin when it touches that plugin's folder). It writes every manifest, the marketplace entries and CHANGELOG.md, commits `chore(release): vX [skip ci]`, tags `vX` and `<plugin>--vX` (several plugins: `<plugin>--vX` only) and publishes the GitHub release. `python3 scripts/kit/release.py` with no flags prints what it would do; Actions > release > Run workflow forces a level or a dry run.
- **One version source: the manifests** (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, the marketplace entry). Never a constant in code; read the manifest at runtime.
- Installed copies update only when the version string changes, so a change users should get must reach `main` as a releasing commit type (`feat`, `fix`, `perf`, or `!`).
- **Install policy:** installed globally and off (`"defaultEnabled": false`), switched on per project with `plugin on <name>`. Never document a project-scope install as the way in.
- `scripts/kit/*`, `scripts/kit.sha256`, `.github/workflows/release.yml`, the `kit:manifests` job in `ci.yml` and the blocks between `kit:` markers in README.md and AGENTS.md are copies from [yigitkonur/plugin-kit](https://github.com/yigitkonur/plugin-kit). Change them there and run its `sync.sh`; `scripts/kit/check-manifests.py` fails CI on a local edit.
- Before pushing: `python3 scripts/kit/check-manifests.py --validate`, `python3 scripts/kit/secret-scan.py --tree`, `python3 scripts/kit/check-links.py`, then this repo's own checks.
<!-- kit:agents:end -->

## Commands

```bash
node scripts/build.mjs && node scripts/validate.mjs        # after editing src/
node --test tests/engine/*.test.mjs                        # engine suite, about 5 minutes
claude plugin validate --strict .                          # marketplace manifest
claude --plugin-dir plugins/agentic-tests --plugin-dir plugins/agentic-tests-web   # local session with plugins
codex plugin marketplace add "$PWD" && codex plugin add agentic-tests@agentic-tests # Codex from this checkout
```

## Live checks

`scripts/live-project.sh <web|api|mcp|mobile|android|defect> <dir> [port]` (set `BROWSER_HOST=<ssh alias>` when ego-browser here is an ssh wrapper; the author's machine uses `BROWSER_HOST=tugce`) builds a throwaway Git project from a fixture with its settings file; `scripts/run-stats.mjs <run.jsonl>` splits a headless run's tokens between the main session and workers. Run headless sessions with the account variables exported (`FIXTURE_USER`, `FIXTURE_PASSWORD`) and, for `--detach`, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.

Changes to agents, skills or the controller are verified by running a real campaign against a fixture, not by unit tests: copy `fixtures/web-app` to a temporary Git repo, start a headless session with the plugins, run `/agentic-tests:run`, and read the campaign's `status`, evidence and report.
