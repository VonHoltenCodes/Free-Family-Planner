<?php
/**
 * Free Family Planner - writes config.js from the ⚙ setup wizard (hosted installs).
 * Requires the same login session as index.php, so only a signed-in family member can change it.
 * The web server user must be able to write this folder (config.js + config.js.bak).
 */

define('FP_AUTH', true);
require_once __DIR__ . '/includes/auth_config.php';

ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME);
session_set_cookie_params(FP_SESSION_LIFETIME);
session_start();

header('Content-Type: application/json');
header('Cache-Control: no-store');

if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) {
    http_response_code(401); echo json_encode(['error' => 'not signed in']); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'POST only']); exit;
}

$raw = file_get_contents('php://input');
$cfg = json_decode($raw, true);
if (!is_array($cfg) || !isset($cfg['family']) || !isset($cfg['location'])) {
    http_response_code(400); echo json_encode(['error' => 'invalid config']); exit;
}
// keep only the keys the app knows about; everything is plain data, no code
$allowed = ['family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather'];
$clean = [];
foreach ($allowed as $k) { if (array_key_exists($k, $cfg)) $clean[$k] = $cfg[$k]; }

$target = __DIR__ . '/config.js';
$src = "// Free Family Planner — site config (written by the ⚙ setup wizard " . date('c') . ")\n"
     . "export default " . json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . ";\n";
if (file_exists($target)) @copy($target, $target . '.bak');
if (file_put_contents($target, $src, LOCK_EX) === false) {
    http_response_code(500); echo json_encode(['error' => 'config.js is not writable by the web server']); exit;
}
echo json_encode(['ok' => true]);
