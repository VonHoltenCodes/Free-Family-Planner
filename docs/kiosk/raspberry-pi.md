# Raspberry Pi + Chromium

A Pi 4 / Pi 5 (or any small Linux box with a desktop) driving a TV or monitor.

```sh
sudo apt install -y git python3 chromium-browser
git clone https://github.com/VonHoltenCodes/Free-Family-Planner.git ~/Free-Family-Planner
cd ~/Free-Family-Planner
cp web/config.example.js web/config.js && nano web/config.js
# WeatherStar bundle (needs Node 18+ once; or copy web/ws4kp/ from another machine / the Docker image)
sudo apt install -y nodejs npm && tools/build-ws4kp.sh
```

Run the server as a service and Chromium as a kiosk on the same Pi:
```sh
sudo cp tools/systemd/family-planner.service tools/systemd/family-planner-kiosk.service /etc/systemd/system/
sudo nano /etc/systemd/system/family-planner.service        # set User= and WorkingDirectory=
sudo nano /etc/systemd/system/family-planner-kiosk.service  # same, plus the URL if the server is elsewhere
sudo systemctl daemon-reload
sudo systemctl enable --now family-planner family-planner-kiosk
```

Because Chromium opens `http://localhost:8765/`, Google Calendar sign-in works on the Pi (localhost is
an allowed OAuth origin). Add `http://localhost:8765` to *Authorized JavaScript origins* on your
OAuth client. Sign in once with a keyboard/mouse plugged in; Chromium remembers it.

Tips:
- Portrait TV: rotate the output in `raspi-config` / Screen Configuration; the layout follows.
- Hide the mouse cursor: `sudo apt install unclutter` and add `unclutter -idle 1 &` to your autostart.
- Screen blanking: `xset s off -dpms` in autostart, or let Fully-style schedules come from the
  *Configuration* feature (roadmap).
