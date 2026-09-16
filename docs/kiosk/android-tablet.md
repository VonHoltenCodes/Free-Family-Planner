# Android tablet / Fire tablet

Any Android tablet (Fire tablets included — install Fully Kiosk from its APK or the Amazon store)
works as the wall display.

1. **Serve the planner** somewhere the tablet can reach: a hosted install (`https://…`), or a box
   on your LAN running `python3 tools/serve.py --host 0.0.0.0` / the Docker image.
2. Install **Fully Kiosk Browser** (recommended) or use Chrome.
3. Fully Kiosk settings that matter:
   - *Start URL*: your planner URL
   - *Kiosk mode*: on (locks the tablet to the page)
   - *Keep screen on*: on; *Screen off timer / Screensaver*: set a schedule if you like
   - *Reload on network reconnect*: on
   - *Motion detection → wake on motion*: nice for hallway installs
   - *Autostart on boot*: on
4. Sign in once (the hosted login cookie lasts as long as the planner's configured lifetime, and with
   Google connected on the server there is no Google sign-in on the display at all).

**Why a kiosk browser rather than plain Chrome.** The planner watches itself — stale feeds and a
stalled clock get it reloaded — but if the browser's renderer hangs, the page's own code stops with
it and nothing inside can recover. These four Fully Kiosk settings cover exactly that:

| Setting | Why |
|---|---|
| *Keep screen on* | a dozing tablet stops fetching and shows a stale frame; this is the reliable version of the page's own wake lock |
| *Reload on network reconnect* | comes back by itself after the Wi-Fi drops |
| *Restart app on crash* / *Watchdog* | recovers a hung renderer, which the page cannot do |
| *Scheduled reload* (say 4 AM) | a belt-and-braces version of the planner's own nightly refresh |
5. Mount it. Portrait or landscape — the layout follows the screen.

**Google Calendar + LAN hosting:** Google only accepts `http://localhost` or an `https://` origin for
sign-in. On a LAN install without https, calendar sign-in from the tablet will be refused. Options:
put the LAN server behind https (a reverse proxy with a local CA or a real domain), or use a hosted
install for the tablet. Firestore lists, meals, chores, WeatherStar and the NWS temp are unaffected.

**Plain Chrome instead of Fully Kiosk:** open the URL, tap the ⛶ button in the header for
fullscreen, and add the page to the home screen. Chrome will drop fullscreen after a reboot; Fully
Kiosk does not.
