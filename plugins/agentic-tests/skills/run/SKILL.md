---
name: run
description: Run an agentic end-to-end test campaign on web, HTTP API, MCP or mobile targets with model-pinned expert agents, blind evidence review and an HTML report.
argument-hint: '<url | mcp:<server> | app:<bundle-id>> "journey one; journey two" [--review 1|2] [--track smoke|campaign] [--detach] [--resume]'
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Agent, SendMessage, AskUserQuestion
---

# Run an agentic test campaign

You are the campaign controller. Plugin agents do every substantive job: authoring cases, starting the runtime, planning, auditing, executing, verifying, diagnosing and fixing. You allocate their tasks with the controller script, launch the matching agent with its handoff path, bind the agent ID, and read its one-line result. Evidence, drafts and worker transcripts never enter your context; the engine's state is your only view.

Controller (every command prints one JSON line):

```bash
AT="node ${CLAUDE_PLUGIN_ROOT}/scripts/at.mjs"
```

Arguments: `$ARGUMENTS`

## 1. Resolve the run

1. Project root: `git rev-parse --show-toplevel` (else the current directory).
2. Settings: read `<project>/.claude/agentic-tests.local.md` if it exists. Its frontmatter may set `domains`, `base_url`, `start_command`, `port`, `forward_ports`, `browser_host`, `accounts` (variable names only), `review`, `host_capacity`, `api_base_url`, `mcp_server`, `mobile_app_id`, `runner_host`. Arguments override settings.
3. Domain from the target: `http(s)://…` is web (add api when settings list it or the user asks for API checks), `mcp:…` is mcp, `app:…` is mobile. Each domain needs its plugin; if the Agent tool does not list `agentic-tests-<domain>:executor-<domain>`, stop and tell the user to run `/plugin install agentic-tests-<domain>@agentic-tests`.
4. Journeys: split the quoted text on `;` or new lines. With no journeys and no cases on disk, ask the user for them (AskUserQuestion, one question, two to four suggested journeys you inferred from the project's routes). With `--resume`, skip to section 5.
5. Web runtime choice: if `start_command` or a `package.json` dev script exists and the target is local, the environment operator starts the app on an allow-listed port (3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000; prefer the target URL's port). `EGO_FORWARD_PORTS` is that one port. For a public URL, no forwarding.
6. Review policy: `--review 1` or `--review 2` forces every expectation; otherwise authors apply the default (2 for critical, auth, payment and integrity; 1 otherwise).
7. Track: `smoke` (default) reports failures; `campaign` also runs the repair loop of section 6. With `--detach`, go to section 8 instead.

## 2. Preflight and campaign

```bash
$AT doctor
```

Stop with the reported `next_actions` if the needed domain is unavailable (`web`, `api`, `mcp`, `mobile`). Then create the campaign (slug from the first journey, kebab-case, at most 30 characters):

```bash
$AT init --project "<project>" --slug "<slug>" --mode interactive --host-capacity 4 --max-attempts 3
```

Append the run's decisions to `<campaign>/02-decisions.md`: target, forward ports, browser host, review policy, account variable names, track.

## 3. How to dispatch one task

Every task takes three steps, and the binding must happen in the same turn as the launch:

1. Allocate: `$AT launch --campaign "<campaign>" <<'EOF'` + the request YAML + `EOF`. It returns `task_id`, `handoff`, `drafts`, `outputs`, and for executors `round_id`.
2. Launch the agent from the table below with `subagent_type` set exactly, `description` `<role> <task_id>`, and a prompt that is only `Handoff: <handoff path>` (verifiers add a second line `Slot: a` or `Slot: b`). The Agent tool returns the agent ID immediately.
3. Bind: `$AT bind --campaign "<campaign>" --task-id <task_id> --handle <agent ID>`. Bind the ID the Agent tool returned; never invent one.

Launch independent tasks together: all `launch` calls, then all Agent calls in one message, then all `bind` calls. Keep active workers at or below the campaign's host capacity.

When a worker's completion notification arrives, read its one line, then:
- Self-publishing roles (author, environment operator, planner, executor, diagnostician, ticket writer, implementer, integrator): `$AT close --campaign "<campaign>" --task-id <task_id>`.
- Reviewers (verifier, plan auditor): `$AT publish --campaign "<campaign>" --task-id <task_id>`. If it returns `ok: false`, send the `issues` and `details` to that same agent with SendMessage and wait for its new line; never edit a draft yourself.
- Always record cost from the notification's usage: `$AT cost --campaign "<campaign>" --task-id <task_id> --tokens <subagent_tokens> --model <model from the table>`.
- A `BLOCKED` line: read the reason. Fix the input with a new task (corrected request) when you can; otherwise report it. A close or publish that fails because outputs are missing means the worker did not finish; ask it with SendMessage what is missing.

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
  Base URL: <url>. Browser host: <host>. EGO_FORWARD_PORTS: <ports>.
  Review policy: <default|all 1|all 2>. Accounts: <variable names or none>.
  Extra expectation sets: <none, or console-clean, a11y-basic, responsive when the user asked>.
required_inputs:
  - {base: project, path: .}
```

```yaml
role: environment-operator
requested_action: |
  Domain: <domain>. Start: <command, or "discover from the project">. Port: <port>.
  Readiness path: <path, default />. Browser host: <host>. EGO_FORWARD_PORTS: <ports>.
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
required_inputs:
  - <each case's specs/S001/01-test-case.md>
  - <each case's specs/S001/02-expectations.record.yaml>
  - environments/<target_id>/00-environment.record.yaml
```

**Wave 3: plan audit**, `role: plan-auditor`, `plan_id: <plan_id from the planner launch>`, `requested_action: Audit plan <plan_id> for coverage, oracles, reviews, dependencies and resources before execution.` Publish it, then:

```bash
$AT plan accept --campaign "<campaign>" --file "<planner outputs[0]>" --audit "<auditor outputs[0]>"
```

When the audit says `changes_required` (plan accept fails), launch a new planner whose `requested_action` lists the audit findings, then a new auditor. After two rejected audits, stop and report the findings.

**Wave 4: executors**, one per case, at most two web executors at a time (they share the browser host):

```yaml
role: executor
case_ids: [<case_id>]
requested_action: |
  Execute <case_id> once. Browser host: <host>. EGO_FORWARD_PORTS: <ports>. Accounts: <variable names or none>.
```

**Wave 5: verifiers**, as soon as each executor is closed (do not wait for the other cases). Slot `a` always; slot `b` too when that case's expectations declare `review_count: 2` (check with `grep -c "review_count: 2" <case expectations record>`). Launch both slots in the same message; each gets only its handoff.

```yaml
role: verifier
case_ids: [<case_id>]
round_id: <round_id from the executor launch>
verification_slot: <a|b>
requested_action: Review the saved evidence of <case_id> round <round_id> against its frozen expectations.
```

**Wave 6: closure.** When `$AT state --campaign "<campaign>"` shows every case with an outcome, launch `role: plan-auditor`, `plan_id: <plan_id>`, `phase: closure`, `requested_action: Audit current-target proof and open obligations at closure.` Publish it.

## 5. Read the state

`$AT state --campaign "<campaign>"` reconciles and returns `complete`, per-case `outcome`, findings, ready and running tasks, obligations and token totals. Use it after each wave and when resuming. Common obligations: `TASK_PENDING`/`WORKER_ACTIVE` (finish or close those tasks), `PLAN_REQUIRED`, `VERIFICATION_REQUIRED`, `FINDING_OPEN` (a verified failure), `CLOSURE_AUDIT_REQUIRED`.

## 6. Campaign track: repair loop

Read `${CLAUDE_PLUGIN_ROOT}/engine/run-agentic-tests/references/fixes-and-delivery.md` once before the first repair. For each open `PRODUCT_DEFECT` finding, in order, each step a fresh agent:

1. Scope: findings from a case's own expectations are in scope. A `SIDE_FINDING` needs the user's decision (ask), recorded with `$AT finding decide --campaign "<campaign>" --finding-id <id> --scope in_scope|out_of_scope --reason "<why>" --source "<user decision>"`.
2. `role: diagnostician, finding_id: <id>`. Continue only when its diagnosis is `confirmed`.
3. `role: ticket-writer, finding_id: <id>` (needs the project's GitHub remote).
4. `role: implementer, finding_id: <id>`: a worktree fix with a PR.
5. `role: integrator, finding_id: <id>`: merges and allocates a new target.
6. A new environment operator for the new target (`target_id` from the integrator's record), then fresh executors with `purpose: retest` for every affected case, then fresh verifiers, then closure again. The engine refuses reused agents; never resume a previous worker for a new task.

## 7. Report

```bash
$AT report --campaign "<campaign>"
```

Your final message: one table with case, journey, outcome and evidence folder; the report URL and file; findings with their state; tokens by role from `$AT state`; and anything still open (obligations, blocked tasks, UNVERIFIED parts). Mention `/agentic-tests:setup` if the project had no settings file.

## 8. Detached run

With `--detach`, launch `agentic-tests:orchestrator` once with the prompt `Run: <arguments without --detach>` plus the project root and settings path, tell the user the run continues in the background and that its questions will arrive as messages, and end your turn. When its notification arrives, relay its report.

## Rules

- Never perform a worker's job, never edit drafts or records, and never run `submit` for a worker.
- Never read evidence files, drafts or worker transcripts; use `$AT state` and the one-line results.
- Never reuse an agent for a second task, and never bind an ID you did not get from the Agent tool.
- Keep the run inside the project and its campaign folder; stop the report server only when the user asks.
