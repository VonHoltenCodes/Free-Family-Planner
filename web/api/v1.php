<?php
/**
 * Free Family Planner - the documented API, hosted installs. Same routes as tools/serve.py's /api/v1
 * (see docs/api.md). Reached as /api/v1/<route> via the .htaccess rewrite.
 * Auth: the page's login session, OR "Authorization: Bearer <FP_API_TOKEN>" (define it in
 * includes/auth_config.php) — for CLIs, agents and automations.
 */
if (!defined('FP_AUTH')) define('FP_AUTH', true);
require_once __DIR__ . '/_access.php';
if (!fp_auth_exists()) { header('Content-Type: application/json'); http_response_code(409); echo json_encode(['error' => 'no login yet — open setup-login.php in a browser first']); exit; }
require_once __DIR__ . '/../includes/auth_config.php';
header('Content-Type: application/json'); header('Cache-Control: no-store');
$tok = defined('FP_API_TOKEN') ? FP_API_TOKEN : '';
$hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$byToken = $tok !== '' && (hash_equals("Bearer $tok", $hdr) || (isset($_GET['token']) && hash_equals($tok, (string)$_GET['token'])));
if (!$byToken) {
    ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
    session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
    if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) { http_response_code(401); echo json_encode(['error' => 'sign in, or send Authorization: Bearer <FP_API_TOKEN>']); exit; }
}
$out = function ($code, $o) { http_response_code($code); echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; };
$m = $_SERVER['REQUEST_METHOD']; $path = trim($_GET['path'] ?? '', '/'); $parts = $path === '' ? [] : explode('/', $path);
$body = in_array($m, ['POST', 'PUT', 'PATCH'], true) ? json_decode(file_get_contents('php://input'), true) : [];
if (in_array($m, ['POST', 'PUT', 'PATCH'], true) && !is_array($body)) $body = [];
$dir = __DIR__ . '/../includes/data'; if (!is_dir($dir)) @mkdir($dir, 0750, true);
$ROUTES = ['GET /api/v1', 'GET|PUT|PATCH /api/v1/access', 'GET|PUT|PATCH /api/v1/config', 'GET|PUT|POST /api/v1/tiles, DELETE /api/v1/tiles/{entity}', 'GET|PUT|PATCH /api/v1/hub', 'GET /api/v1/hub/test', 'GET /api/v1/hub/entities[?domain=]', 'GET /api/v1/hub/states?ids=a,b', 'POST /api/v1/hub/call {entity,action}', 'GET /api/v1/hub/calendars', 'GET|POST|PATCH|DELETE /api/v1/hub/todo', 'GET|POST /api/v1/lists/{shopping|notes}, PATCH|DELETE /api/v1/lists/{col}/{id}', 'GET|PUT|PATCH /api/v1/meals', 'GET /api/v1/chores, GET|PUT /api/v1/chores/{kid}', 'GET|POST /api/v1/events, PUT|PATCH|DELETE /api/v1/events/{id}', 'GET /api/v1/state', 'GET /api/v1/power'];
$CONFIG_KEYS = ['family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather', 'house', 'defaultMode', 'defaultTab', 'power'];

// ---- helpers ----
function cfg_read() { $s = @file_get_contents(__DIR__ . '/../config.js'); if ($s && preg_match('/export default (\{.*\});/s', $s, $mm)) { $c = json_decode($mm[1], true); if (is_array($c)) return $c; } return []; }
function cfg_write($c) { global $CONFIG_KEYS; $clean = []; foreach ($CONFIG_KEYS as $k) if (array_key_exists($k, $c)) $clean[$k] = $c[$k]; $t = __DIR__ . '/../config.js'; if (file_exists($t)) @copy($t, "$t.bak");
    if (file_put_contents($t, "// Free Family Planner — site config (written via the API " . date('c') . ")\nexport default " . json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";\n", LOCK_EX) === false) throw new Exception('config.js is not writable by the web server'); }
