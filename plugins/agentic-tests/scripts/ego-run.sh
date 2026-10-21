#!/usr/bin/env bash
# Run one ego-browser script (read from stdin) and keep the wrapper's status lines out of the output.
#   ego-run.sh [--env VAR1,VAR2] [--ports "3000 3001"] [--log FILE] [--timeout SECONDS] <<'JS' ... JS
# - The script's output goes to stdout. The wrapper's own "[ego-browser...]" lines go to --log (default: discarded)
#   and, when one reports a failure (busy, refused, cannot, failed, Unsupported), to stderr with exit code 7.
#   "preview setup is busy" happens before the script starts, so it is retried up to 3 times, 5 seconds apart.
# - --env: names of shell variables whose values the script needs on the remote browser host (it does not inherit
#   this environment). They arrive as a frozen `ENV` object ahead of your code: ENV.FIXTURE_PASSWORD. The values
#   travel on stdin only, never on a command line or in a file. Never print or save ENV.
# - --ports overrides EGO_FORWARD_PORTS; one value per campaign.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
names=""; ports="${EGO_FORWARD_PORTS:-}"; log=/dev/null; limit=120
while [ $# -gt 0 ]; do case "$1" in
  --env) names=$2; shift 2 ;; --ports) ports=$2; shift 2 ;; --log) log=$2; shift 2 ;; --timeout) limit=$2; shift 2 ;;
  *) echo "ego-run: unknown option $1" >&2; exit 2 ;; esac; done
script=$(cat)
[ -n "$script" ] || { echo "ego-run: no script on stdin" >&2; exit 2; }
preamble=""
if [ -n "$names" ]; then
  preamble=$(node -e 'const o = {}; for (const k of process.argv[1].split(",").filter(Boolean)) { if (process.env[k] === undefined || process.env[k] === "") { console.error("ego-run: variable " + k + " is not set"); process.exit(9); } o[k] = process.env[k]; } console.log("const ENV = Object.freeze(" + JSON.stringify(o) + ");")' "$names") || exit 9
fi
out=$(mktemp "${TMPDIR:-/tmp}/ego-run.XXXXXX"); trap 'rm -f "$out"' EXIT
attempt=1
while :; do
  printf '%s\n%s\n' "$preamble" "$script" | EGO_FORWARD_PORTS="$ports" "$here/timeout.sh" "$limit" ego-browser nodejs >"$out" 2>&1
  code=$?
  grep '^\[ego-browser' "$out" >>"$log" 2>/dev/null
  wrapper_fail=$(grep '^\[ego-browser' "$out" | grep -Ei 'busy|refus|cannot|failed|unsupported' | head -3)
  if [ -n "$wrapper_fail" ]; then
    if printf '%s' "$wrapper_fail" | grep -qi busy && [ "$attempt" -lt 3 ]; then attempt=$((attempt + 1)); sleep 5; continue; fi
    printf '%s\n' "$wrapper_fail" >&2; exit 7
  fi
  break
done
grep -v '^\[ego-browser' "$out"
exit "$code"
