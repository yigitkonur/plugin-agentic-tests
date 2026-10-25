---
name: setup
description: Prepare a project for agentic-tests once - detect its domains, runtime and runners, and write .claude/agentic-tests.local.md for the agentic-tests run skill. Only when the user invokes it.
---

# Set up agentic-tests for this project (Codex)

The setup procedure is written once, for Claude Code, in the plugin's `skills/setup/SKILL.md`. In Codex you follow that same file with the substitutions below.

1. Plugin root: the absolute path of the folder that contains `codex/skills/setup/SKILL.md` (this file) and `scripts/at.mjs`, three folders above this file. Call it `<root>`.
2. Read `<root>/skills/setup/SKILL.md` in full now and follow it, reading it through these substitutions:

| Claude Code text | In Codex |
|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | `<root>` (so the controller is `node "<root>/scripts/at.mjs" …`) |
| `$ARGUMENTS` | the user's request after the skill mention |
| AskUserQuestion | ask in chat in a few short numbered lines and wait for the answer; with `--yes` or in a headless run, ask nothing |
| step 7, effort overrides | skip: in Codex every worker runs on this session's model |
| step 8, permissions | Codex workers inherit this session's sandbox and approvals and cannot answer approval prompts: say that campaigns need approvals off and a sandbox that allows network access and writes inside the project |
| the plugins to install in the report | in Codex the one `agentic-tests` plugin covers every domain; per project it is turned on with `plugin on agentic-tests` |
| the next command `/agentic-tests:run …` | `$agentic-tests:run …` with the same arguments |

The settings file is the same one Claude Code reads: `<project>/.claude/agentic-tests.local.md`.
