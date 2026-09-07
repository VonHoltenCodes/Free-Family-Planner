# Docker on a home server

Run the planner server on a NAS, mini PC or anything with Docker, then point any screen at it.

```sh
git clone https://github.com/VonHoltenCodes/Free-Family-Planner.git && cd Free-Family-Planner
cp web/config.example.js web/config.js && $EDITOR web/config.js
docker compose up -d            # builds the WeatherStar bundle inside the image (takes a minute)
```
Open `http://<server>:8765/` from the wall device. `web/config.js` is bind-mounted read-only, so
edit it and `docker compose restart` to apply.

- Rebuild after pulling updates: `docker compose build --pull && docker compose up -d`
- Change the port: edit `ports:` in `docker-compose.yml`
- No login page in this mode — it is meant for a trusted home LAN. Do not port-forward it; use the
  hosted (PHP) install if you want the planner reachable from outside.
- Google Calendar sign-in needs `http://localhost` or an `https://` origin (see the Android guide).
