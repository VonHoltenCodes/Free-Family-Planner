#!/usr/bin/env bash
# Build the bundled WeatherStar 4000+ (netbymatt/ws4kp, MIT) into web/ws4kp/.
# Uses $WS4KP_REPO if you already have a clone (with node_modules), otherwise clones upstream
# at $WS4KP_REF (default v6.2.6) into a temp dir and runs `npm ci`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REF="${WS4KP_REF:-v6.2.6}"
TMP="$(mktemp -d)"
if [ -n "${WS4KP_REPO:-}" ] && [ -d "$WS4KP_REPO/node_modules" ]; then
  WT="$TMP/ws4kp"
  git -C "$WS4KP_REPO" worktree add -f "$WT" "$REF"
  ln -sfn "$WS4KP_REPO/node_modules" "$WT/node_modules"
  CLEANUP="git -C $WS4KP_REPO worktree remove --force $WT"
else
  WT="$TMP/ws4kp"
  git clone --depth 1 --branch "$REF" https://github.com/netbymatt/ws4kp.git "$WT"
  ( cd "$WT" && npm ci --no-audit --no-fund )
  CLEANUP="true"
fi
( cd "$WT" && npx gulp buildDist )
rsync -a --delete "$WT/dist/" "$HERE/web/ws4kp/"
# ws4kp assumes it lives at the site root; we live in a subfolder → make its two root-relative paths page-relative
sed -i 's#`/data/\${#`data/${#g' "$HERE/web/ws4kp/resources/ws.min.js"
sed -i 's#`/images/maps/radar/#`images/maps/radar/#g; s#"/images/maps/radar/#"images/maps/radar/#g' "$HERE/web/ws4kp/resources/ws.min.js"
$CLEANUP; rm -rf "$TMP"
echo "web/ws4kp/ built from ws4kp $REF"
