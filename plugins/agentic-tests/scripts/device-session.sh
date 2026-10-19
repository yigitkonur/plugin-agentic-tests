#!/usr/bin/env bash
# Engine-owned mobile device session for agentic-tests (runtime_type: mobile, readiness: process).
# Boots one dedicated simulator or emulator, installs the app, proves Maestro can see it, prints the
# readiness marker, then stays alive until the engine stops it (SIGTERM), when it shuts down only a
# device it booted itself.
#
#   device-session.sh --platform ios|android --name <device name> --app-id <bundle or package>
#                     [--app <path to .app or .apk>] [--host local|<ssh alias>] [--device-type "<iPhone 17>"]
#
# Prints:  DEVICE_ID=<udid or serial>   then   MAESTRO_DEVICE_READY <device id> <platform> <host>
# Never touches devices it did not create or boot, and never erases a device.
set -uo pipefail
platform=ios; name=""; app_id=""; app=""; host=local; device_type=""
while [ $# -gt 0 ]; do case "$1" in
  --platform) platform=$2; shift 2 ;; --name) name=$2; shift 2 ;; --app-id) app_id=$2; shift 2 ;;
  --app) app=$2; shift 2 ;; --host) host=$2; shift 2 ;; --device-type) device_type=$2; shift 2 ;;
  *) echo "device-session: unknown option $1" >&2; exit 2 ;; esac; done
[ -n "$name" ] && [ -n "$app_id" ] || { echo "device-session: --name and --app-id are required" >&2; exit 2; }
case "$name" in agentic-tests-*) ;; *) echo "device-session: device names must start with agentic-tests- so other projects' devices are never touched" >&2; exit 2 ;; esac

toolchain='export PATH="$HOME/.maestro/bin:$PATH"; if [ -z "${JAVA_HOME:-}" ]; then JAVA_HOME=$( (/usr/libexec/java_home -v 17+ 2>/dev/null) || ls -d /opt/homebrew/opt/openjdk*/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk*/libexec/openjdk.jdk/Contents/Home 2>/dev/null | head -1); export JAVA_HOME; fi; [ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"; export PATH="$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator:$HOME/Android/Sdk/platform-tools:$HOME/Android/Sdk/emulator:$PATH";'
run() { # run a shell snippet on the device host
  if [ "$host" = local ]; then bash -c "$toolchain $1"; else printf '%s\n' "$toolchain $1" | timeout 600 ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'bash -l -s'; fi
}
log() { echo "[device-session $(date -u +%H:%M:%S)] $*"; }

booted_by_me=false; device=""
cleanup() {
  if [ "$booted_by_me" = true ] && [ -n "$device" ]; then
    log "shutting down $device (booted by this session)"
    if [ "$platform" = ios ]; then run "xcrun simctl shutdown $device" >/dev/null 2>&1; else run "adb -s $device emu kill" >/dev/null 2>&1; fi
  fi
  exit 0
}
trap cleanup TERM INT

if [ "$platform" = ios ]; then
  device=$(run "xcrun simctl list devices --json" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).devices; const n=process.argv[1]; for (const list of Object.values(d)) for (const x of list) if (x.name===n && x.isAvailable) { console.log(x.udid); process.exit(0); }' "$name")
  if [ -z "$device" ]; then
    # Newest available iOS runtime, and the newest plain "iPhone N" it supports (or --device-type).
    pick=$(run "xcrun simctl list runtimes --json" | node -e '
      const want = process.argv[1];
      const r = JSON.parse(require("fs").readFileSync(0, "utf8")).runtimes.filter(x => x.isAvailable && x.platform === "iOS")
        .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).at(-1);
      if (!r) process.exit(0);
      const types = (r.supportedDeviceTypes || []).filter(t => want ? t.name === want : /^iPhone \d+$/.test(t.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (types.length) console.log(r.identifier + "|" + types.at(-1).identifier + "|" + types.at(-1).name);' "$device_type")
    [ -n "$pick" ] || { log "no available iOS runtime with a matching iPhone device type on $host"; exit 3; }
    IFS='|' read -r runtime type_id type_name <<< "$pick"
    log "creating simulator $name ($type_name, $runtime)"
    device=$(run "xcrun simctl create '$name' '$type_id' '$runtime'" | tail -1)
  fi
  [[ "$device" =~ ^[0-9A-F-]{36}$ ]] || { log "could not find or create simulator $name: $device"; exit 3; }
  state=$(run "xcrun simctl list devices --json" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).devices; for (const list of Object.values(d)) for (const x of list) if (x.udid===process.argv[1]) console.log(x.state)' "$device")
  if [ "$state" != Booted ]; then log "booting $device"; run "xcrun simctl boot $device" || { log "boot failed"; exit 3; }; booted_by_me=true; fi
  run "xcrun simctl bootstatus $device -b" >/dev/null || { log "simulator did not finish booting"; exit 3; }
  if [ -n "$app" ]; then
    if [ "$host" != local ]; then remote_app="/tmp/agentic-tests-apps/$(basename "$app")"; run "mkdir -p /tmp/agentic-tests-apps"; timeout 300 scp -q -r "$app" "$host:/tmp/agentic-tests-apps/" || { log "app copy failed"; exit 3; }; else remote_app=$app; fi
    log "installing $app_id"; run "xcrun simctl install $device '$remote_app'" || { log "install failed"; exit 3; }
  fi
else
  device=$(run "adb devices | awk 'NR>1 && \$2==\"device\" {print \$1}' | head -1")
  if [ -z "$device" ]; then
    log "starting emulator $name"; run "nohup emulator -avd '$name' -no-window -no-audio -no-boot-anim >/tmp/agentic-tests-emulator.log 2>&1 &"; booted_by_me=true
    run "timeout 300 adb wait-for-device && timeout 300 bash -c 'until [ \"\$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d \"\\r\")\" = 1 ]; do sleep 2; done'" || { log "emulator did not boot"; exit 3; }
    device=$(run "adb devices | awk 'NR>1 && \$2==\"device\" {print \$1}' | head -1")
  fi
  if [ -n "$app" ]; then
    if [ "$host" != local ]; then remote_app="/tmp/agentic-tests-apps/$(basename "$app")"; run "mkdir -p /tmp/agentic-tests-apps"; timeout 300 scp -q "$app" "$host:/tmp/agentic-tests-apps/" || exit 3; else remote_app=$app; fi
    log "installing $app_id"; run "adb -s $device install -r '$remote_app'" || { log "install failed"; exit 3; }
  fi
fi

echo "DEVICE_ID=$device"
log "checking Maestro can see $device"
if ! run "timeout 180 maestro --device $device hierarchy --compact >/dev/null 2>&1"; then log "maestro could not read the device"; exit 3; fi
echo "MAESTRO_DEVICE_READY $device $platform $host"
while true; do sleep 3600 & wait $!; done
