#!/usr/bin/env bash
# Copy every file of a remote directory into a local evidence directory.
#   pull-evidence.sh <ssh host alias | local> <absolute remote dir> <local dir>
# Rules: absolute remote paths (OpenSSH 9 SFTP resolves relative paths against $HOME),
# quoted paths on both sides, no -P when the host is an ~/.ssh/config alias,
# legacy protocol (-O) only when the remote lacks the SFTP subsystem.
set -euo pipefail
#   pull-evidence.sh <host> <absolute remote dir> <local dir> --recursive   (whole tree, for Maestro output)
host=${1:?ssh host}; remote=${2:?absolute remote dir}; local_dir=${3:?local dir}; mode=${4:-}
case "$remote" in /*) ;; *) echo "pull-evidence: remote path must be absolute: $remote" >&2; exit 2 ;; esac
mkdir -p "$local_dir"
if [ "$host" = local ]; then # the browser or device runs on this machine: a plain copy, times preserved
  [ -d "$remote" ] || { echo "pull-evidence: no directory $remote" >&2; exit 4; }
  if [ "$mode" = --recursive ]; then cp -pR "$remote/." "$local_dir/"; echo "copied $(find "$remote" -type f | wc -l | tr -d ' ') file(s) recursively from $remote into $local_dir"; exit 0; fi
  count=0
  for file in "$remote"/*; do [ -f "$file" ] || continue; cp -p "$file" "$local_dir/"; count=$((count + 1)); done
  [ "$count" -gt 0 ] || { echo "pull-evidence: no files in $remote" >&2; exit 4; }
  echo "copied $count file(s) from $remote into $local_dir"; ls -la "$local_dir"; exit 0
fi
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10)
if [ "$mode" = --recursive ]; then
  if ! timeout 300 scp -q -r -p "${ssh_opts[@]}" "$host:$remote/." "$local_dir/" 2>/tmp/pull-evidence.$$; then
    if grep -q "subsystem request failed" /tmp/pull-evidence.$$; then timeout 300 scp -q -O -r -p "${ssh_opts[@]}" "$host:$remote/." "$local_dir/" || exit 5
    else cat /tmp/pull-evidence.$$ >&2; rm -f /tmp/pull-evidence.$$; exit 5; fi
  fi
  rm -f /tmp/pull-evidence.$$
  echo "pulled $(find "$local_dir" -type f | wc -l | tr -d ' ') file(s) recursively from $host:$remote into $local_dir"
  exit 0
fi
files=$(timeout 30 ssh "${ssh_opts[@]}" "$host" "find $(printf '%q' "$remote") -maxdepth 1 -type f" ) || { echo "pull-evidence: cannot list $host:$remote" >&2; exit 3; }
[ -n "$files" ] || { echo "pull-evidence: no files in $host:$remote" >&2; exit 4; }
count=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  name=$(basename "$file")
  if ! timeout 60 scp -q -p "${ssh_opts[@]}" "$host:$file" "$local_dir/$name" 2>/tmp/pull-evidence.$$; then
    if grep -q "subsystem request failed" /tmp/pull-evidence.$$; then
      timeout 60 scp -q -O -p "${ssh_opts[@]}" "$host:$file" "$local_dir/$name"
    else cat /tmp/pull-evidence.$$ >&2; rm -f /tmp/pull-evidence.$$; exit 5; fi
  fi
  count=$((count + 1))
done <<< "$files"
rm -f /tmp/pull-evidence.$$
echo "pulled $count file(s) from $host:$remote into $local_dir"
ls -la "$local_dir"
