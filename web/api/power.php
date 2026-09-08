<?php
/**
 * Free Family Planner - electricity pricing (ComEd Hourly Pricing) for hosted installs.
 * Mirrors tools/serve.py: current-hour average + 5-min price (documented API) and today's/tomorrow's
 * day-ahead hourly prices (the ServletFeed the ComEd site uses). ¢/kWh, Central time. Cached 5 min.
 */
define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start();
header('Content-Type: application/json'); header('Cache-Control: no-store');
if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) { http_response_code(401); echo '{"error":"not signed in"}'; exit; }
$dir = __DIR__ . '/../includes/data'; $cache = "$dir/power.json";
if (is_file($cache) && time() - filemtime($cache) < 300) { readfile($cache); exit; }
$tz = new DateTimeZone('America/Chicago'); $now = new DateTime('now', $tz);
$get = function ($url) { $ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: FreeFamilyPlanner/1.0\r\n"]]); $r = @file_get_contents($url, false, $ctx); if ($r === false) throw new Exception("fetch failed: $url"); return $r; };
$day = function ($d) use ($get) { $raw = $get('https://hourlypricing.comed.com/rrtp/ServletFeed?type=daynexttoday&date=' . $d->format('Ymd')); preg_match_all('/Date\.UTC\((\d+),(\d+),(\d+),(\d+),0,0\),\s*([\d.]+)/', $raw, $m, PREG_SET_ORDER);
    return array_map(fn($x) => ['hour' => (int)$x[4], 'price' => (float)$x[5]], $m); };
$out = ['provider' => 'comed', 'units' => '¢/kWh', 'updatedAt' => $now->format('c'), 'hour' => (int)$now->format('G'), 'current' => null, 'fiveMin' => null, 'today' => [], 'tomorrow' => []];
try { $c = json_decode($get('https://hourlypricing.comed.com/api?type=currenthouraverage'), true); $out['current'] = (float)$c[0]['price']; } catch (Exception $e) { $out['error'] = 'current: ' . $e->getMessage(); }
try { $f = json_decode($get('https://hourlypricing.comed.com/api?type=5minutefeed'), true); $out['fiveMin'] = (float)$f[0]['price']; } catch (Exception $e) {}
try { $out['today'] = $day($now); } catch (Exception $e) { $out['error'] = 'day-ahead: ' . $e->getMessage(); }
try { $out['tomorrow'] = $day((clone $now)->modify('+1 day')); } catch (Exception $e) { $out['tomorrow'] = []; }
$json = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (!is_dir($dir)) @mkdir($dir, 0750, true); @file_put_contents($cache, $json, LOCK_EX);
echo $json;
