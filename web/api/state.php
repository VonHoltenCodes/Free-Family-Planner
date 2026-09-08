<?php
/**
 * Free Family Planner - read-only snapshot for home hubs (hosted installs).
 *   PUT  (JSON body)  — the signed-in wall display publishes its snapshot (session required)
 *   GET                — returns it; allowed with the login session OR ?token=<FP_STATE_TOKEN>
 *                        (define FP_STATE_TOKEN in includes/auth_config.php to let Home Assistant poll)
 * Without a snapshot yet, derives what it can from the self-hosted sync store.
 */
define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
header('Content-Type: application/json'); header('Cache-Control: no-store');
$signedIn = isset($_SESSION['fp_authenticated']) && $_SESSION['fp_authenticated'] === true;
$tokenOk = defined('FP_STATE_TOKEN') && FP_STATE_TOKEN !== '' && isset($_GET['token']) && hash_equals(FP_STATE_TOKEN, (string)$_GET['token']);
$dir = __DIR__ . '/../includes/data'; $file = "$dir/state.json";
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    if (!$signedIn) { http_response_code(401); echo '{"error":"not signed in"}'; exit; }
    $snap = json_decode(file_get_contents('php://input'), true);
    if (!is_array($snap) || !isset($snap['meals'])) { http_response_code(400); echo '{"error":"bad snapshot"}'; exit; }
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    if (file_put_contents($file, json_encode($snap, JSON_UNESCAPED_SLASHES), LOCK_EX) === false) { http_response_code(500); echo '{"error":"not writable"}'; exit; }
    echo '{"ok":true}'; exit;
}
if (!$signedIn && !$tokenOk) { http_response_code(401); echo '{"error":"sign in or pass ?token="}'; exit; }
$snap = is_file($file) ? json_decode(file_get_contents($file), true) : null;
if (!is_array($snap)) {
    if (defined('FP_TIMEZONE') && FP_TIMEZONE !== '') @date_default_timezone_set(FP_TIMEZONE);
    $FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    $db = is_file("$dir/planner.json") ? json_decode(file_get_contents("$dir/planner.json"), true) : [];
    $d = $db['data'] ?? []; $today = $FULL[(int)date('w')]; $meals = $d['settings']['weeklyMeals'] ?? [];
    $lst = function ($col) use ($d) { $items = array_values($d[$col] ?? []); usort($items, fn($a, $b) => strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? ''));
        return ['open' => count(array_filter($items, fn($i) => empty($i['completed']))), 'total' => count($items), 'items' => array_map(fn($i) => ['text' => $i['text'] ?? '', 'completed' => !empty($i['completed'])], $items)]; };
    $kids = []; $cfg = @file_get_contents(__DIR__ . '/../config.js');
    if ($cfg && preg_match('/export default (\{.*\});/s', $cfg, $m)) { $c = json_decode($m[1], true); foreach (($c['family']['kids'] ?? []) as $k) $kids[$k['id']] = $k['name'] ?? $k['id']; }
    $chores = [];
    foreach (($d['chores'] ?? []) as $kid => $doc) { $items = array_values(array_filter($doc['items'] ?? [], fn($c) => !empty($c['text'])));
        $chores[$kid] = ['name' => $kids[$kid] ?? $kid, 'done' => count(array_filter($items, fn($c) => !empty($c['completed']))), 'total' => count($items), 'items' => array_map(fn($c) => ['text' => $c['text'], 'completed' => !empty($c['completed'])], $items)]; }
    $todayKey = date('Y-m-d'); $evs = array_values(array_filter($d['events'] ?? [], fn($e) => ($e['end'] ?? '') >= $todayKey)); usort($evs, fn($a, $b) => strcmp($a['start'] ?? '', $b['start'] ?? ''));
    $evs = array_map(fn($e) => ['summary' => $e['summary'] ?? '', 'calendar' => 'Family', 'allDay' => !empty($e['allDay']), 'start' => $e['start'] ?? null, 'end' => $e['end'] ?? null, 'location' => $e['location'] ?? ''], array_slice($evs, 0, 8));
    $week = []; foreach ($FULL as $k) $week[$k] = $meals[$k] ?? '';
    $snap = ['updatedAt' => null, 'source' => 'store', 'family' => (object)[], 'meals' => ['today' => $meals[$today] ?? '', 'todayName' => $today, 'week' => $week],
             'shopping' => $lst('shopping'), 'notes' => $lst('notes'), 'chores' => (object)$chores, 'events' => $evs, 'weather' => null];
}
echo json_encode($snap, JSON_UNESCAPED_SLASHES);
