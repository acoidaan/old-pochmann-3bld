#!/bin/bash
# Gets the end-to-end tests ready in Claude Code cloud sessions: their npm packages, and a Chromium the
# pinned Playwright accepts (the container brings its own, often of another revision, in /opt/pw-browsers).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}/tests"
npm install --no-audit --no-fund

SRC=/opt/pw-browsers
[ -d "$SRC" ] || exit 0
DEST="$HOME/.cache/pw-browsers-tests"
mkdir -p "$DEST"
for d in "$SRC"/*; do ln -sfn "$d" "$DEST/$(basename "$d")"; done

# The revision this Playwright asks for, e.g. `wanted chromium-headless-shell` → 1194.
wanted() { node -e "console.log(require('./node_modules/playwright-core/browsers.json').browsers.find((b) => b.name === '$1').revision)"; }

# If the container lacks that revision, the one it has, under the name and layout Playwright looks for.
alias_rev() {
  local name=$1 rev=$2 have inner out
  [ -n "$rev" ] && [ ! -e "$SRC/$name-$rev" ] || return 0
  have=$(ls -d "$SRC/$name"-[0-9]* 2>/dev/null | sort -V | tail -1 || true)
  [ -n "$have" ] || return 0
  inner=$(find "$have" -mindepth 1 -maxdepth 1 -type d | head -1)
  out="$DEST/$name-$rev/chrome-linux"
  rm -rf "$DEST/$name-$rev"
  mkdir -p "$out"
  for f in "$inner"/*; do ln -sfn "$f" "$out/"; done
  [ -e "$inner/chrome-headless-shell" ] && ln -sfn "$inner/chrome-headless-shell" "$out/headless_shell"
  return 0
}
alias_rev chromium "$(wanted chromium)"
alias_rev chromium_headless_shell "$(wanted chromium-headless-shell)"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PLAYWRIGHT_BROWSERS_PATH=\"$DEST\"" >> "$CLAUDE_ENV_FILE"
fi
