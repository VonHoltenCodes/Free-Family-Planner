<?php
/**
 * Free Family Planner - ICS feed proxy (hosted installs). Most calendar hosts block browser
 * fetches with CORS, so the page asks this endpoint instead. Session-gated, and only URLs that
 * appear in config.js are allowed (no open proxy).
 */
if (!defined('FP_AUTH')) define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
header('Cache-Control: no-store');
if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) { http_response_code(401); exit('not signed in'); }
$url = $_GET['url'] ?? '';
if (!preg_match('#^https?://#i', $url)) { http_response_code(400); exit('bad url'); }
$cfg = @file_get_contents(__DIR__ . '/../config.js');
if ($cfg === false || strpos($cfg, json_encode($url, JSON_UNESCAPED_SLASHES)) === false && strpos($cfg, "'$url'") === false && strpos($cfg, "\"$url\"") === false) { http_response_code(403); exit('feed not in config'); }
$ctx = stream_context_create(['http' => ['timeout' => 15, 'follow_location' => 1, 'user_agent' => 'FreeFamilyPlanner/1.0'], 'ssl' => ['verify_peer' => true]]);
$body = @file_get_contents($url, false, $ctx);
if ($body === false) { http_response_code(502); exit('fetch failed'); }
header('Content-Type: text/calendar; charset=utf-8');
echo $body;
