#!/usr/bin/env bash
# Start Maestro's MCP server for the agentic-tests-mobile plugin, on this machine or on the
# project's mobile runner host (runner_host in .claude/agentic-tests.local.md) over SSH.
# Agent and MCP shells skip profile files, so the toolchain (Java 17+, ~/.maestro/bin) is set here.
set -uo pipefail
settings="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/agentic-tests.local.md"
host=local
if [ -f "$settings" ]; then
  value=$(awk -F': *' '/^runner_host:/ { print $2; exit }' "$settings" | tr -d '"'"'"' ')
  [ -n "$value" ] && [ "$value" != null ] && host=$value
fi
toolchain='export PATH="$HOME/.maestro/bin:$PATH"; if [ -z "${JAVA_HOME:-}" ]; then JAVA_HOME=$( (/usr/libexec/java_home -v 17+ 2>/dev/null) || ls -d /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/lib/jvm/*-17* /usr/lib/jvm/*-21* 2>/dev/null | head -1); export JAVA_HOME; fi; [ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH";'
if [ "$host" = local ]; then
  eval "$toolchain"
  exec maestro mcp --no-viewer
fi
exec ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$host" "bash -lc '$toolchain exec maestro mcp --no-viewer'"
