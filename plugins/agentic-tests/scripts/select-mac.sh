#!/usr/bin/env bash
# Choose where mobile tests run. Probes this machine, then every non-wildcard Host in
# ~/.ssh/config in alphabetical order, read-only, 15 seconds each. Prints one JSON object:
#   {"chosen": "local"|"<host>", "reason": "...", "android": {"chosen", "reason"}, "hosts": [...]}
# iOS choice: this machine when it is a capable Mac (Xcode, Maestro, Java 17+, at least one simulator);
# otherwise the first capable Mac alphabetically; otherwise the first reachable Mac (tooling gets installed there).
# Android choice: this machine when it has adb and Maestro; otherwise the first such host alphabetically.
set -uo pipefail
probe='os=$(uname -s); x=$(xcode-select -p 2>/dev/null || true); m=$(command -v maestro || ls "$HOME/.maestro/bin/maestro" 2>/dev/null || true);
j=$( (/usr/libexec/java_home -v 17+ 2>/dev/null) || (ls -d /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk*/libexec/openjdk.jdk/Contents/Home 2>/dev/null | head -1) || true);
s=$( [ -n "$x" ] && xcrun simctl list devices available 2>/dev/null | grep -c -E "iPhone|iPad" || echo 0);
a=$(command -v adb || ls "$HOME/Library/Android/sdk/platform-tools/adb" 2>/dev/null || true);
printf "AT|%s|%s|%s|%s|%s|%s\n" "$os" "$x" "$m" "$j" "$s" "$a"'

json_host() { # host reachable os xcode maestro java sims adb
  local darwin=false; [ "$3" = Darwin ] && darwin=true
  printf '{"host":"%s","reachable":%s,"darwin":%s,"xcode":"%s","maestro":"%s","java":"%s","simulators":%s,"android":"%s"}' \
    "$1" "$2" "$darwin" "$4" "$5" "$6" "${7:-0}" "$8"
}
capable() { [ "$1" = Darwin ] && [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] && [ "${5:-0}" -gt 0 ]; }
android_ok() { [ -n "$1" ] && [ -n "$2" ]; }

entries=(); chosen=""; reason=""; first_mac=""; achosen=""; areason=""
IFS='|' read -r _ os x m j s a < <(bash -c "$probe" | grep '^AT|' | tail -1)
entries+=("$(json_host local true "$os" "$x" "$m" "$j" "$s" "$a")")
if capable "$os" "$x" "$m" "$j" "$s"; then chosen=local; reason="this machine is a Mac with Xcode, Maestro, Java 17+ and simulators"; fi
if android_ok "$a" "$m"; then achosen=local; areason="this machine has adb and Maestro"; fi
[ "$os" = Darwin ] && first_mac=local

hosts=$(awk 'tolower($1)=="host" { for (i = 2; i <= NF; i++) if ($i !~ /[*?!]/) print $i }' "$HOME/.ssh/config" 2>/dev/null | sort -u)
for host in $hosts; do
  line=$(printf '%s\n' "$probe" | timeout 15 ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'bash -l -s' 2>/dev/null | grep '^AT|' | tail -1)
  if [ -z "$line" ]; then entries+=("$(json_host "$host" false "" "" "" "" 0 "")"); continue; fi
  IFS='|' read -r _ os x m j s a <<< "$line"
  entries+=("$(json_host "$host" true "$os" "$x" "$m" "$j" "$s" "$a")")
  if [ -z "$chosen" ] && capable "$os" "$x" "$m" "$j" "$s"; then chosen=$host; reason="first Mac alphabetically with Xcode, Maestro, Java 17+ and simulators"; fi
  if [ -z "$achosen" ] && android_ok "$a" "$m"; then achosen=$host; areason="first host alphabetically with adb and Maestro"; fi
  [ -z "$first_mac" ] && [ "$os" = Darwin ] && first_mac=$host
done
if [ -z "$chosen" ] && [ -n "$first_mac" ]; then chosen=$first_mac; reason="no fully capable Mac; first reachable Mac, tooling must be installed there"; fi
[ -z "$chosen" ] && reason="no reachable Mac: iOS needs a Mac (Android can still run on a Linux host with an SDK)"
[ -z "$achosen" ] && areason="no host with adb and Maestro"
printf '{"chosen":"%s","reason":"%s","android":{"chosen":"%s","reason":"%s"},"hosts":[%s]}\n' "$chosen" "$reason" "$achosen" "$areason" "$(IFS=,; echo "${entries[*]}")"
