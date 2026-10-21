#!/usr/bin/env bash
# Run one Maestro flow on the campaign's device, locally or on the runner host, and leave every artifact in --dir.
#   maestro-run.sh --device <id> --flow <flow.yaml> --dir <evidence dir> [--host local|<ssh alias>]
#                  [--remote-dir /tmp/agentic-tests/<campaign>/<task>] [--env VAR1,VAR2] [--timeout 600]
# Writes into --dir: report.xml (whole-flow JUnit), maestro-out/ (screenshots, hierarchy, logs), maestro.log
# (stdout+stderr, last line "exit=<code>"), plus the flow itself. Exit code = Maestro's exit code, 124/142 on timeout.
# --env: names of variables the flow reads as ${NAME}; values reach Maestro through the shell, never a file.
# Use a Bash tool timeout of at least 660000 ms for this command.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
device=""; flow=""; dir=""; host=local; remote_dir=""; names=""; limit=600
while [ $# -gt 0 ]; do case "$1" in
  --device) device=$2; shift 2 ;; --flow) flow=$2; shift 2 ;; --dir) dir=$2; shift 2 ;; --host) host=$2; shift 2 ;;
  --remote-dir) remote_dir=$2; shift 2 ;; --env) names=$2; shift 2 ;; --timeout) limit=$2; shift 2 ;;
  *) echo "maestro-run: unknown option $1" >&2; exit 2 ;; esac; done
[ -n "$device" ] && [ -f "$flow" ] && [ -n "$dir" ] || { echo "maestro-run: --device, --flow (existing file) and --dir are required" >&2; exit 2; }
mkdir -p "$dir"; dir=$(cd "$dir" && pwd)
[ "$(cd "$(dirname "$flow")" && pwd)/$(basename "$flow")" = "$dir/flow.yaml" ] || cp "$flow" "$dir/flow.yaml"
eflags=""; exports=""
for n in $(printf '%s' "$names" | tr ',' ' '); do
  [ -n "${!n:-}" ] || { echo "maestro-run: variable $n is not set" >&2; exit 9; }
  eflags="$eflags -e $n=\"\$$n\""
  exports="$exports export $n=$(printf '%q' "${!n}");"
done
cmd="timeout $limit maestro --device '$device' test flow.yaml --format junit --output report.xml --test-output-dir maestro-out$eflags"
if [ "$host" = local ]; then
  ( cd "$dir" && bash -c "source '$here/maestro-env.sh'; $cmd" >maestro.log 2>&1; echo "exit=$?" >>maestro.log )
else
  [ -n "$remote_dir" ] || { echo "maestro-run: --remote-dir is required with --host $host" >&2; exit 2; }
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "rm -rf '$remote_dir' && mkdir -p '$remote_dir'" || exit 3
  scp -q -o BatchMode=yes "$dir/flow.yaml" "$host:$remote_dir/flow.yaml" || exit 3
  { cat "$here/maestro-env.sh"; printf '%s\n' "$exports cd '$remote_dir' && { $cmd > maestro.log 2>&1; echo \"exit=\$?\" >> maestro.log; }"; } | "$here/timeout.sh" "$((limit + 60))" ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'bash -l -s'
  "$here/pull-evidence.sh" "$host" "$remote_dir" "$dir" --recursive >/dev/null || exit 5
fi
code=$(tail -1 "$dir/maestro.log" | sed -n 's/^exit=//p')
echo "maestro exit=${code:-unknown}; $(find "$dir/maestro-out" -type f 2>/dev/null | wc -l | tr -d ' ') files in maestro-out; report.xml $( [ -f "$dir/report.xml" ] && echo present || echo MISSING )"
exit "${code:-6}"
