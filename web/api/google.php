<?php
/**
 * Free Family Planner - server-side Google Calendar API for the page and for tools/ffp.
 *   GET  ?op=status                         → {connected, clientId, email, lastRefresh, redirectUri}
 *   POST ?op=configure {clientId,clientSecret}
 *   GET  ?op=authurl[&go=1]                 → the consent URL (or a redirect straight to it)
 *   GET  ?op=calendars
 *   GET  ?op=events[&calendarId=&timeMin=&timeMax=]
 *   POST ?op=insert  {calendarId, resource}
 *   POST ?op=update  {calendarId, eventId, resource}
 *   POST ?op=delete  {calendarId, eventId}
 *   POST ?op=disconnect
 */
if (!defined('FP_AUTH')) define('FP_AUTH', true);
require_once __DIR__ . '/../includes/auth_config.php';
require_once __DIR__ . '/../includes/fp_session.php';
require_once __DIR__ . '/_google.php';
header('Content-Type: application/json'); header('Cache-Control: no-store');
$tok = defined('FP_API_TOKEN') ? FP_API_TOKEN : '';
$hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
$byToken = $tok !== '' && (hash_equals("Bearer $tok", $hdr) || (isset($_GET['token']) && hash_equals($tok, (string)$_GET['token'])));
fp_session_start();
if (!$byToken && (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true)) { http_response_code(401); echo '{"error":"not signed in"}'; exit; }
$out = function ($code, $o) { http_response_code($code); echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; };
$op = $_GET['op'] ?? 'status'; $m = $_SERVER['REQUEST_METHOD'];
$body = in_array($m, ['POST', 'PUT', 'PATCH'], true) ? (json_decode(file_get_contents('php://input'), true) ?: []) : [];
try {
    $d = g_read();
    if ($op === 'status') {
        $out(200, ['connected' => !empty($d['refresh_token']), 'configured' => !empty($d['client_id']), 'clientId' => $d['client_id'] ?? '',
            'email' => $d['email'] ?? '', 'lastRefresh' => $d['last_refresh'] ?? null, 'lastError' => $d['last_error'] ?? null,
            'redirectUri' => g_redirect_uri(), 'accessValidFor' => max(0, (int)(($d['expires_at'] ?? 0) - time()))]);
    }
    if ($op === 'configure' && $m === 'POST') {
        $id = trim($body['clientId'] ?? ''); $secret = trim($body['clientSecret'] ?? '');
        if (!preg_match('/\.apps\.googleusercontent\.com$/', $id)) $out(400, ['error' => 'that does not look like a Google OAuth client ID']);
        if ($secret === '' && empty($d['client_secret'])) $out(400, ['error' => 'a client secret is required']);
        $d['client_id'] = $id; if ($secret !== '') $d['client_secret'] = $secret;
        unset($d['access_token'], $d['expires_at']); g_write($d);
        $out(200, ['ok' => true, 'redirectUri' => g_redirect_uri()]);
    }
    if ($op === 'authurl') {
        if (empty($d['client_id']) || empty($d['client_secret'])) $out(409, ['error' => 'set the client ID and secret first']);
        $state = bin2hex(random_bytes(16)); $_SESSION['fp_g_state'] = $state;
        $url = FP_G_AUTH . '?' . http_build_query(['client_id' => $d['client_id'], 'redirect_uri' => g_redirect_uri(), 'response_type' => 'code',
            'scope' => FP_G_SCOPE, 'access_type' => 'offline', 'prompt' => 'consent', 'include_granted_scopes' => 'true', 'state' => $state]);
        if (!empty($_GET['go'])) { header("Location: $url"); exit; }
        $out(200, ['url' => $url]);
    }
    if ($op === 'disconnect' && $m === 'POST') {
        $keep = ['client_id' => $d['client_id'] ?? '', 'client_secret' => $d['client_secret'] ?? ''];
        g_write($keep); $out(200, ['ok' => true]);
    }
    // everything below needs a connection
    if ($op === 'calendars') {
        $items = g_api('GET', '/users/me/calendarList', null, ['maxResults' => 250])['items'] ?? [];
        $cals = array_map(fn($c) => ['id' => $c['id'], 'name' => $c['summary'] ?? $c['id'], 'primary' => !empty($c['primary'])], $items);
        $out(200, ['calendars' => $cals]);
    }
    if ($op === 'events') {
        $cal = $_GET['calendarId'] ?? ($d['calendar_id'] ?? 'primary');
        $q = array_merge(g_window(), ['singleEvents' => 'true', 'orderBy' => 'startTime', 'maxResults' => 250, 'showDeleted' => 'false']);
        foreach (['timeMin', 'timeMax'] as $k) if (!empty($_GET[$k])) $q[$k] = $_GET[$k];
        $out(200, ['events' => g_api('GET', '/calendars/' . rawurlencode($cal) . '/events', null, $q)['items'] ?? []]);
    }
    if ($op === 'insert' && $m === 'POST') $out(200, g_api('POST', '/calendars/' . rawurlencode($body['calendarId'] ?? 'primary') . '/events', $body['resource'] ?? []));
    if ($op === 'update' && $m === 'POST') $out(200, g_api('PUT', '/calendars/' . rawurlencode($body['calendarId'] ?? 'primary') . '/events/' . rawurlencode($body['eventId'] ?? ''), $body['resource'] ?? []));
    if ($op === 'delete' && $m === 'POST') { g_api('DELETE', '/calendars/' . rawurlencode($body['calendarId'] ?? 'primary') . '/events/' . rawurlencode($body['eventId'] ?? '')); $out(200, ['ok' => true]); }
    $out(400, ['error' => 'unknown op']);
} catch (Exception $e) {
    $code = (int)$e->getCode(); $d = g_read();
    if (!empty($d)) { $d['last_error'] = $e->getMessage() . ' @ ' . date('c'); @g_write($d); }
    $out($code === 409 ? 409 : 502, ['error' => $e->getMessage()]);
}
