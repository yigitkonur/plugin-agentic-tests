# agentic-tests

Agentic end-to-end testing for Claude Code. You describe user journeys; model-pinned expert agents author the cases, start or attach the app, plan and audit, drive the real interface (browser, HTTP, MCP, mobile device), and independent reviewers judge the saved evidence. You get verdicts per case, an HTML report, and, on request, a repair loop that diagnoses, files an issue, fixes in a worktree, merges and retests.

## Plugins

| Plugin | What it adds | Install when the project has |
|---|---|---|
| `agentic-tests` | Engine, `/agentic-tests:run`, `/agentic-tests:run-forked`, `/agentic-tests:setup`, planner, plan auditor, verifier, diagnostician, ticket writer, implementer, integrator, orchestrator | always |
| `agentic-tests-web` | author, environment operator and executor driving a real browser through ego-browser | a web UI |
| `agentic-tests-api` | author, environment operator and executor using curl and OpenAPI schema checks | an HTTP API or a backend such as Supabase |
| `agentic-tests-mcp` | author, environment operator and executor driving mcpc 0.7 sessions | an MCP server |
| `agentic-tests-mobile` | author, environment operator and executor using Maestro (CLI and MCP) on iOS simulators and Android emulators, plus the web executor | a mobile app |

Domain plugins co-install: a web app with an API gets `web` and `api`; an MCP server with a backend gets `mcp` and `api`.

## Install

```text
/plugin marketplace add yigitkonur/plugin-agentic-tests
/plugin install agentic-tests@agentic-tests --scope project
/plugin install agentic-tests-web@agentic-tests --scope project
```

Install per project (`--scope project`): agent descriptions cost a few hundred tokens in every session where a plugin is enabled, so enable only the domains a project needs.

Requirements: Node.js 22+. Web: the `ego-browser` skill and CLI. MCP: `mcpc` 0.7.x. Mobile: Maestro 2.10+, Java 17+ (found automatically under Homebrew or `JAVA_HOME`), Xcode for iOS, an Android SDK for Android. The repair loop needs the project's GitHub remote and an authenticated `gh`.

## Use

```text
/agentic-tests:setup
/agentic-tests:run http://127.0.0.1:3000 "sign in with the test account; see three orders; wrong password shows an error"
/agentic-tests:run http://127.0.0.1:3000 "checkout with a saved card" --track campaign
/agentic-tests:run mcp:mcp.json:app "tools match mcp-surface.json; create_order rejects qty 200" --detach
/agentic-tests:run app:com.example.app "add a note; empty note shows an error"
```

`setup` detects domains, start command, ports, account variable names and (for mobile) the runner host, and writes `.claude/agentic-tests.local.md`. `run` reads it.

## How a campaign runs

1. **Authors** (one per journey) write each case: Gherkin steps, a frozen expectation manifest with sources, and a recipe for the executor.
2. The **environment operator** starts the app as an engine-owned runtime, or attaches to one that is already running, and proves the real client reaches it.
3. The **planner** maps journeys to cases, dependencies and shared-resource claims; an independent **plan auditor** approves or sends precise corrections back to the authors or planner.
4. **Executors** run each case through the real interface and save evidence: screenshots, snapshots, console output, HTTP exchanges, MCP results, JUnit reports.
5. **Verifiers** (two blind ones for auth, payment and integrity expectations) judge the saved evidence. They have no shell: they cannot rerun, click or repair anything.
6. A **closure audit** checks the recorded proof; the run ends with a report.
7. With `--track campaign`, verified failures go to a **diagnostician**, then a **ticket writer** (GitHub issue), an **implementer** (worktree fix and PR), an **integrator** (merge, new target) and a fresh retest.

The engine (`plugins/agentic-tests/engine`) enforces the rules mechanically: every worker is a distinct agent, an author never executes its own case, a verifier never reviews its own run, accepted submissions are not passes, and evidence hashes are checked.

## Models

| Role | Model | Effort | Tools |
|---|---|---|---|
| author (web, api, mcp, mobile) | Sonnet | medium | shell, files |
| environment operator (web, api, mcp) | Haiku | high | shell, files |
| environment operator (mobile) | Sonnet | low | shell, files |
| executor (web, mcp, mobile) | Sonnet | low | shell, files (+ Maestro MCP) |
| executor (api) | Haiku | high | shell, files |
| planner | Sonnet | medium | shell, files |
| plan auditor | Sonnet | high | files only |
| verifier | Sonnet | medium | files only |
| diagnostician | Sonnet | high | shell (read-only use), files |
| ticket writer | Haiku | high | shell, files |
| implementer, integrator | Sonnet | medium | full / shell, files |
| orchestrator (detached runs) | Sonnet | high | Agent, shell, files |

Your main session's model only runs the controller loop. Every agent sets `omitClaudeMd: true` and carries its own safety rules, so your global instructions are not re-read by every worker.

## Choosing how to run

| Situation | Mode | Why |
|---|---|---|
| A few journeys, you are watching, questions likely | `/agentic-tests:run …` (inline) | Questions reach you directly; about three short tool calls per task in your session |
| A suite of six or more cases, or a repair loop you do not need to steer | `--detach` | A Sonnet orchestrator runs in the background; your session receives one report, and questions arrive as messages |
| You want to wait for the result but keep your context clean | `/agentic-tests:run-forked …` | The same Sonnet orchestrator runs in a forked context; your turn waits and only the final report enters your context. Questions are collected into the report, because a waiting session cannot answer them |

## Mobile runner hosts

`select-mac.sh` probes this machine and every host in `~/.ssh/config` (alphabetically, read-only). iOS runs on this machine when it is a Mac with Xcode, Maestro, Java and a simulator, otherwise on the first such Mac; Android runs on the first host with `adb` and Maestro. The environment operator creates its own `agentic-tests-…` simulator and never touches other devices.

## Development

See `AGENTS.md`. Agents are generated from `src/`; run `node scripts/build.mjs && node scripts/validate.mjs` after editing. The engine suite is `node --test tests/engine/*.test.mjs`.
