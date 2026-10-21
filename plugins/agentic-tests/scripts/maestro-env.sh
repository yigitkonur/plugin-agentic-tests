# Toolchain for Maestro and the Android SDK. Source it (bash or zsh), or send it over ssh ahead of a command:
#   { cat maestro-env.sh; echo "<command>"; } | ssh <host> 'bash -l -s'
# Agent, ssh and MCP shells skip profile files, so nothing here can be assumed to be on PATH already.
# No shell globs on purpose: zsh aborts a command line whose pattern matches nothing.
export PATH="$HOME/.maestro/bin:$PATH"
_at_java_major() { "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -1; }
if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17+ 2>/dev/null)
  if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
    JAVA_HOME=""
    for _at_d in $(find /opt/homebrew/opt /usr/local/opt /usr/lib/jvm -maxdepth 1 \( -name 'openjdk*' -o -name '*-17*' -o -name '*-21*' \) 2>/dev/null | sort -r); do
      for _at_h in "$_at_d/libexec/openjdk.jdk/Contents/Home" "$_at_d"; do
        if [ -x "$_at_h/bin/java" ] && [ "$(_at_java_major "$_at_h")" -ge 17 ] 2>/dev/null; then JAVA_HOME=$_at_h; break 2; fi
      done
    done
  fi
  export JAVA_HOME
fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
if [ -z "${ANDROID_HOME:-}" ]; then
  for _at_d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "${ANDROID_SDK_ROOT:-}"; do
    if [ -n "$_at_d" ] && [ -d "$_at_d" ]; then ANDROID_HOME=$_at_d; break; fi
  done
  export ANDROID_HOME
fi
[ -n "${ANDROID_HOME:-}" ] && export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
command -v timeout >/dev/null 2>&1 || timeout() { # stock Mac or bare remote shell: gtimeout, else perl
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "$@"; else _at_s=$1; shift; perl -e 'alarm shift; exec @ARGV' "$_at_s" "$@"; fi
}
unset _at_d _at_h
