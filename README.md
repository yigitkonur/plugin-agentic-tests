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

Requirements: Node.js 22+ with npm (the first `doctor` run installs the engine's two locked dependencies, once), and `timeout` (`brew install coreutils` on a stock Mac). The runner programs: the `ego-browser` CLI for web, `mcpc` 0.7.x for MCP, Maestro 2.10+ with Java 17+ for mobile (found automatically under Homebrew or `JAVA_HOME`), Xcode for iOS. For Android, `android-setup.sh` installs the SDK and a system image on a Mac by itself. The repair loop needs the project's GitHub remote and an authenticated `gh`.

**No other skills are needed.** The runner documentation (`ego-browser`, `test-by-mcpc-cli`, `test-by-maestro`) is vendored in `plugins/agentic-tests/runners/` (see `VENDORED.md`) and the part each agent needs is baked into its prompt. Refresh it with `scripts/vendor-runners.sh` after the source skills change.

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

### Things to know

- **Export the test-account variables before starting Claude Code.** The engine hashes the declared account variables into each target's configuration digest, so a session started without them reports `SOURCE_CHANGED` for a target that was started with them.
- **Detached runs in headless mode.** `claude -p` stops background agents ten minutes after its last turn. For `--detach` in a headless run, set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`. Interactive sessions are not affected.
- **Do not edit the project while a campaign runs.** The engine fingerprints the project's files (tracked and untracked) and re-checks them at every step; an edit invalidates the proof. Files the service itself writes (a JSON or SQLite store) are added to `.git/info/exclude` by the environment operator, so they do not count.
- **Teardown and resume.** A finished run ends with `at.mjs teardown`: it stops the campaign's own dev servers, mcpc sessions and devices, removes successor worktrees and the simulators or emulators it created, and keeps the report server running. The engine judges proof against a READY runtime, so after teardown `complete` reads false; `state` then shows the result recorded at teardown under `torn_down`. An interrupted run is continued with `/agentic-tests:run --resume`: it interrupts the lost workers, replaces them, and re-checks the runtimes.
- **Forwarded ports.** The browser host reaches this machine only on fifteen ports (`3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000`). The run fixes one set at the start, covering the web port and every local backend, and never changes it.
- **MCP server secrets.** A stdio server does not inherit your environment; the operator passes the variables it reads as `${NAME}` references in a derived config, and mcpc stores the resolved values in its session state while the campaign runs. `teardown` (or `at.mjs scrub`) blanks them in the campaign's `owner.json`; the campaign folder is mode 700 and git-ignored. Delete a campaign folder only after `teardown`: deleting it first orphans its mcpc bridge.
- **Secrets reach the browser through stdin.** `scripts/ego-run.sh --env NAME` gives a script `ENV.NAME` on the browser host; the value is never on a command line, in a file or in a transcript.
- **Permissions.** The agents run in the background and cannot answer permission prompts. Use a trusted project with `bypassPermissions`, or allow the tools they need (`/agentic-tests:setup` prints the rules).
- **Usage limits.** A campaign spends roughly 1 to 4 million tokens (mostly cached reads), about 1.5 to 4 dollars of list price for a three-journey run. Detached mode keeps your own session at a few thousand tokens; inline mode pays about one short tool call per task in your session.
- **The repair loop never touches your checkout.** The integrator merges on GitHub; the new target is built from an isolated worktree at the merge commit under `.agentic-test-worktrees/` next to the project.

## Mobile runner hosts

`select-mac.sh` probes this machine and every host in `~/.ssh/config` (alphabetically, read-only). iOS runs on this machine when it is a Mac with Xcode, Maestro, Java and a simulator, otherwise on the first such Mac. Android runs on the first host that can run an emulator under Maestro (`adb`, `emulator`, Maestro, Java 17+); when none can, on the iOS Mac after `android-setup.sh` has installed the SDK there. The environment operator creates its own `agentic-tests-…` simulator or AVD, pins the emulator to a port it chose, never addresses another device, and removes what it created at teardown. `maestro-run.sh` runs a flow on the right host and brings every artifact back.

## Development

See `AGENTS.md`. Agents are generated from `src/`; run `node scripts/build.mjs && node scripts/validate.mjs` after editing. The engine suite is `node --test tests/engine/*.test.mjs`.
