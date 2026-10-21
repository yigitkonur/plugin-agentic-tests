#!/usr/bin/env bash
# Choose where mobile tests run. Probes this machine, then every non-wildcard Host in
# ~/.ssh/config in alphabetical order, read-only, 15 seconds each. Prints one JSON object:
#   {"chosen": "local"|"<host>", "reason": "...", "android": {"chosen", "reason", "needs_setup"}, "hosts": [...]}
# iOS choice: this machine when it is a capable Mac (Xcode, Maestro, Java 17+, at least one simulator);
# otherwise the first capable Mac alphabetically; otherwise the first reachable Mac (tooling gets installed there).
# Android choice: this machine when it can run an emulator under Maestro (adb, emulator, Maestro, Java 17+);
# otherwise the first such host alphabetically; otherwise the iOS choice with needs_setup=true (android-setup.sh
# installs the SDK there). A host that has adb but no Java cannot run Maestro and is never chosen.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
probe='os=$(uname -s); x=$(xcode-select -p 2>/dev/null || true); m=$(command -v maestro || ls "$HOME/.maestro/bin/maestro" 2>/dev/null || true);
j=$( (/usr/libexec/java_home -v 17+ 2>/dev/null) || (ls -d /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/lib/jvm/*-17* /usr/lib/jvm/*-21* 2>/dev/null | head -1) || true);
s=$( [ -n "$x" ] && xcrun simctl list devices available 2>/dev/null | grep -c -E "iPhone|iPad" || echo 0);
a=$(command -v adb || ls "$HOME/Library/Android/sdk/platform-tools/adb" "$HOME/Android/Sdk/platform-tools/adb" 2>/dev/null | head -1 || true);
e=$(command -v emulator || ls "$HOME/Library/Android/sdk/emulator/emulator" "$HOME/Android/Sdk/emulator/emulator" 2>/dev/null | head -1 || true);
printf "AT|%s|%s|%s|%s|%s|%s|%s\n" "$os" "$x" "$m" "$j" "$s" "$a" "$e"'

json_host() { # host reachable os xcode maestro java sims adb emulator
  local darwin=false; [ "$3" = Darwin ] && darwin=true
  printf '{"host":"%s","reachable":%s,"darwin":%s,"xcode":"%s","maestro":"%s","java":"%s","simulators":%s,"android":"%s","emulator":"%s"}' \
    "$1" "$2" "$darwin" "$4" "$5" "$6" "${7:-0}" "$8" "$9"
}
capable() { [ "$1" = Darwin ] && [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] && [ "${5:-0}" -gt 0 ]; }
android_ok() { [ -n "$1" ] && [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ]; } # adb emulator maestro java

entries=(); chosen=""; reason=""; first_mac=""; achosen=""; areason=""
IFS='|' read -r _ os x m j s a e < <(bash -c "$probe" | grep '^AT|' | tail -1)
entries+=("$(json_host local true "$os" "$x" "$m" "$j" "$s" "$a" "$e")")
if capable "$os" "$x" "$m" "$j" "$s"; then chosen=local; reason="this machine is a Mac with Xcode, Maestro, Java 17+ and simulators"; fi
if android_ok "$a" "$e" "$m" "$j"; then achosen=local; areason="this machine has adb, an emulator, Maestro and Java 17+"; fi
[ "$os" = Darwin ] && first_mac=local

hosts=$(awk 'tolower($1)=="host" { for (i = 2; i <= NF; i++) if ($i !~ /[*?!]/) print $i }' "$HOME/.ssh/config" 2>/dev/null | sort -u)
for host in $hosts; do
  line=$(printf '%s\n' "$probe" | "$here/timeout.sh" 15 ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" 'bash -l -s' 2>/dev/null | grep '^AT|' | tail -1)
  if [ -z "$line" ]; then entries+=("$(json_host "$host" false "" "" "" "" 0 "" "")"); continue; fi
  IFS='|' read -r _ os x m j s a e <<< "$line"
  entries+=("$(json_host "$host" true "$os" "$x" "$m" "$j" "$s" "$a" "$e")")
  if [ -z "$chosen" ] && capable "$os" "$x" "$m" "$j" "$s"; then chosen=$host; reason="first Mac alphabetically with Xcode, Maestro, Java 17+ and simulators"; fi
  if [ -z "$achosen" ] && android_ok "$a" "$e" "$m" "$j"; then achosen=$host; areason="first host alphabetically with adb, an emulator, Maestro and Java 17+"; fi
  [ -z "$first_mac" ] && [ "$os" = Darwin ] && first_mac=$host
done
if [ -z "$chosen" ] && [ -n "$first_mac" ]; then chosen=$first_mac; reason="no fully capable Mac; first reachable Mac, tooling must be installed there"; fi
[ -z "$chosen" ] && reason="no reachable Mac: iOS needs a Mac"
needs_setup=false
if [ -z "$achosen" ]; then
  if [ -n "$first_mac" ]; then achosen=$first_mac; needs_setup=true; areason="no host runs an Android emulator under Maestro yet; android-setup.sh installs the SDK on this Mac ($first_mac)"
  else areason="no host with an Android emulator and no Mac to install one on"; fi
fi
printf '{"chosen":"%s","reason":"%s","android":{"chosen":"%s","reason":"%s","needs_setup":%s},"hosts":[%s]}\n' "$chosen" "$reason" "$achosen" "$areason" "$needs_setup" "$(IFS=,; echo "${entries[*]}")"
