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

**The exact Fully settings, by their internal names** (what the remote admin API and `ffp wall settings`
show; the search box at the top of Fully's settings finds each one by its label):

| Key | Value | Label in Fully |
|---|---|---|
| `startURL` | your planner URL | Start URL |
| `kioskMode` | true | Enable Kiosk Mode (set a PIN too) |
| `keepScreenOn` | true | Keep Screen On |
| `launchOnBoot` | true | Launch on Boot |
| `restartOnCrash` | true | Restart After Crash |
| `timeToRestartUnresponsiveWebview` | 120 | Restart on Unresponsiveness (seconds) — the hung-renderer cure |
| `reloadOnInternet` | true | Auto Reload on Internet Reconnect |
| `reloadOnScreenOn` | true | Auto Reload on Screen On |
| `showActionBar`, `showAddressBar` | false | Show Action Bar / Show Address Bar — otherwise they take the top of the screen |
| `remoteAdmin`, `remoteAdminLan` | true | Remote Administration — see below |

Kiosk mode, the restart options and remote admin are PLUS features: they run unlicensed for evaluation
with a "Please Get a License" watermark over the page. The licence is a one-time purchase per device,
bought inside the app (Settings → Get PLUS License).

**Managing the display from a terminal.** With *Remote Administration* on and a password set, Fully
answers REST calls on port 2323 and `ffp` wraps the useful ones. Put the display in `~/.config/ffp/config.json`:

```json
{ "url": "…", "token": "…", "wall": { "url": "http://192.168.1.50:2323", "password": "…" } }
```

```
ffp wall info                  model, Android + WebView version, licence, kiosk state, current page
ffp wall shot wall.png         screenshot of what is on the screen right now
ffp wall reload                load the start URL again
ffp wall restart | reboot      restart Fully / reboot the device (reboot needs root or device-owner)
ffp wall screen on|off
ffp wall settings [match]      every Fully setting, or those whose key contains `match`
ffp wall set <key> <value>     change one (true/false picks the boolean setter)
ffp wall cmd <command> [k=v…]  any other remote-admin command, e.g. `ffp wall cmd textToSpeech text=Dinner`
```

The planner's own health (`ffp state | jq .health`) tells you what the page thinks; `ffp wall` tells
you what the device thinks. When the two disagree, the device is right.

**Google Calendar + LAN hosting:** Google only accepts `http://localhost` or an `https://` origin for
sign-in. On a LAN install without https, calendar sign-in from the tablet will be refused. Options:
put the LAN server behind https (a reverse proxy with a local CA or a real domain), or use a hosted
install for the tablet. Firestore lists, meals, chores, WeatherStar and the NWS temp are unaffected.

**Plain Chrome instead of Fully Kiosk:** open the URL, tap the ⛶ button in the header for
fullscreen, and add the page to the home screen. Chrome will drop fullscreen after a reboot; Fully
Kiosk does not.
