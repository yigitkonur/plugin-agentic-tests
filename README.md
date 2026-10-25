# agentic-tests

e2e testing for claude code and codex that doesn't grade its own homework.

you describe user journeys in plain words. a crew of model-pinned agents writes the test cases, boots (or attaches to) your app, plans and audits the run, drives the real thing (browser, http api, mcp server, ios / android app), and then *separate* reviewers judge the saved receipts: screenshots, snapshots, responses, junit. you get a verdict per case, an html report, and if you want it, a repair loop that diagnoses the bug, files an issue, fixes it in a worktree, merges and retests.

tl;dr: no vibes-based "looks good to me". every pass has evidence, and the agent that ran the test never gets to say it passed.

## install

you need [claude code](https://claude.com/claude-code) or [codex](https://github.com/openai/codex) 0.163+ (codex: [skip ahead](#codex)). the claude code one-liner (straight from `claude plugin install --help`):

```bash
claude plugin install agentic-tests-web --marketplace yigitkonur/plugin-agentic-tests
```

that adds the marketplace, installs the web plugin, and pulls the core plugin (`agentic-tests`) in as a dependency. swap `-web` for `-api`, `-mcp` or `-mobile`. restart claude code after installing so the agents load.

### option a: install and turn on in one project

```bash
claude plugin install agentic-tests-web --marketplace yigitkonur/plugin-agentic-tests --scope project
```

`--scope project` writes it into that project's `.claude/settings.json` (commit it so the team gets it). need more domains? add `claude plugin install agentic-tests-api@agentic-tests --scope project` etc.

### option b: install once everywhere, switch on per project (no token cost until you do)

every enabled plugin puts its agent names into the context of every session (core ~780 tokens, each domain ~225), so the tidy setup is: install all five once at user scope, leave them **disabled**, and enable them only in the projects you want to test.

```bash
claude plugin marketplace add yigitkonur/plugin-agentic-tests
for p in agentic-tests agentic-tests-web agentic-tests-api agentic-tests-mcp agentic-tests-mobile; do
  claude plugin install $p@agentic-tests && claude plugin disable $p@agentic-tests --scope user
done
```

(run that in bash or zsh on each machine you use, ssh boxes included.) then, in any project, whenever you want it:

```bash
claude plugin enable agentic-tests@agentic-tests --scope project       # the core, always
claude plugin enable agentic-tests-web@agentic-tests --scope project   # + the domains you need
claude plugin enable agentic-tests-api@agentic-tests --scope project
# off again:
claude plugin disable agentic-tests-web@agentic-tests --scope project
claude plugin disable agentic-tests@agentic-tests --scope project
```

it only flips `enabledPlugins` in that project's `.claude/settings.json`; start a new claude session there to pick it up. we tested this on a fresh project: before enabling, no `agentic-tests` commands; after, `/agentic-tests:run`, `:run-forked`, `:setup` plus 11 agents; after disabling, nothing.

lazy mode, drop these in your `~/.zshrc` or `~/.bashrc`:

```bash
agentic-on() {   # agentic-on web api   -> turn it on for the current project (core + the domains you name)
  claude plugin enable agentic-tests@agentic-tests --scope project || return
  local d; for d in "$@"; do claude plugin enable "agentic-tests-$d@agentic-tests" --scope project; done
}
agentic-off() {  # agentic-off web api  -> turn it back off for the current project
  local d; for d in "$@"; do claude plugin disable "agentic-tests-$d@agentic-tests" --scope project; done
  claude plugin disable agentic-tests@agentic-tests --scope project
}
```

updates: `claude plugin marketplace update agentic-tests`, then `claude plugin update <plugin>@agentic-tests` (finish or tear down a campaign first, see below). heads up: don't count on claude code's background auto-update for *disabled* plugins (we've seen it update them on one machine and leave them alone on another), so with option b check `claude plugin list` after a release and run these two when it's behind (a cron line works).

inside a claude code session the same things are `/plugin marketplace add yigitkonur/plugin-agentic-tests` and `/plugin install agentic-tests-web@agentic-tests`.

### codex

the same repo is a codex marketplace too. codex plugins can't ship agents, so on codex it's **one** plugin, `agentic-tests`, with every domain and every role inside: the run skill spawns a fresh codex subagent per task and hands it that role's text.

install once, globally off. codex has no `plugin enable/disable` command, so a tiny helper flips the config for you:

```bash
curl -fsSL https://raw.githubusercontent.com/yigitkonur/plugin-agentic-tests/main/scripts/codex-plugin-project.sh -o ~/.local/bin/codex-plugin-project.sh && chmod +x ~/.local/bin/codex-plugin-project.sh
codex plugin marketplace add yigitkonur/plugin-agentic-tests
codex plugin add agentic-tests@agentic-tests
codex-plugin-project.sh global-off agentic-tests@agentic-tests   # writes enabled = false into ~/.codex/config.toml
```

turn it on in one project (run it inside the project), then start a new codex session there:

```bash
codex-plugin-project.sh on agentic-tests@agentic-tests . --trust   # off again: codex-plugin-project.sh off agentic-tests@agentic-tests
```

that writes `enabled = true` into the project's `.codex/config.toml`. codex ignores that file unless the project is trusted, and `--trust` adds the trust line to `~/.codex/config.toml`. trusting a project also switches on its own hooks and rules, so only do it for repos you own. check with `codex plugin list`: `installed, enabled` inside the project, `installed, disabled` everywhere else.

use it: `$agentic-tests:setup`, then `$agentic-tests:run http://127.0.0.1:3000 "sign in; see three orders"`. same settings file, same engine, same report. what's different from claude code: workers run on your session's model (no per-role pins), there's no `--detach` / `run-forked`, and workers inherit your sandbox, so run campaigns with approvals off and network on.

updates: `codex plugin marketplace upgrade agentic-tests` moves the installed plugin to the new version; start a new session to load it.

## which plugins

| plugin | what you get | grab it when the project has |
|---|---|---|
| `agentic-tests` | the engine, `/agentic-tests:run`, `/agentic-tests:run-forked`, `/agentic-tests:setup`, plus planner, plan auditor, verifier, diagnostician, ticket writer, implementer, integrator, orchestrator | always (auto-installed as a dependency) |
| `agentic-tests-web` | author, environment operator and executor that drive a real browser through ego-browser | a web ui |
| `agentic-tests-api` | author, environment operator and executor using curl and openapi schema checks | an http api, or a backend like supabase |
| `agentic-tests-mcp` | author, environment operator and executor that drive mcpc 0.7 sessions | an mcp server |
| `agentic-tests-mobile` | author, environment operator and executor using maestro (cli + mcp) on ios simulators and android emulators, plus the web executor | a mobile app |

they stack: web app with an api → `web` + `api`. mcp server with a backend behind it → `mcp` + `api`. (codex: the one `agentic-tests` plugin covers all of it.)

## what you need on the machine

- node 22+ with npm, on the machine where claude code runs. the first `doctor` run installs the engine's two pinned deps (`yaml`, `ajv`) into `~/.cache/run-agentic-tests`, once.
- `timeout` (on a stock mac: `brew install coreutils`).
- the runner for each domain you test:
  - web: the [`ego-browser`](https://github.com/citrolabs/ego-lite) cli. it can run the browser on this machine (browser host `local`), or be an ssh wrapper to another machine (browser host = that ssh alias).
  - api: `curl`. that's it.
  - mcp: [`mcpc`](https://github.com/apify/mcpc) 0.7.x.
  - mobile: [maestro](https://maestro.dev) 2.10+ and java 17+ (found by itself under homebrew or `JAVA_HOME`), plus xcode for ios. for android, `scripts/android-setup.sh` installs the sdk, emulator and a system image on a mac for you.
- the repair loop needs a github remote and a logged-in `gh`.

no other skills required, fr. the docs for ego-browser, mcpc and maestro ship inside the plugin (`plugins/agentic-tests/runners/`, see `VENDORED.md`), and the bits each agent needs are baked straight into its prompt.

## use it

```text
/agentic-tests:setup
/agentic-tests:run http://127.0.0.1:3000 "sign in with the test account; see three orders; wrong password shows an error"
/agentic-tests:run http://127.0.0.1:3000 "checkout with a saved card" --track campaign
/agentic-tests:run mcp:mcp.json:app "tools match mcp-surface.json; create_order rejects qty 200" --detach
/agentic-tests:run app:com.example.app "add a note; empty note shows an error"
/agentic-tests:run --resume
```

`setup` sniffs out your domains, start command, port, test-account variable names, browser host and (for mobile) which machine runs the device, then writes `.claude/agentic-tests.local.md`. `run` reads it. journeys are split on `;`.

export your test-account variables (say `FIXTURE_USER`, `FIXTURE_PASSWORD`) in the shell *before* you start claude code. the engine fingerprints them into every target, and values never land in any file.

## how a run goes down

1. **authors** (one per journey) write the case: gherkin steps, a frozen list of expectations with a source for each, and a recipe the executor follows.
2. the **environment operator** starts your app as an engine-owned runtime, or attaches to the one you already have running, and proves the real client can reach it.
3. the **planner** maps journeys to cases, dependencies and shared resources. an independent **plan auditor** approves it or bounces precise fixes back.
4. **executors** run each case against the real interface and save the receipts.
5. **verifiers** judge only those receipts. critical stuff (auth, payments, data integrity) gets two blind reviewers. they have no shell, so they literally can't rerun, click or patch anything.
6. a **closure audit** checks the recorded proof, you get the report, and `teardown` cleans up after itself.
7. with `--track campaign`, a verified failure goes to a **diagnostician** → **ticket writer** (github issue) → **implementer** (worktree fix + pr) → **integrator** (merge, new target) → fresh retest. it asks before merging into your default branch.

the engine (`plugins/agentic-tests/engine`) enforces the rules mechanically, so they can't be "interpreted": every worker is a distinct agent, nobody reviews their own work, an accepted submission is not a pass, and evidence hashes get re-checked.

## models

| role | model | effort | tools |
|---|---|---|---|
| author (web, api, mcp, mobile) | sonnet | medium | shell, files |
| environment operator (web, api, mcp) | haiku | high | shell, files |
| environment operator (mobile) | sonnet | low | shell, files |
| executor (web, mcp, mobile) | sonnet | low | shell, files (+ maestro mcp) |
| executor (api) | haiku | high | shell, files |
| planner | sonnet | medium | shell, files |
| plan auditor | sonnet | high | files only |
| verifier | sonnet | medium | files only |
| diagnostician | sonnet | high | shell (read-only use), files |
| ticket writer | haiku | high | shell, files |
| implementer, integrator | sonnet | medium | full / shell, files |
| orchestrator (detached runs) | sonnet | high | agent, shell, files |

your main session only runs the controller loop. every agent sets `omitClaudeMd: true` and carries its own safety rules, so your personal claude.md isn't re-read by thirty workers.

## pick a mode

| situation | mode | why |
|---|---|---|
| a few journeys, you're watching, questions likely | `/agentic-tests:run …` (inline) | questions hit you directly; your session makes a handful of short tool calls per task |
| six-plus cases, or a repair loop you don't need to babysit | `--detach` | a sonnet orchestrator runs in the background; you get one report, and any questions show up as messages |
| you want to wait for it but keep your context clean | `/agentic-tests:run-forked …` | same orchestrator in a forked context; only the final report lands in your session. questions get collected into the report, since a waiting session can't answer |

## stuff to know (read this, it'll save you a headache)

- **don't edit the project mid-run.** the engine fingerprints tracked and untracked files and re-checks them at every step; an edit invalidates the proof. files your app writes on its own (a json or sqlite store, logs) get added to `.git/info/exclude` by the operator, so they don't count.
- **teardown + resume.** a finished run ends with `teardown`: it stops the campaign's dev servers, mcpc sessions and devices, removes its worktrees and the simulators / emulators it created, and keeps the report server up. after teardown `state` says `complete: false` (proof is judged against a live target) and shows the real result under `torn_down`. got interrupted? `/agentic-tests:run --resume` replaces the lost workers and re-checks the runtimes.
- **finish or tear down before `/plugin update`.** a runtime is tied to the installed version that started it; a different version gets `PROCESS_OWNERSHIP_MISMATCH` when it tries to stop or resume it.
- **install in each project.** copying another project's `.claude/settings.json` only *declares* the plugins; run the install command there.
- **remote browser host? ports are fixed.** with an ssh-wrapper ego-browser, the browser reaches your machine only on the ports the wrapper forwards (the reference wrapper: `3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000`). the run picks one set at the start (web port + every local backend) and never changes it. with `local`, none of this applies.
- **secrets stay out of files.** browser scripts get credentials as `ENV.NAME` through stdin (`ego-run.sh --env NAME`), never on a command line or on disk. mcpc stores a stdio server's resolved env in its session state while the run is live; `teardown` (or `at.mjs scrub`) blanks it. delete a campaign folder only *after* teardown, or you orphan its mcpc bridge.
- **permissions.** the agents run in the background and can't answer permission prompts. use a trusted project with `bypassPermissions`, or allow the tools `/agentic-tests:setup` lists.
- **headless + `--detach`.** `claude -p` kills background agents ten minutes after its last turn; set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`. interactive sessions are fine.
- **what it costs.** a three-journey run is roughly 1–4m tokens (mostly cached reads), around $1–5 at list price.
- **the repair loop never touches your checkout.** it merges on github and builds the new target from an isolated worktree under `.agentic-test-worktrees/` next to your project.

## mobile runner hosts

`select-mac.sh` probes this machine and every host in `~/.ssh/config` (alphabetically, read-only). ios runs here if this is a mac with xcode, maestro, java and a simulator, otherwise on the first mac that is. android runs on the first host that can run an emulator under maestro (`adb`, `emulator`, maestro, java 17+); if none can, it goes to the ios mac after `android-setup.sh` installs the sdk there. the operator creates its own `agentic-tests-…` simulator or avd, pins the emulator to a port it picked, never touches anyone else's devices, and deletes what it created at teardown. `maestro-run.sh` runs a flow on the right host and pulls every artifact back.

## what's actually been run

live-checked on macos (apple silicon) with real campaigns: web (ego-browser on a remote ssh host, sign-in included), http api (auth matrix, cors, openapi schema), mcp over stdio with a backend behind it, ios simulator, android emulator, the full repair loop (issue → pr → merge → retest), detached and forked runs, kill + resume, teardown. half-checked: with browser host `local`, the helper scripts (`ego-run.sh`, `pull-evidence.sh local`) ran on a machine whose ego-browser is local, but a full campaign that way hasn't. not run yet: mobile on a *remote* runner host.

## hacking on it

see `AGENTS.md`. agents (and the codex role copies in `plugins/agentic-tests/codex/roles/`) are generated from `src/`; after edits run `node scripts/build.mjs && node scripts/validate.mjs`. engine tests: `node --test tests/engine/*.test.mjs`. live checks: `scripts/live-project.sh <web|api|mcp|mobile|android|defect> <dir>` spins up a throwaway project from a fixture.

## license

mit. `plugins/agentic-tests/runners/ego-browser/` is docs from [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite), mit, copyright citrolabs (full text in `plugins/agentic-tests/runners/LICENSE-ego-lite`).