function deep_merge($a, $b) { foreach ($b as $k => $v) $a[$k] = (is_array($v) && isset($a[$k]) && is_array($a[$k]) && array_keys($v) !== range(0, count($v) - 1)) ? deep_merge($a[$k], $v) : $v; return $a; }
function hub_read() { global $dir; return is_file("$dir/hub.json") ? (json_decode(file_get_contents("$dir/hub.json"), true) ?: []) : []; }
function hub_req($method, $url, $token, $body = null) { $opts = ['http' => ['method' => $method, 'timeout' => 10, 'ignore_errors' => true, 'header' => "Content-Type: application/json\r\n" . ($token ? "Authorization: Bearer $token\r\n" : '')]]; if ($body !== null) $opts['http']['content'] = json_encode($body);
    $raw = @file_get_contents($url, false, stream_context_create($opts)); $code = 0; foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $x)) $code = (int)$x[1];
    if ($raw === false) throw new Exception('hub unreachable'); if ($code >= 400) throw new Exception("hub HTTP $code: " . substr($raw, 0, 120)); return $raw === '' ? [] : json_decode($raw, true); }
$DOMAINS = ['camera', 'media_player', 'fan', 'alarm_control_panel', 'climate', 'sensor', 'binary_sensor', 'person', 'lock', 'switch', 'light', 'cover', 'weather', 'device_tracker', 'input_boolean'];
$KEEP = ['temperature', 'current_temperature', 'hvac_action', 'target_temp_high', 'target_temp_low', 'brightness', 'battery_level', 'media_title', 'media_artist', 'source', 'percentage', 'thumbnail', 'motion_enabled', 'motion_detected', 'battery', 'last_record', 'brand'];
function ha_states_raw() { $h = hub_read(); if (($h['type'] ?? 'none') !== 'homeassistant') throw new Exception('no Home Assistant hub configured'); return [hub_req('GET', rtrim($h['url'], '/') . '/api/states', $h['token'] ?? ''), $h]; }
function db_load() { global $dir; $db = is_file("$dir/planner.json") ? json_decode(file_get_contents("$dir/planner.json"), true) : []; if (!is_array($db)) $db = []; $db += ['rev' => 0, 'data' => []]; return $db; }
function db_save($db) { global $dir; $db['rev']++; file_put_contents("$dir/planner.json", json_encode($db, JSON_UNESCAPED_SLASHES), LOCK_EX); }
function new_id() { return dechex((int)(microtime(true) * 1000)) . substr(bin2hex(random_bytes(4)), 0, 6); }
function now_iso() { return gmdate('Y-m-d\TH:i:s\Z'); }

