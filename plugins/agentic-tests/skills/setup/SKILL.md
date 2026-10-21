---
name: setup
description: Prepare a project for agentic-tests once - detect its domains, runtime and runners, and write .claude/agentic-tests.local.md for /agentic-tests:run.
argument-hint: '[--domains web,api,mcp,mobile] [--accounts VAR1,VAR2] [--start "<command>"] [--port N] [--yes]'
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Set up agentic-tests for this project

Write `<project>/.claude/agentic-tests.local.md`, the settings `/agentic-tests:run` reads. Detect everything you can; ask only what the project cannot tell you. Arguments: `$ARGUMENTS`. With `--yes`, ask nothing and use detected values and arguments.

The controller is `node "${CLAUDE_PLUGIN_ROOT}/scripts/at.mjs" <command>`, written `$AT` below; always type the full form (shell state does not persist between calls and zsh does not split a variable into words).

## 1. Detect

1. Project root: `git rev-parse --show-toplevel` (else the current directory). GitHub remote: `git remote get-url origin` (the repair loop needs one; note when absent).
2. Runners: `$AT doctor --project "<project>"` (the first call installs the engine's locked dependencies: needs npm and network once). Keep `web.available`, `web.remote_host`, `mcp.available`, `mobile.available`, `mobile.java_home`, `mobile.xcode`, `timeout` (false means `brew install coreutils`), and `project` (git, clean, remote). The runner documentation ships inside this plugin; none of the `ego-browser`, `test-by-mcpc-cli` or `test-by-maestro` skills needs to be installed, only their programs.
3. Domains, from the project files (read `package.json`, top-level files and folders; do not read the whole tree):
   - **web**: a frontend framework or dev server (`next`, `vite`, `react-scripts`, `astro`, `@remix-run`, `nuxt`, `svelte`, an `index.html`, server-rendered pages).
   - **api**: HTTP routes (`express`, `fastify`, `hono`, `koa`, `@nestjs`, route folders like `app/api`, `routes/`), an OpenAPI file (`openapi.*`, `swagger.*`), or a backend such as Supabase (`@supabase/supabase-js`, `supabase/` folder).
   - **mcp**: `@modelcontextprotocol/sdk`, `mcp-use`, `fastmcp`, or a `mcp.json`/`.mcp.json` describing the server.
   - **mobile**: `app.json` with `expo`, `react-native`, `ios/` or `android/` folders, `.maestro/` flows.
4. Web runtime: the dev script from `package.json` (`dev`, then `start`) and its port (`--port`, `PORT`, framework default: Next 3000, Vite 5173, Astro 4321). Browser host: doctor's `web.remote_host` when the `ego-browser` command is an ssh wrapper to another machine, otherwise `local`. With a remote browser host the port must be one the wrapper forwards (the reference wrapper: 3000 3001 4173 4321 5000 5173 8000 8080 8081 8088 8090 8787 8788 8888 9000); if the default is not on that list, pick 3000 and note the flag that sets it, and set `forward_ports` to that port. With `local`, any port works and `forward_ports` stays null.
5. Accounts: variable names the app reads for test users (`.env.example`, `.env.local.example`, README). Never read or copy values from `.env` files.
6. Mobile only: run `"${CLAUDE_PLUGIN_ROOT}/scripts/select-mac.sh"` and keep its chosen host, platform list and device; read the app ID from `app.json`, `ios/*.xcodeproj` or `android/app/build.gradle`, and find how a simulator build is made (an Expo or React Native script, `xcodebuild … -sdk iphonesimulator`, a `build.sh`) and where its `.app` or `.apk` lands; record them as `mobile_build_command` and `mobile_app_artifact`.
7. Effort overrides: if `CLAUDE_CODE_EFFORT_LEVEL` or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set in the environment, note that it overrides the agents' pinned effort or model.
8. Permissions: the agents run in the background and cannot answer permission prompts, so anything not pre-approved is denied. Read `permissions.defaultMode` from the user, project and local settings files. If it is not `bypassPermissions`, tell the user to run campaigns in a trusted project with that mode, or to allow `Bash`, `Read`, `Write(agentic-tests/**)`, `Edit(agentic-tests/**)` and, for the repair loop, `Bash(gh *)` and `Bash(git *)`.
9. Account variables: for each name in `accounts` check it is set in this shell (`$AT doctor --accounts A,B` lists `accounts_missing`); the user must export them in the shell that starts Claude Code, because the engine hashes them into every target's identity.

## 2. Confirm

Unless `--yes`, ask one AskUserQuestion with up to three questions: which domains to test (multi-select, detected ones marked recommended), which account variable names to use (offer the detected names), and for mobile which platform (iOS, Android or both). Arguments already given are not asked again.

## 3. Write the settings file

Create `.claude/` if needed and write `.claude/agentic-tests.local.md`:

```markdown
---
domains: [web, api]
base_url: http://127.0.0.1:3000
start_command: npm run dev -- --port 3000
port: 3000
forward_ports: null          # remote browser host only, for example "3000"
browser_host: local          # or the ssh alias doctor reports as web.remote_host
accounts: [FIXTURE_USER, FIXTURE_PASSWORD]
review: default
host_capacity: 4
api_base_url: http://127.0.0.1:3000/api
openapi: openapi.json
mcp_server: null
backend_api: null
mobile_app_id: null
mobile_platforms: []
mobile_build_command: null
mobile_app_artifact: null
runner_host: local
github_remote: origin
---

Notes for authors: product documents worth citing (README sections, specs), how test data is reset, anything a tester must know.
```

Use `null` or `[]` for anything not detected. Fill the notes from what you read: real file paths of requirement documents and the reset procedure if the project has one.

Then make sure the project's `.gitignore` contains `.claude/*.local.md` and `/agentic-tests/` (append the missing lines; never rewrite the file).

## 4. Report

One short message: the settings path, the detected domains with the evidence for each, the runner status per domain, the plugins to install (`/plugin install agentic-tests-<domain>@agentic-tests`, enabled for this project only with `--scope project`), anything missing (runner, GitHub remote, accounts), and the next command, for example `/agentic-tests:run http://127.0.0.1:3000 "sign in; see orders"`.
