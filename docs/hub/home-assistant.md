# Home Assistant: the planner as sensors

The planner publishes a small read-only snapshot at **`/api/state`** — tonight's dinner, open
shopping items, chores done per kid, the next events, and the outside temperature. Home
Assistant's built-in [`rest` sensor](https://www.home-assistant.io/integrations/sensor.rest/)
polls it; nothing to install.

Where it lives:
- **Local-host / Docker / desktop installs:** `http://<planner-host>:8765/api/state` (no token; it is your LAN).
- **Hosted (PHP) installs:** `https://…/family-planner/api/state.php?token=…` — set `FP_STATE_TOKEN`
  in `includes/auth_config.php` first.

The wall display refreshes the snapshot once a minute and a few seconds after any change. Until a
display has published, the server answers from the self-hosted sync store (meals, lists, chores,
local calendar — no Google events or weather in that case).

## What you get
```json
{
  "updatedAt": "2026-09-08T17:02:11.000Z",
  "meals":    { "today": "Tacos", "todayName": "Tuesday", "week": { "Sunday": "…", "Monday": "…", "…": "…" } },
  "shopping": { "open": 3, "total": 5, "items": [ { "text": "Milk", "completed": false } ] },
  "notes":    { "open": 1, "total": 1, "items": [ … ] },
  "chores":   { "alex": { "name": "Alex", "done": 1, "total": 3, "items": [ … ] } },
  "events":   [ { "summary": "Soccer practice", "calendar": "School", "allDay": false, "start": "2026-09-08T22:00:00.000Z", "end": "…", "location": "" } ],
  "weather":  { "temp": 82, "cond": "CLEAR", "units": "us", "provider": "weatherstar" }
}
```

## configuration.yaml
```yaml
rest:
  - resource: http://planner.local:8765/api/state      # hosted: https://…/api/state.php?token=YOUR_TOKEN
    scan_interval: 60
    sensor:
      - name: "Dinner tonight"
        value_template: "{{ value_json.meals.today or 'not planned' }}"
        json_attributes_path: "$.meals"
        json_attributes: [week, todayName]
      - name: "Shopping list open items"
        value_template: "{{ value_json.shopping.open }}"
        json_attributes_path: "$.shopping"
        json_attributes: [items]
      - name: "Alex chores done"
        value_template: "{{ value_json.chores.alex.done }}/{{ value_json.chores.alex.total }}"
      - name: "Next family event"
        value_template: "{{ value_json.events[0].summary if value_json.events else 'none' }}"
        json_attributes_path: "$.events[0]"
        json_attributes: [start, end, calendar, location]
      - name: "Planner outside temperature"
        value_template: "{{ value_json.weather.temp if value_json.weather else 'unknown' }}"
        unit_of_measurement: "°F"
```
Restart Home Assistant (or reload REST entities) and the sensors appear. Use them like any other:

```yaml
automation:
  - alias: "Chore reminder"
    trigger: { platform: time, at: "18:00:00" }
    condition: "{{ states('sensor.alex_chores_done') != '3/3' }}"
    action: { service: notify.kitchen_speaker, data: { message: "Alex, chores before dinner!" } }
```

## Home-IO and anything else
It is plain JSON over HTTP — any hub, dashboard or script can read it. Two-way shopping-list sync
and a House panel on the wall are the next steps on the [roadmap](../../ROADMAP.md).
