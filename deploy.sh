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

# Stage locally and stamp every module import + asset reference with the commit version so the wall
# display never mixes cached old modules with new ones (internal imports have no query string in git).
LOCAL_STAGE="$(mktemp -d)"
rsync -a --exclude 'includes/' "$HERE/web/" "$LOCAL_STAGE/"
V="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || date +%s)"
find "$LOCAL_STAGE/assets/js" -name '*.js' -exec sed -i -E "s#(from '\./[a-z0-9_./-]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(import\('\./[a-z0-9_./-]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(from '\.\./\.\./config\.js)#\1#g" {} +
sed -i -E "s#(assets/(css|js)/[a-z-]+\.(css|js))(\?v=[0-9]+)?#\1?v=$V#g" "$LOCAL_STAGE/app.html"
rsync -a --delete "$LOCAL_STAGE/" "$SSH_HOST:$STAGE/"
rm -rf "$LOCAL_STAGE"
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
