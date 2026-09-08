<?php
/**
 * Free Family Planner - self-hosted sync store (hosted installs).
 * A locked JSON file under includes/data/ (never web-readable). Session-gated like the app.
 *   GET  ?rev=1            -> {"rev": n}
 *   GET  ?all=1            -> {"rev": n, "data": {collection: {id: doc}}}
 *   PUT  ?c=<col>&id=<id>  (JSON body) -> {"rev": n}
 *   DELETE ?c=<col>&id=<id>            -> {"rev": n}
 */
if (!defined('FP_AUTH')) define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
header('Content-Type: application/json'); header('Cache-Control: no-store');
if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) { http_response_code(401); echo '{"error":"not signed in"}'; exit; }

$dir = __DIR__ . '/../includes/data'; $file = "$dir/planner.json";
if (!is_dir($dir)) @mkdir($dir, 0750, true);
$fh = fopen($file, 'c+'); if (!$fh) { http_response_code(500); echo '{"error":"data dir not writable"}'; exit; }
flock($fh, LOCK_EX);
$raw = stream_get_contents($fh); $db = json_decode($raw ?: '{}', true); if (!is_array($db)) $db = [];
$db += ['rev' => 0, 'data' => []];
$ok = ['notes', 'shopping', 'settings', 'chores', 'events'];
$m = $_SERVER['REQUEST_METHOD']; $c = $_GET['c'] ?? ''; $id = $_GET['id'] ?? '';
$write = function () use ($fh, &$db) { ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($db, JSON_UNESCAPED_SLASHES)); fflush($fh); };
if ($m === 'GET' && isset($_GET['all'])) { echo json_encode(['rev' => $db['rev'], 'data' => (object)$db['data']]); }
elseif ($m === 'GET') { echo json_encode(['rev' => $db['rev']]); }
elseif (($m === 'PUT' || $m === 'DELETE') && in_array($c, $ok, true) && preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $id)) {
    if ($m === 'PUT') { $doc = json_decode(file_get_contents('php://input'), true); if (!is_array($doc)) { http_response_code(400); echo '{"error":"bad body"}'; flock($fh, LOCK_UN); exit; } $db['data'][$c][$id] = $doc; }
    else { unset($db['data'][$c][$id]); }
    $db['rev']++; $write(); echo json_encode(['rev' => $db['rev']]);
} else { http_response_code(400); echo '{"error":"bad request"}'; }
flock($fh, LOCK_UN); fclose($fh);
