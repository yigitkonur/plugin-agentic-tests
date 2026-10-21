---
name: run
description: Run an agentic end-to-end test campaign on web, HTTP API, MCP or mobile targets with model-pinned expert agents, blind evidence review and an HTML report.
argument-hint: '<url | mcp:<server> | app:<bundle-id>> "journey one; journey two" [--review 1|2] [--track smoke|campaign] [--detach] [--resume]'
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Agent, SendMessage, AskUserQuestion
---

# Run an agentic test campaign

You are the campaign controller. Plugin agents do every substantive job: authoring cases, starting the runtime, planning, auditing, executing, verifying, diagnosing and fixing. You allocate their tasks with the controller script, launch the matching agent with its handoff path, bind the agent ID, and read its one-line result. Evidence, drafts and worker transcripts never enter your context; the engine's state is your only view.

Controller: `node "${CLAUDE_PLUGIN_ROOT}/scripts/at.mjs" <command> …`, which prints one JSON line per command. Below it is written `$AT`; always type the full `node "…/at.mjs"` form, because shell state does not persist between calls and zsh does not split a variable into words.

Arguments: `$ARGUMENTS`

## 0. Resume

Use this when the arguments contain `--resume`, or `$AT state` shows tasks that were running when an earlier session ended.

1. Campaign: the path given, else the newest folder under `<project>/agentic-tests/`. Read its `02-decisions.md` and reuse those values (target, forward ports, browser host, review policy, accounts, track).
2. `$AT state --campaign "<campaign>"`. If it has `torn_down` with `complete_before: true`, the campaign already finished and was torn down (the engine judges proof against a READY runtime, so `complete` reads false afterwards): report `outcome_before` and the report path, and stop unless the user wants a new run. Otherwise every task listed as running, or with a `WORKER_ACTIVE` obligation, lost its agent: `$AT task interrupt --campaign "<campaign>" --task-id <id> --reason "session restarted" --finished true`, then allocate its replacement with `replaces_task_id: <id>` and the same request fields, launch and bind it as usual.
3. Runtimes: `$AT runtime inspect --campaign "<campaign>" --target-id <id>` for each target. If it is not alive, `runtime stop` it, recover it (section 4, wave 3, "The runtime"), and plan against the successor target.
4. Continue at the wave the state shows: `ready`, `running` and `obligations` tell you what is next. A task in `ready` is allocated but not dispatched: run `$AT dispatch` for it first, and launch an agent only for a task whose dispatch succeeded (a lease held by another task, such as the replacement you just allocated, keeps it waiting). `bind` only works on a dispatched task.

## 1. Resolve the run

