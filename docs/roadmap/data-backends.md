# Data backends: browser-local storage and a self-hosted sync server

Tracking issue: #6 · Branch: `feat/data-backends`

## Goal
store.js is the only place Firestore is touched. Add: browser-local storage (single display, zero setup) and a tiny self-hosted sync server (SQLite, one process) so phones and the wall stay in sync without Google.

## Design notes
- Backend interface (`backends/*.js`): watchList/addListItem/toggleListItem/deleteListItem, watchMeals/saveMeals, watchChores/setChores, watchEvents/putEvent/deleteEvent. `store.js` picks one from `config.backend`.
- Sync store: `GET ?rev=1`, `GET ?all=1`, `PUT ?c=&id=` (JSON body), `DELETE ?c=&id=`; a monotonically increasing `rev`. Same routes in `web/api/db.php` (session-gated, file under `includes/data/`) and in `tools/serve.py` (`data/planner.json`, `FP_DATA_DIR` env, Docker volume). No SQLite dependency on purpose — shared PHP hosts rarely have it.
- Clients poll the revision every 3 s and refetch everything when it changes; the whole dataset is a few KB.
- The `events` collection is reserved for the local calendar provider.

## Checklist
- [x] backend interface + Firestore / sync / local implementations
- [x] sync store in PHP and serve.py (+ Docker volume)
- [x] wizard Data step with tests
- [x] README / ROADMAP updated
