#!/usr/bin/env bash
# Create a throwaway Git project from a fixture for a live campaign.
#   scripts/live-project.sh <web|api|mcp|mobile|defect> <target dir> [port]
# The project contains .claude/agentic-tests.local.md (git-ignored), so
# `claude -p --plugin-dir … '/agentic-tests:run …'` run from that directory needs no /agentic-tests:setup.
# defect: web app with one deliberate bug, pushed to a private GitHub repo (needs `gh` authenticated).
set -euo pipefail
kind=${1:?web|api|mcp|mobile|defect}; dir=${2:?target dir}; port=${3:-}
here=$(cd "$(dirname "$0")/.." && pwd); fx="$here/fixtures"
rm -rf "$dir"; mkdir -p "$dir/.claude"
settings() { # domains port base api backend mcp app extra-notes
cat > "$dir/.claude/agentic-tests.local.md" <<S
---
domains: [$1]
base_url: ${3:-null}
start_command: ${9:-null}
port: ${2:-null}
forward_ports: ${10:-null}
browser_host: tugce
accounts: [FIXTURE_USER, FIXTURE_PASSWORD]
review: default
host_capacity: 6
api_base_url: ${4:-null}
openapi: ${11:-null}
mcp_server: ${6:-null}
backend_api: ${5:-null}
mobile_app_id: ${7:-null}
mobile_platforms: ${12:-[]}
mobile_build_command: ${13:-null}
mobile_app_artifact: ${14:-null}
runner_host: local
github_remote: ${15:-null}
---

$8
S
}
case "$kind" in
  web)
    p=${port:-3000}; cp "$fx"/web-app/* "$dir"/
    settings web "$p" "http://127.0.0.1:$p" "" "" "" "" "Fixture Shop (server.mjs). Requirements: REQUIREMENTS.md. Reads PORT, FIXTURE_USER, FIXTURE_PASSWORD. State is in memory." "npm run dev" "\"$p\"" ;;
  defect)
    p=${port:-3001}; cp "$fx"/web-app/* "$dir"/
    sed -i '' 's/return `Signed in as ${user.email}`;/return `Signed in as ${user.mail}`;/' "$dir/server.mjs"
    settings web "$p" "http://127.0.0.1:$p" "" "" "" "" "Fixture Shop (server.mjs). Requirements: REQUIREMENTS.md. Reads PORT (use $p), FIXTURE_USER, FIXTURE_PASSWORD. GitHub: yigitkonur/agentic-tests-fixture-shop (private, default branch main)." "npm run dev" "\"$p\"" "" "" "" "" origin ;;
  api)
    p=${port:-8000}; cp "$fx"/api-server/* "$dir"/
    settings api "$p" "http://127.0.0.1:$p" "http://127.0.0.1:$p" "" "" "" "Fixture Shop API. Contract: openapi.json; summary REQUIREMENTS.md. Reads PORT, FIXTURE_USER, FIXTURE_PASSWORD. In-memory data." "npm run dev" "" "openapi.json" ;;
  mcp)
    p=${port:-8010}; cp "$fx"/mcp-server/* "$dir"/
    node -e 'const fs=require("fs"); const [d,p]=process.argv.slice(1); fs.writeFileSync(d+"/mcp.json", JSON.stringify({mcpServers:{"fixture-shop":{command:process.execPath,args:[d+"/server.mjs"],env:{FIXTURE_API_URL:"http://127.0.0.1:"+p}}}},null,2)+"\n")' "$dir" "$p"
    settings "mcp, api" "" "" "http://127.0.0.1:$p" "http://127.0.0.1:$p" "\"mcp.json:fixture-shop\"" "" "Fixture Shop MCP server (server.mjs, stdio) configured in mcp.json (entry fixture-shop). Its tools call the shop API at http://127.0.0.1:$p, already running: attach, never start or stop it. Surface baseline: mcp-surface.json. Requirements: REQUIREMENTS.md. Backend contract: http://127.0.0.1:$p/openapi.json." "" "" "http://127.0.0.1:$p/openapi.json" ;;
  mobile)
    cp "$fx"/mobile-app/{FixtureNotes.swift,Info.plist,build.sh,REQUIREMENTS.md} "$dir"/
    settings mobile "" "" "" "" "" dev.agentictests.fixturenotes "Fixture Notes: SwiftUI app for the iOS simulator. Build ./build.sh (build/FixtureNotes.app). Bundle id dev.agentictests.fixturenotes. Requirements: REQUIREMENTS.md. Accessibility ids: note_input, add_button, note_count, error_message. State is in memory." "" "" "" "[ios]" "./build.sh" "build/FixtureNotes.app" ;;
  *) echo "unknown kind $kind" >&2; exit 2 ;;
esac
printf 'FIXTURE_USER=\nFIXTURE_PASSWORD=\n' > "$dir/.env.example"
printf '.claude/*.local.md\n/agentic-tests/\nbuild/\nnode_modules/\n' > "$dir/.gitignore"
git -C "$dir" init -q -b main
git -C "$dir" add -A
git -C "$dir" -c user.name="agentic-tests fixture" -c user.email=fixture@example.invalid commit -qm "Fixture project ($kind)"
if [ "$kind" = defect ]; then
  git -C "$dir" remote add origin https://github.com/yigitkonur/agentic-tests-fixture-shop.git
  git -C "$dir" push -q --force origin main 2>&1 | tail -1 || true
fi
echo "$dir ($kind) ready"