1. Project root: `git rev-parse --show-toplevel` (else the current directory).
2. Settings: read `<project>/.claude/agentic-tests.local.md` if it exists. Its frontmatter may set `domains`, `base_url`, `start_command`, `port`, `forward_ports`, `browser_host`, `accounts` (variable names only), `review`, `host_capacity`, `api_base_url`, `mcp_server`, `backend_api`, `mobile_app_id`, `mobile_platforms`, `mobile_build_command`, `mobile_app_artifact`, `runner_host`, `github_remote`. Arguments override settings.
3. `--resume` (optionally followed by a campaign path): do section 0 now, then continue it.
4. Domains: the settings' `domains` when present. Otherwise from the target: `http(s)://…` is web, `mcp:…` is mcp, `app:…` is mobile; add api when the user asks for API checks. A campaign has one target: with several domains, every case runs against that target, and the others are reached through the URLs the settings give (`api_base_url`, `backend_api`). Each domain needs its plugin; if the Agent tool does not list `agentic-tests-<domain>:executor-<domain>`, stop and tell the user to run `/plugin install agentic-tests-<domain>@agentic-tests`.
5. Journeys: split the quoted text on `;` or new lines. With no journeys and no cases on disk, ask the user for them (AskUserQuestion, one question, two to four suggested journeys you inferred from the project's routes).
6. Web forwarding. The remote browser reaches this machine's servers only through forwarded ports, and only these exist: 3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000. Fix the whole set once, now: the web port, plus the port of every local backend named in `api_base_url`, `backend_api` or the start command, plus (with `--track campaign` on an Attach target) one spare free port for a successor. Sort ascending, join with spaces. Every port must be on the list, else stop and say which. This is `EGO_FORWARD_PORTS` for every task of the campaign; never change it mid-run (a different set makes a second tunnel that collides on the browser host). A public URL needs no forwarding.
7. Web runtime choice, for a local target (`localhost`, `127.0.0.1`):
   - `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows a listener: **Attach** if `curl -sS -m 30 -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/` prints a code other than `000`. A listener that does not answer there (for example one bound only to `::1`) is reported to the user, never killed.
   - No listener: **Start**. The operator starts `start_command` (or the project's dev script) on an allow-listed port, preferring the target URL's port.
   - A target whose port is not on the list cannot be reached by the browser: Start on an allowed port, or tell the user.
   - A public URL is always Attach.
8. Review policy: `--review 1` or `--review 2` forces every expectation; otherwise authors apply the default (2 for critical, auth, payment and integrity; 1 otherwise).
9. Track: `smoke` (default) reports failures; `campaign` also runs the repair loop of section 6, which needs a clean working tree (`project.clean`) and a GitHub remote (`project.github_remote`). Without a remote run the loop up to the diagnosis and say why; with a dirty tree stop and ask the user to commit or stash first. With `--detach`, go to section 8 instead.

## 2. Preflight and campaign

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/at.mjs" doctor --project "<project>" --accounts "<settings accounts, comma separated>"
```

The first call installs the engine's locked dependencies (a few seconds, needs npm and network once). Stop with the reported `next_actions` or a plain sentence when:
- the needed domain is unavailable (`web`, `api`, `mcp`, `mobile` blocks), or `timeout` is `false` (tell the user to `brew install coreutils`);
- `accounts_missing` is not empty: the variables must be exported in the shell that starts Claude Code (the engine hashes them into every target's identity); name the missing ones.

Look at `leftovers`: engine-owned targets of earlier campaigns that still run. For each, `$AT state --campaign <its campaign>`: `complete: true` means `$AT teardown --campaign <its campaign>` now. An incomplete campaign is left alone unless its port is the one you need; then ask the user whether to resume it (`--resume`) or tear it down.

Create the campaign (slug from the first journey, kebab-case, at most 30 characters):

```bash
$AT init --project "<project>" --slug "<slug>" --mode interactive --host-capacity <settings host_capacity, default 6> --max-attempts 3 [--github-remote <settings github_remote>]
```

Append the run's decisions to `<campaign>/02-decisions.md`: target, forward ports, browser host, review policy, account variable names, track, runtime choice. Tell the user once: the project's files must not change while the campaign runs (the engine fingerprints them; an edit invalidates the proof).

## 3. How to dispatch one task

Every task takes three steps, and the binding must happen in the same turn as the launch:

1. Allocate: `$AT launch --campaign "<campaign>" <<'EOF'` + the request YAML + `EOF`. To allocate several tasks at once put their requests in one call, separated by a line containing only `---`. It prints one JSON line per task with `task_id`, `handoff`, `drafts`, `outputs`, and for executors `round_id`.
2. Launch the agent from the table below with `subagent_type` set exactly, `description` `<role> <task_id>`, and a prompt that is only `Handoff: <handoff path>` (verifiers add a second line `Slot: a` or `Slot: b`). The agents run in the background; the Agent tool returns the agent ID immediately. Launch all agents of one batch in the same message.
3. Bind: `$AT bind --campaign "<campaign>" --pairs "T0003=<agent ID> T0004=<agent ID>"` (or `--task-id T0003 --handle <agent ID>` for one). Bind the IDs the Agent tool returned; never invent one.

Never launch an agent for a task that `launch` or `dispatch` did not report `ok: true` for. Keep active workers at or below the campaign's host capacity.

When `launch` returns `ok: false` at the `task dispatch` step (`TASK_BLOCKED`, a resource lease or capacity), the task is allocated but waiting. Do not launch an agent for it. After the task holding that resource closes, run `$AT dispatch --campaign "<campaign>" --task-id <task_id>` and then launch and bind as usual.

When a worker's completion notification arrives, read its one line, then close it and record its cost in the same call (`--tokens` is the notification's `subagent_tokens`, `--model` the table's model):
- Self-publishing roles (author, environment operator, planner, executor, diagnostician, ticket writer, implementer, integrator): `$AT close --campaign "<campaign>" --task-id <task_id> --tokens <n> --model <model>`.
- Reviewers (verifier, plan auditor): `$AT publish --campaign "<campaign>" --task-id <task_id> --tokens <n> --model <model>`. If it returns `ok: false`, send the `issues` and `details` to that same agent with SendMessage and wait for its new line; never edit a draft yourself.
- A `BLOCKED` or `PARTIAL` line: read the reason. Fix the input with a new task of the same role whose request adds `replaces_task_id: <that task>` (the engine then retires the old task's obligation); otherwise report it. A close or publish that fails because outputs are missing means the worker did not finish; ask it with SendMessage what is missing.
- `CONTROLLER_BUSY` is retried by the script; if it still comes back, wait a minute and repeat the call.

| Role | web | api | mcp | mobile | model |
|---|---|---|---|---|---|
| scenario-author | `agentic-tests-web:author-web` | `agentic-tests-api:author-api` | `agentic-tests-mcp:author-mcp` | `agentic-tests-mobile:author-mobile` | sonnet |
| environment-operator | `agentic-tests-web:environment-operator-web` | `agentic-tests-api:environment-operator-api` | `agentic-tests-mcp:environment-operator-mcp` | `agentic-tests-mobile:environment-operator-mobile` | haiku (mobile: sonnet) |
| executor | `agentic-tests-web:executor-web` | `agentic-tests-api:executor-api` | `agentic-tests-mcp:executor-mcp` | `agentic-tests-mobile:executor-mobile` | sonnet (api: haiku) |
| planner | `agentic-tests:planner` | | | | sonnet |
| plan-auditor | `agentic-tests:plan-auditor` | | | | sonnet |
| verifier | `agentic-tests:verifier` | | | | sonnet |
| diagnostician | `agentic-tests:diagnostician` | | | | sonnet |
| ticket-writer | `agentic-tests:ticket-writer` | | | | haiku |
| implementer | `agentic-tests:implementer` | | | | sonnet |
| integrator | `agentic-tests:integrator` | | | | sonnet |

## 4. Smoke track

Request YAML for each step. Fill every `<…>`; keep `requested_action` to the facts the worker needs.

**Wave 1, in parallel: one author per journey, plus one environment operator.**

```yaml
role: scenario-author
slug: <journey-slug>
requested_action: |
  Domain: <web|api|mcp|mobile>. Journey: "<journey text>".
  Base URL: <url>. Browser host: <host>. EGO_FORWARD_PORTS: <the set fixed in section 1>.
  Review policy: <default|all 1|all 2>. Accounts: <variable names or none>.
  Extra expectation sets: <none, or console-clean, a11y-basic, responsive when the user asked>.
required_inputs:
  - {base: project, path: .}
```

```yaml
role: environment-operator
requested_action: |
  Domain: <domain>. Mode: <Attach <url> | Start <command, or "discover from the project"> on port <port>>.
  Readiness path: <path, default />. Browser host: <host>. EGO_FORWARD_PORTS: <the set fixed in section 1>. Clients: <browser, plus http when API cases run>.
  MCP only: server <config file>:<entry> or URL, required tool <name>, backend <URL or none>.
  Mobile only: platform <ios|android>, app id <id>, build <command>, artifact <path>, runner host <host or "select">.
required_inputs:
  - {base: project, path: .}
```

Note each author's `outputs[0]` (its `02-expectations.record.yaml` path) and the operator's `target_id`. If the operator reports `FAILED`, report it with its log paths and stop the run.

**Wave 2: planner** (after all authors and the operator are closed):

```yaml
role: planner
target_id: <target_id>
requested_action: |
  Plan cases <T0001, T0002, …> on target <target_id>. Scope: 1) "<journey 1>" -> T0001; 2) …
  Review policy: <default|all 1|all 2>.
required_inputs:
  - <each case's specs/S001/01-test-case.md>
  - <each case's specs/S001/02-expectations.record.yaml>
  - environments/<target_id>/00-environment.record.yaml
```

**Wave 3: plan audit**, `role: plan-auditor`, `plan_id: <plan_id from the planner launch>`, `requested_action: Audit plan <plan_id> for coverage, oracles, reviews, dependencies and resources before execution. Review policy: <default|all 1|all 2>.` Publish it, then:

```bash
$AT plan accept --campaign "<campaign>" --file "<planner outputs[0]>" --audit "<auditor outputs[0]>"
```

When the audit says `changes_required` (`plan accept` fails with `PLAN_NOT_APPROVED`), read only the audit's findings (`grep -A12 '^findings' "<auditor outputs[0]>"`) and route each one by what it names:

- **A case's spec** (`SPEC_INVALID` with case IDs): one revision author per case, `role: scenario-author`, `case_ids: [<case_id>]`, `requested_action` quoting that case's findings. The engine allocates the next spec revision (S002 …) and keeps the old one as history.
- **The runtime** (`ENVIRONMENT_BLOCKER` about the target, such as undeclared account variables): `$AT runtime recover --campaign "<campaign>" --target-id <target> --file <request>` with a request file holding `reason:` and `requested_action:` that quote the finding. It returns an environment-operator task and a successor target; dispatch it with `$AT dispatch`, launch the operator, bind, and plan against the successor target.
- **The plan itself** (coverage, dependencies, resource claims): the next planner fixes it.

Then launch a new planner whose `requested_action` lists every finding and the new spec revisions or target, then a new auditor. After three rejected audits, stop and report the findings.

**Wave 4: executors**, one per case, at most two web executors at a time (they share the browser host):

```yaml
role: executor
case_ids: [<case_id>]
requested_action: |
  Execute <case_id> once. Browser host: <host>. EGO_FORWARD_PORTS: <the set fixed in section 1>. Accounts: <variable names or none>.
```

**Wave 5: verifiers**, as soon as each executor is closed (do not wait for the other cases). Slot `a` always; slot `b` too when that case's expectations declare `review_count: 2` (check with `grep -c "review_count: 2" <case expectations record>`). Launch both slots in the same message; each gets only its handoff.

```yaml
role: verifier
case_ids: [<case_id>]
round_id: <round_id from the executor launch>
verification_slot: <a|b>
requested_action: Review the saved evidence of <case_id> round <round_id> against its frozen expectations.
```

**Wave 6: closure.** When `$AT state --campaign "<campaign>"` shows every case with an outcome, launch `role: plan-auditor`, `plan_id: <plan_id>`, `phase: closure`, `requested_action: Audit current-target proof and open obligations at closure.` Publish it, then check `$AT state` for `complete: true`.

When closure is rejected, read its findings (`grep -A12 '^findings' "<auditor outputs[0]>"`) and route them, then audit closure again (at most twice):
- **Side findings with pending scope**: ask the user once with AskUserQuestion (in scope, out of scope), record each answer with `$AT finding decide … --source "user, <date>"`. When you cannot ask (no user), leave them pending and report them.
- **Evidence problems on a case** (missing, duplicated or contradictory captures): a fresh executor for that case, with `prior_context: {what_changed: "<the capture fix>", hypothesis: "<why the new capture proves it>", do_not_repeat: ["<the faulty capture>"]}`, then fresh verifiers for the new round.
- **Obligations of superseded tasks**: allocate their replacement with `replaces_task_id`, or interrupt an unused task with `$AT task interrupt --campaign … --task-id … --reason "<why>" --finished true`.

### After verification: when a case did not pass

Read the verifiers' findings (`$AT state`, then `grep -B2 -A8 '^findings' <verification record>`) and route by what they say:
- **The app is wrong** (`PRODUCT_DEFECT`): smoke track reports it; campaign track runs the repair loop of section 6.
- **The recipe or the oracle is wrong** (a step cannot run, an expectation asserts something its source does not say): the case needs a new spec, and a retest only counts against the plan that pins it. Allocate a `scenario-author` for that case (the engine issues the next revision), then a planner and plan auditor for a new plan that includes it, `plan accept`, and only then a fresh executor and fresh verifiers. An executor allocated before the new plan is accepted is bound to the old spec: interrupt it (`$AT task interrupt …`) and allocate again.
- **The capture is wrong or missing** (`EVIDENCE_GAP`): a fresh executor for the same spec with `prior_context`, then fresh verifiers.

## 5. Read the state

`$AT state --campaign "<campaign>"` reconciles and returns `complete`, per-case `outcome`, findings, ready and running tasks, obligations and token totals. Use it after each wave and when resuming. Common obligations: `TASK_PENDING`/`WORKER_ACTIVE` (finish or close those tasks), `PLAN_REQUIRED`, `VERIFICATION_REQUIRED`, `FINDING_OPEN` (a verified failure), `CLOSURE_AUDIT_REQUIRED`.

## 6. Campaign track: repair loop

Read `${CLAUDE_PLUGIN_ROOT}/engine/run-agentic-tests/references/fixes-and-delivery.md` once before the first repair. For each open `PRODUCT_DEFECT` finding, in order, each step a fresh agent:

1. Scope: findings from a case's own expectations are in scope. A `SIDE_FINDING` needs the user's decision (ask), recorded with `$AT finding decide --campaign "<campaign>" --finding-id <id> --scope in_scope|out_of_scope --reason "<why>" --source "<user decision>"`.
2. `role: diagnostician, finding_id: <id>`. Continue only when its diagnosis is `confirmed`.
3. `role: ticket-writer, finding_id: <id>` (needs the project's GitHub remote).
4. `role: implementer, finding_id: <id>`: a worktree fix with a PR.
5. `role: integrator, finding_id: <id>`: merges and allocates a new target. Merging changes the user's default branch on GitHub: before the first integrator of the campaign ask once with AskUserQuestion ("Merge fixes into <branch> of <owner/repo>?": yes, or stop after the PR) and record the answer in `02-decisions.md`. Without the user's yes, stop after the implementer and report the PR.
6. Stop the old runtime so the successor can have its port: `$AT runtime stop --campaign "<campaign>" --target-id <old target>` (an Attach target is only released). Then a new environment operator for the new target (`target_id` from the integrator's record); it builds the target from an isolated worktree at the integrated commit and leaves your checkout alone (on an Attach target it uses the spare forward port from section 1). Then fresh executors with `purpose: retest` for every affected case, then fresh verifiers, then closure again. The engine refuses reused agents; never resume a previous worker for a new task.

## 7. Report

```bash
$AT report --campaign "<campaign>"
$AT teardown --campaign "<campaign>"      # only when `$AT state` shows complete: true
```

Read `$AT state` and build the report before `teardown`: once the runtimes are stopped the engine reports `complete: false` (`TARGET_NOT_READY`), and `state` then shows the result recorded at teardown time under `torn_down`. `teardown` stops the campaign's own runtimes (dev servers, mcpc sessions, devices), removes its successor worktrees and the simulators or emulators it created; it leaves the report server running for the user. An incomplete campaign keeps its runtimes so `--resume` can continue it: say so, with the campaign path and the teardown command.

Your final message: one table with case, journey, outcome and evidence folder; the report URL and file; findings with their state; tokens by role from `$AT state`; and anything still open (obligations, blocked tasks, UNVERIFIED parts). Say what teardown stopped and removed. Mention `/agentic-tests:setup` if the project had no settings file.

## 8. Detached run

With `--detach`, launch `agentic-tests:orchestrator` once with this prompt, then tell the user the run continues in the background and that its questions will arrive as messages, and end your turn:

```text
Run: <arguments without --detach>
Project: <project root>
Settings: <settings file path, or none>
Plugin root: ${CLAUDE_PLUGIN_ROOT}
Run skill: ${CLAUDE_PLUGIN_ROOT}/skills/run/SKILL.md
```

When a question from it arrives, answer it (ask the user when you cannot) with SendMessage. When its completion notification arrives, relay its report.

## Rules

- Never perform a worker's job, never edit drafts or records, and never run `submit` for a worker.
- Never read evidence files, drafts or worker transcripts; use `$AT state` and the one-line results.
- Never reuse an agent for a second task, and never bind an ID you did not get from the Agent tool.
- Keep the run inside the project and its campaign folder; stop the report server only when the user asks (`$AT report stop --campaign "<campaign>"`).
- Do not edit the project's files while a campaign is running, and do not let a worker do it: the engine fingerprints them and an edit invalidates the proof.
