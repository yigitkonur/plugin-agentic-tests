---
name: run-forked
description: Run an agentic-tests campaign in a forked Sonnet orchestrator. Your session waits and receives only the final report.
argument-hint: '<url | mcp:<server> | app:<bundle-id>> "journey one; journey two" [--review 1|2] [--track smoke|campaign]'
disable-model-invocation: true
context: fork
agent: agentic-tests:orchestrator
---

Run: $ARGUMENTS
Plugin root: ${CLAUDE_PLUGIN_ROOT}
Run skill: ${CLAUDE_PLUGIN_ROOT}/skills/run/SKILL.md
Project: the git top-level of the current directory. Settings: `<project>/.claude/agentic-tests.local.md` if it exists.

You run in a forked context: the user's session is waiting for your final message and cannot answer questions until you finish. Do not send questions to `main` and do not wait for answers. When a decision only the user can make blocks a branch, leave that branch blocked, finish every other branch, and list each open question in your final report.
