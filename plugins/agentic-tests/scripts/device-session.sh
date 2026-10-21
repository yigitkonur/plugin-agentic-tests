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
# Never touches devices it did not create or boot, never addresses another device's serial, never erases a device.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
platform=ios; name=""; app_id=""; app=""; host=local; device_type=""
while [ $# -gt 0 ]; do case "$1" in
  --platform) platform=$2; shift 2 ;; --name) name=$2; shift 2 ;; --app-id) app_id=$2; shift 2 ;;
  --app) app=$2; shift 2 ;; --host) host=$2; shift 2 ;; --device-type) device_type=$2; shift 2 ;;
  *) echo "device-session: unknown option $1" >&2; exit 2 ;; esac; done
[ -n "$name" ] && [ -n "$app_id" ] || { echo "device-session: --name and --app-id are required" >&2; exit 2; }
case "$name" in agentic-tests-*) ;; *) echo "device-session: device names must start with agentic-tests- so other projects' devices are never touched" >&2; exit 2 ;; esac

run() { # run a shell snippet on the device host, with the Maestro/Android toolchain loaded
  if [ "$host" = local ]; then bash -c "source '$here/maestro-env.sh'; $1"
  else { cat "$here/maestro-env.sh"; printf '%s\n' "$1"; } | "$here/timeout.sh" 900 ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'bash -l -s'; fi
}
log() { echo "[device-session $(date -u +%H:%M:%S)] $*"; }

booted_by_me=false; created_by_me=false; device=""; device_udid=""
on_exit() { # runs on every exit, including a failed boot: what this session booted or created goes away with it
  rc=$?; trap - EXIT
  if [ "$booted_by_me" = true ] && [ -n "$device" ]; then
    log "shutting down $device (booted by this session)"
    if [ "$platform" = ios ]; then run "xcrun simctl shutdown $device" >/dev/null 2>&1; else run "adb -s $device emu kill" >/dev/null 2>&1; fi
  fi
  if [ "$created_by_me" = true ]; then # only devices this session created, named agentic-tests-*
    log "deleting $name (created by this session)"
    if [ "$platform" = ios ]; then [ -n "$device_udid" ] && run "xcrun simctl delete '$device_udid'" >/dev/null 2>&1; else sleep 3; run "avdmanager delete avd -n '$name'" >/dev/null 2>&1; fi
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 0' TERM INT

copy_app() { # prints the app path on the device host
  if [ "$host" = local ]; then echo "$app"; return; fi
  run "mkdir -p /tmp/agentic-tests-apps" >/dev/null
  "$here/timeout.sh" 300 scp -q -r -o BatchMode=yes "$app" "$host:/tmp/agentic-tests-apps/" || return 1
  echo "/tmp/agentic-tests-apps/$(basename "$app")"
}

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
    created_by_me=true; device_udid=$device
  fi
  [[ "$device" =~ ^[0-9A-F-]{36}$ ]] || { log "could not find or create simulator $name: $device"; exit 3; }
  state=$(run "xcrun simctl list devices --json" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).devices; for (const list of Object.values(d)) for (const x of list) if (x.udid===process.argv[1]) console.log(x.state)' "$device")
  if [ "$state" != Booted ]; then log "booting $device"; run "xcrun simctl boot $device" || { log "boot failed"; exit 3; }; booted_by_me=true; fi
  run "xcrun simctl bootstatus $device -b" >/dev/null || { log "simulator did not finish booting"; exit 3; }
  if [ -n "$app" ]; then
    remote_app=$(copy_app) || { log "app copy failed"; exit 3; }
    log "installing $app_id"; run "xcrun simctl install $device '$remote_app'" || { log "install failed"; exit 3; }
  fi
else
  run "command -v adb >/dev/null && command -v emulator >/dev/null && command -v avdmanager >/dev/null" || { log "Android SDK tools (adb, emulator, avdmanager) are missing on $host: run android-setup.sh --host $host"; exit 3; }
  # An emulator of this name that an earlier session left running is ours to reuse; no other serial is ever used.
  device=$(run 'for s in $(adb devices | awk '"'"'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1}'"'"'); do [ "$(adb -s $s emu avd name 2>/dev/null | head -1 | tr -d "\r")" = '"'$name'"' ] && echo $s; done' | head -1)
  if [ -n "$device" ]; then booted_by_me=true; log "reusing running emulator $device"; else
    if ! run "avdmanager list avd -c" | grep -qx "$name"; then
      image=$(run 'arch=$(uname -m); case $arch in arm64|aarch64) abi=arm64-v8a ;; *) abi=x86_64 ;; esac; ls -d "$ANDROID_HOME"/system-images/android-*/google_apis/$abi 2>/dev/null | sort -V | tail -1')
      [ -n "$image" ] || { log "no google_apis system image installed on $host: run android-setup.sh --host $host"; exit 3; }
      pkg=$(printf '%s' "$image" | sed 's#.*/system-images/#system-images;#; s#/#;#g')
      log "creating AVD $name from $pkg"
      run "echo no | avdmanager create avd -n '$name' -k '$pkg' -d pixel_6" >/dev/null || { log "AVD creation failed"; exit 3; }
      created_by_me=true
      # The default data partition is 6-10 GB and the emulator wants twice that free; a test app needs far less.
      run "f=\"\$HOME/.android/avd/$name.avd/config.ini\"; grep -q '^disk.dataPartition.size' \"\$f\" && sed -i.bak 's/^disk.dataPartition.size=.*/disk.dataPartition.size=3G/' \"\$f\" || echo 'disk.dataPartition.size=3G' >> \"\$f\"; rm -f \"\$f.bak\"" >/dev/null
    fi
    port=$(run 'for p in $(seq 5560 2 5584); do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 || lsof -nP -iTCP:$((p+1)) -sTCP:LISTEN >/dev/null 2>&1 || { echo $p; break; }; done')
    [ -n "$port" ] || { log "no free emulator port in 5560-5584"; exit 3; }
    device="emulator-$port"
    log "starting emulator $name on port $port"
    run "nohup emulator -avd '$name' -port $port -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics >/tmp/$name-emulator.log 2>&1 &" ; booted_by_me=true
    run "timeout 300 adb -s $device wait-for-device && timeout 300 bash -c 'until [ \"\$(adb -s $device shell getprop sys.boot_completed 2>/dev/null | tr -d \"\\r\")\" = 1 ]; do sleep 2; done'" || { log "emulator did not boot (see /tmp/$name-emulator.log on $host)"; exit 3; }
  fi
  actual=$(run "adb -s $device emu avd name 2>/dev/null | head -1 | tr -d '\r'")
  [ "$actual" = "$name" ] || { log "$device is AVD '$actual', not $name; refusing to use it"; exit 3; }
  if [ -n "$app" ]; then
    remote_app=$(copy_app) || { log "app copy failed"; exit 3; }
    log "installing $app_id"; run "adb -s $device install -r '$remote_app'" || { log "install failed"; exit 3; }
  fi
fi

echo "DEVICE_ID=$device"
log "checking Maestro can see $device"
if ! run "timeout 180 maestro --device $device hierarchy --compact >/dev/null 2>&1"; then log "maestro could not read the device"; exit 3; fi
echo "MAESTRO_DEVICE_READY $device $platform $host"
while true; do sleep 3600 & wait $!; done
