# Contributing to Free Family Planner

Thanks for helping. This is a small, plain project and we'd like to keep it that way: vanilla
HTML/CSS/JS, no build step for the app, and nothing that phones home.

## Ground rules
- **No secrets, ever.** `web/config.js`, `web/includes/auth_config.php` and `deploy.env` are
  gitignored for a reason. Before you push, run `git ls-files | xargs grep -l "apiKey\|apps.googleusercontent"`
  and make sure only `config.example.js` and docs show up. Screenshots for docs use the example
  config, not a real family.
- **Both run modes must keep working**: the local-host install (`tools/serve.py`, Docker) and the
  hosted install (PHP login gate). If you add a server endpoint, add it to both `web/api/*.php`
  and `tools/serve.py`, with the same route and shape.
- **No frameworks, no bundlers.** ES modules loaded straight from `app.html`. Third-party code is
  limited to the Firebase SDK from Google's CDN and the bundled ws4kp build.
- **Keep it accessible**: new controls get a focus style, a keyboard path and an ARIA role/label.
- **Themes are tokens.** Add colours as `:root` tokens in `planner.css`, not literals, so every
  theme picks them up.

## Workflow
1. Open an issue first for anything bigger than a small fix, so we agree on the shape.
2. Branch from `main`: `feat/<short-name>` or `fix/<short-name>`.
3. One PR per feature. Fill in the PR template; say how you tested it.
4. Keep commits readable; squash noise before opening the PR.

## Running it while you work
```sh
tools/build-ws4kp.sh                 # once — WeatherStar bundle (needs Node 18+)
cp web/config.example.js web/config.js
python3 tools/serve.py               # http://localhost:8765/
```
For the hosted mode locally:
```sh
cp web/includes/auth_config.example.php web/includes/auth_config.php   # set a password hash
php -S 127.0.0.1:8769 -t web        # http://127.0.0.1:8769/auth.php
```

## Testing
There is no test framework yet. What we do today, and what a PR should be able to say it did:
- `node --check` every changed module (copy to `.mjs` if your Node complains about `import`).
- Load the page in both orientations (1080×1920 and 1920×1080) and check nothing overlaps;
  headless Firefox or Playwright screenshots are fine.
- Exercise the feature on a real touch device if it involves input.
- For ICS changes, `web/assets/js/ics.js` exports pure functions — a quick Node script against a
  sample feed is enough.

## Layout of the code
| Path | What |
|---|---|
| `web/app.html` | the shell; panels are `<section class="panel" id="p-…">` |
| `web/assets/js/planner.js` | boot, header, calendar UI, lists, meals, chores |
| `web/assets/js/display.js` | per-screen settings, layout engine, themes, night dim |
| `web/assets/js/setup.js` | ⚙ wizard |
| `web/assets/js/calendars.js`, `ics.js`, `gcal.js` | calendar providers |
| `web/assets/js/store.js`, `backends/*` | data backends (sync / firestore / local) |
| `web/assets/js/wx.js`, `wx-card.js` | WeatherStar URL builder, NWS, Open-Meteo card |
| `web/api/*.php`, `tools/serve.py` | the two servers (hosted / local) — keep them in step |
| `docs/roadmap/*.md` | design notes per feature |

## Reporting problems
Use the issue templates. For bugs, the device, browser, run mode (local / hosted) and a screenshot
get us most of the way. Please don't paste your `config.js`; if a value matters, describe it.

## License
By contributing you agree your work is released under the GPL-3.0, like the rest of the project.
