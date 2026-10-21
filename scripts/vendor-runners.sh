#!/usr/bin/env bash
# Copy the three runner skills into the core plugin so agentic-tests needs no user-level skills.
#   scripts/vendor-runners.sh [source skills dir, default ~/.agents/skills]
# Rewrites plugins/agentic-tests/runners/VENDORED.md with upstream, version and sha256 per file.
# ego-browser keeps only SKILL.md and references/ (its learnings/ scrapers and installer are not needed).
set -euo pipefail
src=${1:-$HOME/.agents/skills}
here=$(cd "$(dirname "$0")/.." && pwd); out="$here/plugins/agentic-tests/runners"
for name in ego-browser test-by-mcpc-cli test-by-maestro; do [ -f "$src/$name/SKILL.md" ] || { echo "missing $src/$name/SKILL.md" >&2; exit 2; }; done
rm -rf "$out/ego-browser" "$out/test-by-mcpc-cli" "$out/test-by-maestro"; mkdir -p "$out"
copy() { # name paths...
  local name=$1; shift
  for p in "$@"; do mkdir -p "$out/$name/$(dirname "$p")"; cp -R "$src/$name/$p" "$out/$name/$(dirname "$p")/"; done
}
copy ego-browser SKILL.md references
copy test-by-mcpc-cli SKILL.md references
copy test-by-maestro SKILL.md references
{
  echo "# Vendored runner documentation"
  echo
  echo "Copied from the author's skills by scripts/vendor-runners.sh on $(date -u +%Y-%m-%d). Do not edit here; edit the source skill, run the script, then rebuild (node scripts/build.mjs)."
  echo
  echo "| Runner | Upstream | Source skill |"
  echo "|---|---|---|"
  echo "| ego-browser | https://github.com/citrolabs/ego-lite (third party; check its license before this repository is made public) | ~/.agents/skills/ego-browser |"
  echo "| test-by-mcpc-cli | https://github.com/yigitkonur/skills-by-yigitkonur/tree/main/skills/test-by-mcpc-cli | ~/.agents/skills/test-by-mcpc-cli |"
  echo "| test-by-maestro | https://github.com/yigitkonur/skills-by-yigitkonur/tree/main/skills/test-by-maestro | ~/.agents/skills/test-by-maestro |"
  echo
  echo '```text'
  (cd "$out" && find ego-browser test-by-mcpc-cli test-by-maestro -type f | sort | while read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done)
  echo '```'
} > "$out/VENDORED.md"
echo "vendored $(find "$out" -type f | wc -l | tr -d ' ') files into $out"
