# Local-host mode: Docker image, systemd unit, Pi/Android kiosk guides

Tracking issue: #1 · Branch: `feat/local-host`

## Goal
tools/serve.py already runs the planner with no web host and no login page. Finish the local-host story:
- Dockerfile + compose (serve web/, build ws4kp in the image)
- systemd unit for a Pi / mini PC that boots straight into the display
- Kiosk guides: Fully Kiosk / Android tablet, Raspberry Pi + Chromium, Fire tablet
- Document the Google OAuth origin rule (localhost or https only) and the https-on-LAN options

## Design notes
_(to be filled in as the feature takes shape)_

## Checklist
- [ ] design agreed in #1
- [ ] implementation
- [ ] README / ROADMAP updated
