#!/usr/bin/env bash
# Publish web/ to your web server over SSH. Reads deploy.env (gitignored) — see deploy.env.example.
# Never touches includes/ on the server (that is where auth_config.php with your login hash lives).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/deploy.env" ] || { echo "deploy.env missing — copy deploy.env.example and fill it in"; exit 1; }
# shellcheck disable=SC1091
source "$HERE/deploy.env"
: "${SSH_HOST:?}" "${DEST:?}"
WEB_USER="${WEB_USER:-www-data}"
STAGE="${STAGE:-/tmp/family-planner-stage}"
[ -d "$HERE/web/ws4kp/resources" ] || { echo "web/ws4kp/ missing — run tools/build-ws4kp.sh first"; exit 1; }
[ -f "$HERE/web/config.js" ] || { echo "web/config.js missing — copy web/config.example.js and fill it in"; exit 1; }

rsync -a --delete --exclude 'includes/' "$HERE/web/" "$SSH_HOST:$STAGE/"
if [ -n "${SUDO_PASS:-}" ]; then
  printf '%s\n' "$SUDO_PASS" | ssh "$SSH_HOST" "sudo -S -p '' bash -c '
    set -e
    rsync -a --delete --exclude includes/ $STAGE/ $DEST/
    chown -R $WEB_USER:$WEB_USER $DEST
    find $DEST -type d -exec chmod 755 {} +; find $DEST -type f -exec chmod 644 {} +
    rm -rf $STAGE'"
else
  ssh "$SSH_HOST" "rsync -a --delete --exclude includes/ $STAGE/ $DEST/ && rm -rf $STAGE"
fi
echo "deployed → ${SITE_URL:-$DEST}"
