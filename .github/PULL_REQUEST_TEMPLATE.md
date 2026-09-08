## What this changes

## Why

## How I tested it
- [ ] `node --check` on changed modules
- [ ] Portrait and landscape, no overlaps
- [ ] Local-host mode (`tools/serve.py` / Docker)
- [ ] Hosted mode (PHP) — if it touches a server endpoint or the login gate
- [ ] On a real touch device — if it touches input

## Checklist
- [ ] No secrets or real family data (grep for `apiKey` / `apps.googleusercontent` in tracked files)
- [ ] New colours are tokens; new controls have focus, keyboard and ARIA
- [ ] README / ROADMAP / docs updated if behaviour changed
