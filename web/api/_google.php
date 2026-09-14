<?php
/**
 * Free Family Planner - server-side Google Calendar.
 *
 * A wall display has nobody standing at it to click "sign in", and the in-browser silent token
 * refresh does not answer on some devices. So the server holds the OAuth client secret and a
 * refresh token (in includes/data/google.json, which is never served) and mints access tokens on
 * demand. The page then asks its own server for calendar data and never talks to Google directly.
 *
 * Endpoints are overridable so the flow can be tested against a stub.
 */
if (!defined('FP_G_AUTH'))  define('FP_G_AUTH',  defined('FP_GOOGLE_AUTH_URL')  ? FP_GOOGLE_AUTH_URL  : 'https://accounts.google.com/o/oauth2/v2/auth');
if (!defined('FP_G_TOKEN')) define('FP_G_TOKEN', defined('FP_GOOGLE_TOKEN_URL') ? FP_GOOGLE_TOKEN_URL : 'https://oauth2.googleapis.com/token');
if (!defined('FP_G_API'))   define('FP_G_API',   defined('FP_GOOGLE_API_BASE')  ? FP_GOOGLE_API_BASE  : 'https://www.googleapis.com/calendar/v3');
define('FP_G_SCOPE', 'https://www.googleapis.com/auth/calendar');

function g_file() { return __DIR__ . '/../includes/data/google.json'; }
function g_read() { $f = g_file(); return is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : []; }
function g_write($d) {
    $dir = dirname(g_file()); if (!is_dir($dir)) @mkdir($dir, 0750, true);
    if (file_put_contents(g_file(), json_encode($d), LOCK_EX) === false) throw new Exception('includes/data is not writable by the web server');
    @chmod(g_file(), 0600);
}
/** This install's callback URL — it must match the redirect URI in the Google console exactly. */
function g_redirect_uri() {
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php')), '/');
    return ($https ? 'https' : 'http') . "://$host$base/api/google-callback.php";
}
function g_http($method, $url, $body = null, $token = null, $form = false) {
    $headers = ['Accept: application/json'];
    if ($token) $headers[] = "Authorization: Bearer $token";
    $content = null;
    if ($body !== null) {
        if ($form) { $content = http_build_query($body); $headers[] = 'Content-Type: application/x-www-form-urlencoded'; }
        else { $content = json_encode($body); $headers[] = 'Content-Type: application/json'; }
    }
    $ctx = stream_context_create(['http' => ['method' => $method, 'timeout' => 20, 'ignore_errors' => true, 'header' => implode("\r\n", $headers), 'content' => $content]]);
    $raw = @file_get_contents($url, false, $ctx);
    $code = 0; foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
    if ($raw === false) throw new Exception('Google unreachable');
    $json = $raw === '' ? [] : json_decode($raw, true);
    if ($code >= 400) {
        $msg = $json['error']['message'] ?? ($json['error_description'] ?? ($json['error'] ?? substr($raw, 0, 200)));
        $e = new Exception(is_string($msg) ? $msg : json_encode($msg), $code); throw $e;
    }
    return $json;
}
/** A valid access token, refreshed from the stored refresh token when needed. */
function g_token() {
    $d = g_read();
    if (empty($d['refresh_token'])) throw new Exception('Google is not connected on this server', 409);
    if (!empty($d['access_token']) && ($d['expires_at'] ?? 0) > time() + 60) return $d['access_token'];
    $r = g_http('POST', FP_G_TOKEN, ['client_id' => $d['client_id'], 'client_secret' => $d['client_secret'],
        'refresh_token' => $d['refresh_token'], 'grant_type' => 'refresh_token'], null, true);
    if (empty($r['access_token'])) throw new Exception('Google returned no access token');
    $d['access_token'] = $r['access_token'];
    $d['expires_at'] = time() + (int)($r['expires_in'] ?? 3600);
    if (!empty($r['refresh_token'])) $d['refresh_token'] = $r['refresh_token'];   // rotation, if Google sends one
    $d['last_refresh'] = date('c'); unset($d['last_error']);
    g_write($d); return $d['access_token'];
}
function g_api($method, $path, $body = null, $query = []) {
    $url = FP_G_API . $path . ($query ? '?' . http_build_query($query) : '');
    try { return g_http($method, $url, $body, g_token()); }
    catch (Exception $e) {
        if ((int)$e->getCode() === 401) {                 // force one refresh and retry
            $d = g_read(); unset($d['access_token'], $d['expires_at']); g_write($d);
            return g_http($method, $url, $body, g_token());
        }
        throw $e;
    }
}
function g_window() {
    $a = new DateTime('-1 month'); $b = new DateTime('+3 months');
    return ['timeMin' => $a->format('c'), 'timeMax' => $b->format('c')];
}
