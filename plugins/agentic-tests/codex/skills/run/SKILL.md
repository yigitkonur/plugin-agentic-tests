---
name: run
description: Run an agentic end-to-end test campaign on web, HTTP API, MCP or mobile targets with fresh Codex subagents per role, blind evidence review and an HTML report. Only when the user invokes it.
---

# Run an agentic test campaign (Codex)

The campaign procedure is written once, for Claude Code, in the plugin's `skills/run/SKILL.md`. In Codex you follow that same file with the substitutions below.

1. Plugin root: the absolute path of the folder that contains `codex/skills/run/SKILL.md` (this file) and `scripts/at.mjs`, three folders above this file. Call it `<root>`.
2. Read `<root>/skills/run/SKILL.md` in full now and follow it as the procedure for this request, reading it through these substitutions:

| Claude Code text | In Codex |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | `<root>` (so the controller is `node "<root>/scripts/at.mjs" …`) |
| `$ARGUMENTS` | the user's request after the skill mention: target, quoted journeys, flags |
| "if the Agent tool does not list `agentic-tests-<domain>:executor-<domain>`, stop" | skip this check: every role ships in this plugin under `<root>/codex/roles/` |
| launch the agent with `subagent_type` `<plugin>:<name>` | `spawn_agent` with a fresh context (no forked history, so `fork_context` false), `agent_type` and `model` left unset, and this message, nothing else: `Read <root>/codex/roles/<name>.md first and follow it as your role for this task.` then on the next line `Handoff: <handoff path>` (verifiers add a third line `Slot: a` or `Slot: b`). `<name>` is the part after the colon, for example `executor-api` |
| the agent ID the Agent tool returned | the id `spawn_agent` returned; bind exactly that id |
| "launch all agents of one batch in the same message" | call `spawn_agent` for each task of the batch, one after another, before waiting |
| a worker's completion notification | `wait_agent` on the running ids; the last line of a finished worker's final message is its one-line result |
| `--tokens <n> --model <model>` on close and publish | leave both out: Codex reports no per-worker usage |
| SendMessage to a worker | `send_input` to its id, then `wait_agent` for its new line |
| AskUserQuestion | ask in chat in a few short numbered lines and wait for the answer. In a headless run (`codex exec`) nobody answers: take the documented default (smoke track, no merge) and list the question in the final report |
| the table's model column | for Claude Code only: in Codex every worker runs on this session's model |
| `--detach`, section 8 and `agentic-tests:run-forked` | not available in Codex: run in the foreground and say so |

3. Codex specifics:
   - After a task is closed or published (`ok: true`), call `close_agent` on its worker. Never give a worker a second task; a new task always gets a new `spawn_agent`.
   - Codex caps how many subagents run at once. If `spawn_agent` refuses for capacity, wait for a running worker with `wait_agent`, close its task, then spawn.
   - Stay in this turn until the campaign is complete or blocked, the report is built and the final message is written. Ending the turn while workers run loses them (in `codex exec` the process exits).
   - Workers inherit this session's sandbox and approval settings and cannot answer approval prompts. A campaign needs network access to the target and writes inside the project; if a worker reports a sandbox denial, stop and tell the user to rerun with approvals off and a sandbox that allows both.
   - The settings file stays `<project>/.claude/agentic-tests.local.md`, shared with Claude Code; `$agentic-tests:setup` writes it.
