# Local-host mode: Docker image, systemd unit, Pi/Android kiosk guides

Tracking issue: #1 · Branch: `feat/local-host`

## Goal
tools/serve.py already runs the planner with no web host and no login page. Finish the local-host story:
- Dockerfile + compose (serve web/, build ws4kp in the image)
- systemd unit for a Pi / mini PC that boots straight into the display
- Kiosk guides: Fully Kiosk / Android tablet, Raspberry Pi + Chromium, Fire tablet
- Document the Google OAuth origin rule (localhost or https only) and the https-on-LAN options

## Design notes
- The image serves `web/` with `tools/serve.py`; `config.js` is bind-mounted so the image stays generic.
- No login gate in local mode by design (trusted LAN). Hosted mode keeps the PHP gate.
- Google OAuth origin rule (localhost or https) is the one real limitation of LAN hosting; documented in every guide.

## Checklist
- [x] Dockerfile (multi-stage: builds ws4kp) + docker-compose.yml
- [x] systemd units: server + Chromium kiosk
- [x] docs/kiosk: Android/Fire tablet, Raspberry Pi, Docker
- [x] README / ROADMAP updated
