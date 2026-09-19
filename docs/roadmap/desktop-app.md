# Desktop app for Windows and macOS

Tracking issue: #17 · Branch: `feat/desktop-app`

## Goal
Serve the planner from the Windows or Mac desktop people already have — no Docker, no terminal.
A tray / menu-bar app starts the local-host server and shows the address the tablet should open.

## Design notes
- **Wrap, don't fork.** The app is a thin shell around `tools/serve.py`. Anything the desktop needs
  (data folder location, a status endpoint, port choice) goes into serve.py so Pi and Docker users get it too.
- **Bundle Python, skip Node.** PyInstaller one-folder build with serve.py; the WeatherStar bundle is
  either shipped in the installer (≈28 MB) or downloaded on first run from a release asset.
- **Tray app duties:** start/stop, autostart at login, "Open in browser", "Show QR code" (LAN URL),
  "Open data folder", "Check for updates". Windows: pystray + a small Tk/Qt window; macOS: rumps or
  the same pystray.
- **"Show on this PC" (optional):** a pywebview window pointed at `http://localhost:<port>/` so a
  spare desktop can be the wall display too. Because it is localhost, Google Calendar sign-in works
  there without https. (Watch the pywebview/CSP gotcha noted in the SlowBooks work: the bridge needs
  `'unsafe-eval'` on WKWebView if we ever add a JS bridge; we don't need one.)
- **Data folder:** `%LOCALAPPDATA%\FreeFamilyPlanner\data` on Windows,
  `~/Library/Application Support/FreeFamilyPlanner/data` on macOS — same `planner.json` +
  `config.js` layout as Pi/Docker so a family can move between installs by copying the folder.
- **Signing:** Windows via Azure Trusted Signing in GitHub Actions (same `environment: release`
  federated-credential pattern as EasyAmp/SlowBooks); macOS via Developer ID + notarytool, CI or the
  local Mac build box.
- **Firewall:** the Windows installer should add the inbound rule for the chosen port on private
  networks; on macOS the app firewall prompt is enough.

## Open questions
- Port: keep 8765 or pick per install? (Conflicts are rare; keep 8765, allow override in the tray.)
- Ship ws4kp inside the installer vs first-run download — size vs. offline install.
- Auto-update: GitHub Releases + a version check in the tray, or leave manual for v1?

## Checklist
- [ ] design agreed in #17
- [ ] serve.py: data-folder + port options, `/api/status` for the tray
- [ ] tray app (Windows), tray app (macOS), shared core
- [ ] installers + signing workflows
- [ ] docs/kiosk/desktop.md, README, ROADMAP
