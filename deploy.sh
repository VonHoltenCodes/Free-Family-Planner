#!/usr/bin/env bash
# Publish web/ to your web server over SSH. Reads deploy.env (gitignored) — see deploy.env.example.
# Never touches the server's own files: config.js (seeded on the first deploy, then owned by the ⚙ setup
# wizard), includes/auth_config.php (your login hash) and includes/data/ (sessions, tokens, sync store).
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
# Ship everything except what belongs to the server alone: the login config and the private data
# directory (sessions, hub token, sync store). Other files under includes/ are ours. config.js rides
# along only to seed a first install — the final sync below never overwrites one the server already has.
rsync -a --exclude 'includes/auth_config.php' --exclude 'includes/data/' "$HERE/web/" "$LOCAL_STAGE/"
V="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || date +%s)"
find "$LOCAL_STAGE/assets/js" -name '*.js' -exec sed -i -E "s#(from '\./[a-z0-9_./-]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(import\('\./[a-z0-9_./-]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(from '\.\./\.\./config\.js)#\1#g" {} +
sed -i -E "s#(assets/(css|js)/[a-z-]+\.(css|js))(\?v=[0-9]+)?#\1?v=$V#g" "$LOCAL_STAGE/app.html"
rsync -a --delete "$LOCAL_STAGE/" "$SSH_HOST:$STAGE/"
rm -rf "$LOCAL_STAGE"
if [ -n "${SUDO_PASS:-}" ]; then
  printf '%s\n' "$SUDO_PASS" | ssh "$SSH_HOST" "sudo -S -p '' bash -c '
    set -e
    rsync -a --delete --exclude includes/auth_config.php --exclude includes/data/ --exclude config.js --exclude config.js.bak $STAGE/ $DEST/
    [ -e $DEST/config.js ] || cp -p $STAGE/config.js $DEST/config.js
    chown -R $WEB_USER:$WEB_USER $DEST
    find $DEST -type d -exec chmod 755 {} +; find $DEST -type f -exec chmod 644 {} +
    rm -rf $STAGE'"
else
  ssh "$SSH_HOST" "rsync -a --delete --exclude includes/auth_config.php --exclude includes/data/ --exclude config.js --exclude config.js.bak $STAGE/ $DEST/ && ([ -e $DEST/config.js ] || cp -p $STAGE/config.js $DEST/config.js) && rm -rf $STAGE"
fi
echo "deployed → ${SITE_URL:-$DEST}"
