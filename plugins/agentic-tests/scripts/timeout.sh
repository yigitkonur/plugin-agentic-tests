#!/usr/bin/env bash
# timeout.sh <seconds> <command> [args...]   exit 124 (timeout/gtimeout) or 142 (perl fallback) when the limit hits.
# Hosts differ: GNU timeout, Homebrew gtimeout, or neither (a stock Mac, a bare remote shell).
s=${1:?seconds}; shift
if command -v timeout >/dev/null 2>&1; then exec timeout "$s" "$@"; fi
if command -v gtimeout >/dev/null 2>&1; then exec gtimeout "$s" "$@"; fi
exec perl -e 'alarm shift; exec @ARGV or die "timeout.sh: cannot run $ARGV[0]: $!\n"' "$s" "$@"
