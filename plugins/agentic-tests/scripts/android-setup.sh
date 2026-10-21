#!/usr/bin/env bash
# Idempotent Android toolchain for Maestro on a Mac: command-line tools (Homebrew cask), platform-tools, emulator
# and one google_apis system image under ~/Library/Android/sdk. Accepts the SDK licenses (the user authorised
# emulator setup on hosts the agent can reach). Linux hosts: install the command-line tools yourself and set ANDROID_HOME.
#   android-setup.sh [--host local|<ssh alias>] [--api 35]
# Prints one JSON line: {"ok": true, "sdk": "...", "image": "...", "installed": "..."} and exits 0, or exits 3 with the reason.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
host=local; api=35
while [ $# -gt 0 ]; do
  case "$1" in
    --host) host=$2; shift 2 ;;
    --api) api=$2; shift 2 ;;
    *) echo "android-setup: unknown option $1" >&2; exit 2 ;;
  esac
done
IFS= read -r -d '' body <<'BODY' || true
[ "$(uname -s)" = Darwin ] || { echo "android-setup: only macOS hosts are automated; install the Android command-line tools and set ANDROID_HOME" >&2; exit 3; }
installed=""
case "$(uname -m)" in
  arm64|aarch64) abi=arm64-v8a ;;
  *) abi=x86_64 ;;
esac
sdk="$HOME/Library/Android/sdk"; image="system-images;android-$api;google_apis;$abi"
if ! command -v sdkmanager >/dev/null 2>&1; then
  command -v brew >/dev/null 2>&1 || { [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"; }
  command -v brew >/dev/null 2>&1 || { echo "android-setup: Homebrew is required to install android-commandlinetools" >&2; exit 3; }
  # brew can exit non-zero for an unrelated broken tap after a successful install: judge by the result, not the exit code.
  brew install --cask android-commandlinetools >&2 || true
  [ -x /opt/homebrew/bin/sdkmanager ] && export PATH="/opt/homebrew/bin:$PATH"
  command -v sdkmanager >/dev/null 2>&1 || { echo "android-setup: sdkmanager is still missing after brew install android-commandlinetools" >&2; exit 3; }
  installed="$installed commandlinetools"
fi
mkdir -p "$sdk"
yes | sdkmanager --sdk_root="$sdk" --licenses >/dev/null 2>&1
need=""
# avdmanager only finds system images when it lives inside the SDK it manages, so the SDK gets its own copy of the command-line tools.
[ -x "$sdk/cmdline-tools/latest/bin/avdmanager" ] || need="$need cmdline-tools;latest"
[ -x "$sdk/platform-tools/adb" ] || need="$need platform-tools"
[ -x "$sdk/emulator/emulator" ] || need="$need emulator"
[ -d "$sdk/system-images/android-$api/google_apis/$abi" ] || need="$need $image"
if [ -n "$need" ]; then
  sdkmanager --sdk_root="$sdk" $need >&2 || { echo "android-setup: sdkmanager failed for:$need" >&2; exit 3; }
  installed="$installed$need"
fi
printf '{"ok": true, "sdk": "%s", "image": "%s", "installed": "%s"}\n' "$sdk" "$image" "$(echo $installed)"
BODY
body="api=$api
$body"
if [ "$host" = local ]; then
  bash -c "source '$here/maestro-env.sh'; $body"
else
  { cat "$here/maestro-env.sh"; printf '%s\n' "$body"; } | ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'bash -l -s'
fi
