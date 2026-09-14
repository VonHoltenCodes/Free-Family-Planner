<?php
/**
 * Free Family Planner - Google's redirect lands here (a clean path: Google does not accept a
 * redirect URI with a query string). Swaps the code for a refresh token, stores it, and goes home.
 */
if (!defined('FP_AUTH')) define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
require_once __DIR__ . '/../includes/fp_session.php';
require_once __DIR__ . '/_google.php';
fp_session_start();
$home = '../index.php?setup=calendars';
$fail = function ($why) use ($home) { $d = g_read(); if ($d) { $d['last_error'] = "$why @ " . date('c'); @g_write($d); }
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Google connection failed</title>'
       . '<body style="font-family:system-ui;background:#14141a;color:#d6dbe6;padding:40px;line-height:1.5">'
       . '<h2 style="color:#ff3b2e">Google connection failed</h2><p>' . htmlspecialchars($why) . '</p>'
       . '<p><a style="color:#2bd0ff" href="' . $home . '">Back to the planner</a></p>'; exit; };
if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) $fail('you are not signed in to the planner — sign in first, then connect Google from ⚙ Setup → Calendars');
if (!empty($_GET['error'])) $fail('Google said: ' . $_GET['error']);
if (empty($_GET['code'])) $fail('no authorization code came back');
if (empty($_SESSION['fp_g_state']) || !hash_equals($_SESSION['fp_g_state'], $_GET['state'] ?? '')) $fail('the request did not match this browser session — start again from ⚙ Setup → Calendars');
unset($_SESSION['fp_g_state']);
try {
    $d = g_read();
    $r = g_http('POST', FP_G_TOKEN, ['code' => $_GET['code'], 'client_id' => $d['client_id'], 'client_secret' => $d['client_secret'],
        'redirect_uri' => g_redirect_uri(), 'grant_type' => 'authorization_code'], null, true);
    if (empty($r['refresh_token'])) $fail('Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again (the consent must be granted fresh).');
    $d['refresh_token'] = $r['refresh_token'];
    $d['access_token'] = $r['access_token'] ?? null;
    $d['expires_at'] = time() + (int)($r['expires_in'] ?? 3600);
    $d['connected_at'] = date('c'); $d['last_refresh'] = date('c'); unset($d['last_error']);
    // a friendly label for the wizard, if the scope allows it
    try { $cals = g_api('GET', '/users/me/calendarList', null, ['maxResults' => 5]); foreach ($cals['items'] ?? [] as $c) if (!empty($c['primary'])) $d['email'] = $c['id']; } catch (Exception $e) { /* not important */ }
    g_write($d);
} catch (Exception $e) { $fail($e->getMessage()); }
header("Location: $home"); exit;