try {
    if (!$parts) $out(200, ['name' => 'Free Family Planner API', 'version' => 1, 'docs' => 'https://github.com/VonHoltenCodes/Free-Family-Planner/blob/main/docs/api.md', 'routes' => $ROUTES]);
    $head = $parts[0];
    if ($head === 'config') { $c = cfg_read(); if ($m === 'GET') $out(200, $c); if ($m === 'PUT') { cfg_write($body); $out(200, cfg_read()); } if ($m === 'PATCH') { cfg_write(deep_merge($c, $body)); $out(200, cfg_read()); } $out(405, ['error' => 'GET, PUT or PATCH']); }
    if ($head === 'tiles') { $c = cfg_read(); $tiles = $c['house']['tiles'] ?? [];
        if ($m === 'GET') $out(200, ['tiles' => $tiles]);
        if ($m === 'PUT') { $c['house']['tiles'] = array_is_list($body) ? $body : ($body['tiles'] ?? []); cfg_write($c); $out(200, ['tiles' => $c['house']['tiles']]); }
        if ($m === 'POST') { if (empty($body['entity'])) $out(400, ['error' => 'entity required']); $t = ['entity' => $body['entity'], 'label' => $body['label'] ?? $body['entity'], 'control' => !empty($body['control'])]; if (!empty($body['kind'])) $t['kind'] = $body['kind'];
            $tiles = array_values(array_filter($tiles, fn($x) => ($x['entity'] ?? '') !== $t['entity'])); $tiles[] = $t; $c['house']['tiles'] = $tiles; cfg_write($c); $out(201, ['tiles' => $tiles]); }
        if ($m === 'DELETE' && isset($parts[1])) { $n = count($tiles); $tiles = array_values(array_filter($tiles, fn($x) => ($x['entity'] ?? '') !== $parts[1])); $c['house']['tiles'] = $tiles; cfg_write($c); $out(count($tiles) < $n ? 200 : 404, ['tiles' => $tiles]); }
        $out(405, ['error' => 'GET, PUT, POST or DELETE /tiles/{entity}']); }
    if ($head === 'hub') { $h = hub_read();
        if (count($parts) === 1) {
            if ($m === 'GET') $out(200, ['type' => $h['type'] ?? 'none', 'url' => $h['url'] ?? '', 'hasToken' => !empty($h['token']), 'todoEntity' => $h['todoEntity'] ?? 'todo.shopping_list']);
            if ($m === 'PUT' || $m === 'PATCH') { $type = $body['type'] ?? ($h['type'] ?? 'none'); if (!in_array($type, ['none', 'homeassistant', 'homeio'], true)) $out(400, ['error' => 'type must be none, homeassistant or homeio']);
                foreach (['type', 'url', 'todoEntity', 'token'] as $k) if (isset($body[$k])) $h[$k] = $body[$k]; $h['type'] = $type; file_put_contents("$dir/hub.json", json_encode($h), LOCK_EX); @chmod("$dir/hub.json", 0600); $out(200, ['ok' => true]); }
            $out(405, ['error' => 'GET, PUT or PATCH']); }
        $sub = $parts[1]; $type = $h['type'] ?? 'none'; $url = rtrim($h['url'] ?? '', '/'); $tk = $h['token'] ?? ''; $todo = $h['todoEntity'] ?? 'todo.shopping_list';
        if ($type === 'none' || $url === '') $out(502, ['error' => 'no hub configured']);
        if ($type === 'homeio') { $devs = hub_req('GET', "$url/api/devices", $tk); $map = function ($d) { $t = strtolower($d['type'] ?? $d['device_type'] ?? 'sensor'); $dom = str_contains($t, 'thermo') ? 'climate' : ((str_contains($t, 'plug') || str_contains($t, 'switch')) ? 'switch' : ((str_contains($t, 'door') || str_contains($t, 'motion')) ? 'binary_sensor' : 'sensor')); $st = is_array($d['state'] ?? null) ? ($d['state']['value'] ?? $d['state']['temperature'] ?? $d['state']['on'] ?? null) : ($d['state'] ?? null); return ['id' => 'homeio.' . ($d['id'] ?? ''), 'name' => $d['name'] ?? ($d['id'] ?? ''), 'domain' => $dom, 'deviceClass' => $t, 'unit' => $d['unit'] ?? null, 'state' => $st, 'attrs' => is_array($d['state'] ?? null) ? $d['state'] : (object)[]]; };
            $ents = array_map($map, is_array($devs) ? $devs : []);
            if ($sub === 'test') $out(200, ['ok' => true, 'message' => 'Home-IO reachable — ' . count($ents) . ' devices']);
            if ($sub === 'entities') $out(200, ['entities' => array_values(array_filter($ents, fn($e) => empty($_GET['domain']) || $e['domain'] === $_GET['domain']))]);
            if ($sub === 'states') { $ids = array_filter(explode(',', $_GET['ids'] ?? '')); $st = []; foreach ($ents as $e) if (in_array($e['id'], $ids, true)) $st[$e['id']] = ['state' => $e['state'], 'unit' => $e['unit'], 'name' => $e['name'], 'deviceClass' => $e['deviceClass'], 'attrs' => $e['attrs'], 'updated' => null]; $out(200, ['states' => (object)$st]); }
            if ($sub === 'call' && $m === 'POST') { $dev = explode('.', $body['entity'] ?? '', 2)[1] ?? ''; $cmd = ['toggle' => 'toggle', 'turn_on' => 'on', 'turn_off' => 'off', 'lock' => 'lock', 'unlock' => 'unlock', 'open' => 'open', 'close' => 'close'][$body['action'] ?? ''] ?? null; if (!$cmd) $out(400, ['error' => 'unknown action']); hub_req('POST', "$url/api/devices/$dev/command", $tk, ['command' => $cmd]); $out(200, ['ok' => true]); }
            if ($sub === 'calendars') $out(200, ['calendars' => []]);
            $out(502, ['error' => 'Home-IO has no to-do list']); }
        if ($sub === 'test') { $r = hub_req('GET', "$url/api/", $tk); $c = hub_req('GET', "$url/api/config", $tk); $out(200, ['ok' => true, 'message' => trim(($r['message'] ?? 'ok') . ' — ' . ($c['location_name'] ?? 'Home Assistant') . ' ' . ($c['version'] ?? ''))]); }
        if ($sub === 'entities' || $sub === 'states') { [$states] = ha_states_raw(); $ids = array_filter(explode(',', $_GET['ids'] ?? '')); $ents = []; $st = [];
            foreach ($states as $s) { $eid = $s['entity_id'] ?? ''; $dom = explode('.', $eid)[0]; $a = $s['attributes'] ?? [];
                if ($sub === 'entities') { if (in_array($dom, $DOMAINS, true) && (empty($_GET['domain']) || $dom === $_GET['domain'])) $ents[] = ['id' => $eid, 'name' => $a['friendly_name'] ?? $eid, 'domain' => $dom, 'deviceClass' => $a['device_class'] ?? null, 'unit' => $a['unit_of_measurement'] ?? null, 'state' => $s['state'] ?? null]; }
                elseif (in_array($eid, $ids, true)) { $keep = []; foreach ($KEEP as $k) if (isset($a[$k])) $keep[$k] = $a[$k]; $st[$eid] = ['state' => $s['state'] ?? null, 'unit' => $a['unit_of_measurement'] ?? null, 'name' => $a['friendly_name'] ?? null, 'deviceClass' => $a['device_class'] ?? null, 'attrs' => (object)$keep, 'updated' => $s['last_updated'] ?? null]; } }
            if ($sub === 'entities') { usort($ents, fn($x, $y) => strcasecmp($x['name'], $y['name'])); $out(200, ['entities' => $ents]); } $out(200, ['states' => (object)$st]); }
        if ($sub === 'call' && $m === 'POST') { $ent = $body['entity'] ?? ''; $dom = explode('.', $ent)[0]; $act = $body['action'] ?? '';
            if ($act === 'snapshot') { hub_req('POST', "$url/api/services/blink/trigger_camera", $tk, ['entity_id' => $ent]); $out(200, ['ok' => true]); }
            $svc = ['toggle' => [in_array($dom, ['light', 'switch', 'input_boolean', 'fan'], true) ? $dom : 'homeassistant', 'toggle'], 'turn_on' => [$dom, 'turn_on'], 'turn_off' => [$dom, 'turn_off'], 'lock' => ['lock', 'lock'], 'unlock' => ['lock', 'unlock'], 'open' => ['cover', 'open_cover'], 'close' => ['cover', 'close_cover']][$act] ?? null;
            if (!$svc) $out(400, ['error' => 'unknown action']); hub_req('POST', "$url/api/services/{$svc[0]}/{$svc[1]}", $tk, ['entity_id' => $ent]); $out(200, ['ok' => true]); }
        if ($sub === 'calendars') { try { $cs = hub_req('GET', "$url/api/calendars", $tk); } catch (Exception $e) { if (str_contains($e->getMessage(), '404')) $cs = []; else throw $e; } $out(200, ['calendars' => array_map(fn($c) => ['id' => $c['entity_id'], 'name' => $c['name'] ?? $c['entity_id']], is_array($cs) ? $cs : [])]); }
        if ($sub === 'todo') {
            if ($m === 'GET') { $r = hub_req('POST', "$url/api/services/todo/get_items?return_response", $tk, ['entity_id' => $todo]); $items = $r['service_response'][$todo]['items'] ?? []; $out(200, ['items' => array_map(fn($i) => ['uid' => $i['uid'] ?? null, 'text' => $i['summary'] ?? '', 'completed' => ($i['status'] ?? '') === 'completed'], $items)]); }
            if ($m === 'POST') { hub_req('POST', "$url/api/services/todo/add_item", $tk, ['entity_id' => $todo, 'item' => $body['text'] ?? '']); $out(201, ['ok' => true]); }
            if ($m === 'PATCH') { hub_req('POST', "$url/api/services/todo/update_item", $tk, ['entity_id' => $todo, 'item' => $body['uid'] ?? '', 'status' => ($body['completed'] ?? true) ? 'completed' : 'needs_action']); $out(200, ['ok' => true]); }
            if ($m === 'DELETE') { hub_req('POST', "$url/api/services/todo/remove_item", $tk, ['entity_id' => $todo, 'item' => [$body['uid'] ?? ($_GET['uid'] ?? '')]]); $out(200, ['ok' => true]); } }
        $out(404, ['error' => 'unknown hub route']); }
    if (in_array($head, ['lists', 'meals', 'chores', 'events'], true)) { $db = db_load(); $d = &$db['data'];
        if ($head === 'lists') { $col = $parts[1] ?? ''; if (!in_array($col, ['shopping', 'notes'], true)) $out(404, ['error' => 'lists/shopping or lists/notes']); $d[$col] = $d[$col] ?? [];
            if ($m === 'GET') { $items = []; foreach ($d[$col] as $k => $v) $items[] = ['id' => $k] + $v; usort($items, fn($a, $b) => strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? '')); $out(200, ['items' => $items]); }
            if ($m === 'POST') { if (!isset($body['text'])) $out(400, ['error' => 'text required']); $i = new_id(); $d[$col][$i] = ['text' => $body['text'], 'completed' => false, 'createdAt' => now_iso()]; db_save($db); $out(201, ['id' => $i] + $d[$col][$i]); }
            $id = $parts[2] ?? ''; if (!isset($d[$col][$id])) $out(404, ['error' => 'unknown list item']);
            if ($m === 'PATCH') { foreach (['text', 'completed'] as $k) if (array_key_exists($k, $body)) $d[$col][$id][$k] = $body[$k]; db_save($db); $out(200, ['id' => $id] + $d[$col][$id]); }
            if ($m === 'DELETE') { unset($d[$col][$id]); db_save($db); $out(200, ['ok' => true]); } }
        if ($head === 'meals') { $cur = $d['settings']['weeklyMeals'] ?? []; if ($m === 'GET') $out(200, (object)$cur); if ($m === 'PUT') $cur = $body; elseif ($m === 'PATCH') $cur = array_merge($cur, $body); else $out(405, ['error' => 'GET, PUT or PATCH']); $d['settings']['weeklyMeals'] = $cur; db_save($db); $out(200, (object)$cur); }
        if ($head === 'chores') { $kid = $parts[1] ?? null;
            if ($m === 'GET') { if ($kid) $out(200, $d['chores'][$kid] ?? ['items' => []]); $o = []; foreach (($d['chores'] ?? []) as $k => $v) $o[$k] = $v['items'] ?? []; $out(200, (object)$o); }
            if ($kid && $m === 'PUT') { $d['chores'][$kid] = ['items' => array_is_list($body) ? $body : ($body['items'] ?? [])]; db_save($db); $out(200, $d['chores'][$kid]); } $out(405, ['error' => 'GET, or PUT /chores/{kid}']); }
        if ($head === 'events') { $d['events'] = $d['events'] ?? [];
            if ($m === 'GET') { $o = []; foreach ($d['events'] as $k => $v) $o[] = ['id' => $k] + $v; $out(200, ['events' => $o]); }
            if ($m === 'POST') { foreach (['summary', 'start', 'end'] as $k) if (!isset($body[$k])) $out(400, ['error' => "$k required"]); $i = new_id(); $d['events'][$i] = ['summary' => $body['summary'], 'location' => $body['location'] ?? '', 'description' => $body['description'] ?? '', 'allDay' => !empty($body['allDay']), 'start' => $body['start'], 'end' => $body['end'], 'updatedAt' => now_iso()]; db_save($db); $out(201, ['id' => $i] + $d['events'][$i]); }
            $id = $parts[1] ?? ''; if (!isset($d['events'][$id])) $out(404, ['error' => 'unknown event']);
            if ($m === 'PUT' || $m === 'PATCH') { foreach (['summary', 'location', 'description', 'allDay', 'start', 'end'] as $k) if (array_key_exists($k, $body)) $d['events'][$id][$k] = $body[$k]; $d['events'][$id]['updatedAt'] = now_iso(); db_save($db); $out(200, ['id' => $id] + $d['events'][$id]); }
            if ($m === 'DELETE') { unset($d['events'][$id]); db_save($db); $out(200, ['ok' => true]); } } }
    if ($head === 'access') {
        $c = fp_auth_read_constants();
        if ($m === 'GET') $out(200, ['mode' => 'hosted', 'username' => $c['FP_USERNAME'] ?? '', 'hasApiToken' => !empty($c['FP_API_TOKEN']), 'hasStateToken' => !empty($c['FP_STATE_TOKEN']), 'sessionDays' => (int)(($c['FP_SESSION_LIFETIME'] ?? 604800) / 86400)]);
        if ($m === 'PUT' || $m === 'PATCH') {
            if ($byToken && (isset($body['password']) || isset($body['username']))) $out(403, ['error' => 'changing the login needs the site login, not the API token']);
            $resp = ['ok' => true];
            if (isset($body['username'])) { if (!preg_match('/^[A-Za-z0-9._@-]{2,64}$/', $body['username'])) $out(400, ['error' => 'bad username']); $c['FP_USERNAME'] = $body['username']; }
            if (isset($body['password'])) { if (strlen($body['password']) < 8) $out(400, ['error' => 'password must be at least 8 characters']); $c['FP_PASSWORD_HASH'] = password_hash($body['password'], PASSWORD_DEFAULT); }
            if (array_key_exists('apiToken', $body)) { $t = $body['apiToken']; if ($t === 'generate') { $t = bin2hex(random_bytes(24)); $resp['apiToken'] = $t; } $c['FP_API_TOKEN'] = $t === null ? '' : $t; }
            if (array_key_exists('stateToken', $body)) { $t = $body['stateToken']; if ($t === 'generate') { $t = bin2hex(random_bytes(16)); $resp['stateToken'] = $t; } $c['FP_STATE_TOKEN'] = $t === null ? '' : $t; }
            if (isset($body['sessionDays'])) $c['FP_SESSION_LIFETIME'] = max(1, (int)$body['sessionDays']) * 86400;
            fp_auth_write($c); $out(200, $resp);
        }
        $out(405, ['error' => 'GET, PUT or PATCH']);
    }
    if ($head === 'state' && $m === 'GET') { define('FP_API_INTERNAL', true); include __DIR__ . '/state.php'; exit; }
    if ($head === 'power' && $m === 'GET') { define('FP_API_INTERNAL', true); include __DIR__ . '/power.php'; exit; }
    $out(404, ['error' => 'unknown route — GET /api/v1 lists them']);
} catch (Exception $e) { $out(502, ['error' => $e->getMessage()]); }
