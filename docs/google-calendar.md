# Google Calendar

Two ways to connect, chosen in ⚙ Setup → Calendars.

| | Server-held (recommended) | In this browser |
|---|---|---|
| Who holds the connection | your server, as a refresh token | the browser tab |
| Asks anyone to sign in | once, ever | again whenever the token lapses (about an hour on some devices) |
| Survives a reload / reboot | yes | no |
| Works from any address | yes | only `http://localhost` or `https://` |
| Needs a client secret | yes | no |

A wall display should use the server-held connection. Nobody stands at it to tap "sign in", and
Google's silent in-page renewal does not answer on some tablets — which is exactly how a display
ends up parked on a sign-in screen.

## Setting up the server-held connection

**1. In the Google Cloud console** (console.cloud.google.com), with your project selected:
- **APIs & Services → Library →** enable **Google Calendar API** (once per project).
- **APIs & Services → Credentials →** open your **OAuth 2.0 Client ID** of type *Web application*
  (or create one). Copy the **Client ID** and the **Client secret**.
- In that same client, under **Authorised redirect URIs**, add the URL the wizard shows you, exactly.
  It looks like `https://example.com/family-planner/api/google-callback.php`, or
  `http://planner.local:8765/api/google-callback.php` for a local install. Save.
- **APIs & Services → OAuth consent screen:** if the app is in *Testing*, add the Google account you
  will connect under **Test users**. Refresh tokens for apps left in Testing expire after **7 days**,
  so publish the app (**Publish app** → it stays "unverified", which is fine for your own account)
  if you want the connection to last.

**2. In the planner:** ⚙ Setup → Calendars → Google → *On the server* → paste the client ID and
secret → **Connect Google**. You are taken to Google's consent screen once; approving it sends you
back and the server stores the refresh token in its private data folder. The wizard then shows
`✓ connected as you@example.com`.

From then on the server mints access tokens as needed. The display never talks to Google.

## Everyday behaviour
- The calendar picker in the header lists the connected account's calendars; new events, edits and
  deletions from the wall go to the selected one.
- The display refreshes events every 15 minutes.
- If Google ever rejects the stored token (you revoked access, or a *Testing* app's token expired),
  the wizard's Calendars step shows the reason, and the calendar panel says Google is not connected.
  Press **Connect Google** again.

## Things worth knowing
- The **client secret and refresh token never reach the page**. They live in
  `includes/data/google.json` (hosted) or `data/google.json` (local), mode 600, and the web server
  refuses to serve that folder.
- To hand the planner to someone else, or to stop it reading your calendar: ⚙ Setup → Calendars →
  **Disconnect**, and/or remove it at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- If Google comes back without a refresh token (it only issues one on a fresh grant), remove the app
  at that same permissions page and connect again.
- Read-only alternatives that need no Google project at all: an **iCal/ICS feed** (your calendar's
  "secret address in iCal format"), or a **Home Assistant calendar**. Both are in the same step.
