<?php
/**
 * Free Family Planner - home hub proxy (hosted installs). Mirrors tools/serve.py's /api/hub.php.
 * Hub URL + token live in includes/data/hub.json (never served, never in config.js). Session-gated.
 *   GET  ?op=get | test | entities | states&ids=a,b | todo
 *   POST ?op=save {type,url,token?,todoEntity} | todo-add {text} | todo-set {uid,completed} | todo-remove {uid}
 */
define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
header('Content-Type: application/json'); header('Cache-Control: no-store');
if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) { http_response_code(401); echo '{"error":"not signed in"}'; exit; }
$dir = __DIR__ . '/../includes/data'; $file = "$dir/hub.json";
$hub = is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
$op = $_GET['op'] ?? ''; $body = $_SERVER['REQUEST_METHOD'] === 'POST' ? (json_decode(file_get_contents('php://input'), true) ?: []) : [];
$out = function ($code, $o) { http_response_code($code); echo json_encode($o, JSON_UNESCAPED_SLASHES); exit; };
$DOMAINS = ['camera', 'media_player', 'fan', 'alarm_control_panel', 'climate', 'sensor', 'binary_sensor', 'person', 'lock', 'switch', 'light', 'cover', 'weather', 'device_tracker', 'input_boolean'];

function hub_req($method, $url, $token, $body = null) {
    $opts = ['http' => ['method' => $method, 'timeout' => 10, 'ignore_errors' => true, 'header' => "Content-Type: application/json\r\n" . ($token ? "Authorization: Bearer $token\r\n" : '')]];
    if ($body !== null) $opts['http']['content'] = json_encode($body);
    $raw = @file_get_contents($url, false, stream_context_create($opts));
    $code = 0; foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
    if ($raw === false) throw new Exception('hub unreachable');
    if ($code >= 400) throw new Exception("hub HTTP $code: " . substr($raw, 0, 120));
    return $raw === '' ? [] : json_decode($raw, true);
}
try {
    if ($op === 'get') $out(200, ['type' => $hub['type'] ?? 'none', 'url' => $hub['url'] ?? '', 'hasToken' => !empty($hub['token']), 'todoEntity' => $hub['todoEntity'] ?? 'todo.shopping_list']);
    if ($op === 'save') {
        if (!in_array($body['type'] ?? '', ['none', 'homeassistant', 'homeio'], true)) $out(400, ['error' => 'bad type']);
        $new = ['type' => $body['type'], 'url' => trim($body['url'] ?? ''), 'todoEntity' => trim($body['todoEntity'] ?? '') ?: 'todo.shopping_list', 'token' => !empty($body['token']) ? $body['token'] : ($hub['token'] ?? '')];
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        if (file_put_contents($file, json_encode($new), LOCK_EX) === false) $out(500, ['error' => 'not writable']);
        @chmod($file, 0600); $out(200, ['ok' => true]);
    }
    $type = $hub['type'] ?? 'none'; $url = rtrim($hub['url'] ?? '', '/'); $tok = $hub['token'] ?? ''; $todo = $hub['todoEntity'] ?? 'todo.shopping_list';
    if ($type === 'none' || $url === '') $out(502, ['error' => 'no hub configured']);
    if ($type === 'homeio') {
        $devs = hub_req('GET', "$url/api/devices", $tok);
        $map = function ($d) { $t = strtolower($d['type'] ?? $d['device_type'] ?? 'sensor'); $dom = str_contains($t, 'thermo') ? 'climate' : ((str_contains($t, 'plug') || str_contains($t, 'switch')) ? 'switch' : ((str_contains($t, 'door') || str_contains($t, 'motion')) ? 'binary_sensor' : 'sensor'));
            $st = is_array($d['state'] ?? null) ? ($d['state']['value'] ?? $d['state']['temperature'] ?? $d['state']['on'] ?? null) : ($d['state'] ?? null);
            return ['id' => 'homeio.' . ($d['id'] ?? ''), 'name' => $d['name'] ?? ($d['id'] ?? ''), 'domain' => $dom, 'deviceClass' => $t, 'unit' => $d['unit'] ?? null, 'state' => $st, 'attrs' => is_array($d['state'] ?? null) ? $d['state'] : (object)[]]; };
        $ents = array_map($map, is_array($devs) ? $devs : []);
        if ($op === 'test') $out(200, ['ok' => true, 'message' => 'Home-IO reachable — ' . count($ents) . ' devices']);
        if ($op === 'entities') $out(200, ['entities' => $ents]);
        if ($op === 'states') { $ids = array_filter(explode(',', $_GET['ids'] ?? '')); $st = []; foreach ($ents as $e) if (in_array($e['id'], $ids, true)) $st[$e['id']] = ['state' => $e['state'], 'unit' => $e['unit'], 'name' => $e['name'], 'deviceClass' => $e['deviceClass'], 'attrs' => $e['attrs'], 'updated' => null]; $out(200, ['states' => (object)$st]); }
        if ($op === 'calendars') $out(200, ['calendars' => []]);
        if ($op === 'calevents') $out(200, ['events' => []]);
        if ($op === 'call') { $dev = explode('.', $body['entity'] ?? '', 2)[1] ?? ''; $cmd = ['toggle' => 'toggle', 'turn_on' => 'on', 'turn_off' => 'off', 'lock' => 'lock', 'unlock' => 'unlock', 'open' => 'open', 'close' => 'close'][$body['action'] ?? ''] ?? null; if (!$cmd) $out(400, ['error' => 'unknown action']); hub_req('POST', "$url/api/devices/$dev/command", $tok, ['command' => $cmd]); $out(200, ['ok' => true]); }
        $out(502, ['error' => 'Home-IO has no to-do list']);
    }
    // Home Assistant
    if ($op === 'test') { $r = hub_req('GET', "$url/api/", $tok); $c = hub_req('GET', "$url/api/config", $tok); $out(200, ['ok' => true, 'message' => trim(($r['message'] ?? 'ok') . ' — ' . ($c['location_name'] ?? 'Home Assistant') . ' ' . ($c['version'] ?? ''))]); }
    if ($op === 'entities' || $op === 'states') {
        $states = hub_req('GET', "$url/api/states", $tok); $ids = array_filter(explode(',', $_GET['ids'] ?? '')); $ents = []; $st = [];
        foreach ($states as $s) { $eid = $s['entity_id'] ?? ''; $dom = explode('.', $eid)[0]; $a = $s['attributes'] ?? [];
            if ($op === 'entities') { if (in_array($dom, $DOMAINS, true)) $ents[] = ['id' => $eid, 'name' => $a['friendly_name'] ?? $eid, 'domain' => $dom, 'deviceClass' => $a['device_class'] ?? null, 'unit' => $a['unit_of_measurement'] ?? null, 'state' => $s['state'] ?? null]; }
            elseif (in_array($eid, $ids, true)) { $keep = []; foreach (['temperature', 'current_temperature', 'hvac_action', 'target_temp_high', 'target_temp_low', 'brightness', 'battery_level', 'media_title', 'media_artist', 'source', 'percentage'] as $k) if (isset($a[$k])) $keep[$k] = $a[$k];
                $st[$eid] = ['state' => $s['state'] ?? null, 'unit' => $a['unit_of_measurement'] ?? null, 'name' => $a['friendly_name'] ?? null, 'deviceClass' => $a['device_class'] ?? null, 'attrs' => (object)$keep, 'updated' => $s['last_updated'] ?? null]; } }
        if ($op === 'entities') { usort($ents, fn($x, $y) => strcasecmp($x['name'], $y['name'])); $out(200, ['entities' => $ents]); }
        $out(200, ['states' => (object)$st]);
    }
    if ($op === 'calendars') { $cs = hub_req('GET', "$url/api/calendars", $tok); $out(200, ['calendars' => array_map(fn($c) => ['id' => $c['entity_id'], 'name' => $c['name'] ?? $c['entity_id']], is_array($cs) ? $cs : [])]); }
    if ($op === 'calevents') { $ent = preg_replace('/[^a-z0-9_.]/', '', $_GET['entity'] ?? ''); $ev = hub_req('GET', "$url/api/calendars/$ent?start=" . rawurlencode($_GET['start'] ?? '') . '&end=' . rawurlencode($_GET['end'] ?? ''), $tok); $out(200, ['events' => is_array($ev) ? $ev : []]); }
    if ($op === 'camera') { $ent = preg_replace('/[^a-z0-9_.]/', '', $_GET['entity'] ?? ''); $ctx = stream_context_create(['http' => ['timeout' => 15, 'ignore_errors' => true, 'header' => "Authorization: Bearer $tok\r\n"]]); $img = @file_get_contents("$url/api/camera_proxy/$ent", false, $ctx); if ($img === false || $img === '') $out(502, ['error' => 'camera unavailable']); $ct = 'image/jpeg'; foreach ($http_response_header ?? [] as $h) if (stripos($h, 'Content-Type:') === 0) $ct = trim(substr($h, 13)); header("Content-Type: $ct"); echo $img; exit; }
    if ($op === 'call') { $ent = $body['entity'] ?? ''; $dom = explode('.', $ent)[0]; $act = $body['action'] ?? '';
        $svc = ['toggle' => [in_array($dom, ['light', 'switch', 'input_boolean', 'fan'], true) ? $dom : 'homeassistant', 'toggle'], 'turn_on' => [$dom, 'turn_on'], 'turn_off' => [$dom, 'turn_off'], 'lock' => ['lock', 'lock'], 'unlock' => ['lock', 'unlock'], 'open' => ['cover', 'open_cover'], 'close' => ['cover', 'close_cover']][$act] ?? null;
        if (!$svc) $out(400, ['error' => 'unknown action']); hub_req('POST', "$url/api/services/{$svc[0]}/{$svc[1]}", $tok, ['entity_id' => $ent]); $out(200, ['ok' => true]); }
    if ($op === 'todo') { $r = hub_req('POST', "$url/api/services/todo/get_items?return_response", $tok, ['entity_id' => $todo]); $items = $r['service_response'][$todo]['items'] ?? [];
        $out(200, ['items' => array_map(fn($i) => ['uid' => $i['uid'] ?? null, 'text' => $i['summary'] ?? '', 'completed' => ($i['status'] ?? '') === 'completed'], $items)]); }
    if ($op === 'todo-add') { hub_req('POST', "$url/api/services/todo/add_item", $tok, ['entity_id' => $todo, 'item' => $body['text']]); $out(200, ['ok' => true]); }
    if ($op === 'todo-set') { hub_req('POST', "$url/api/services/todo/update_item", $tok, ['entity_id' => $todo, 'item' => $body['uid'], 'status' => !empty($body['completed']) ? 'completed' : 'needs_action']); $out(200, ['ok' => true]); }
    if ($op === 'todo-remove') { hub_req('POST', "$url/api/services/todo/remove_item", $tok, ['entity_id' => $todo, 'item' => [$body['uid']]]); $out(200, ['ok' => true]); }
    $out(400, ['error' => 'unknown op']);
} catch (Exception $e) { $out(502, ['error' => $e->getMessage()]); }
