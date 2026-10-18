<?php
/**
 * Free Family Planner - one place that starts the session.
 *
 * Why this file exists: distribution PHP ships `session.gc_maxlifetime = 1440` (24 minutes) and
 * Debian/Ubuntu disable PHP's own collector in favour of a system timer that deletes anything older
 * than that from /var/lib/php/sessions. With `session.lazy_write` on, an idle-but-alive wall display
 * never touches its session file, so the sweeper removed it every half hour: the display's API calls
 * started answering 401 and the next tap landed on the sign-in page. So the planner keeps sessions in
 * its own private directory, sets the lifetime to match the cookie, touches the file on every request,
 * and collects its own leftovers.
 *
 * One cookie for the whole app. Scripts live in the app root and in api/; an earlier version issued
 * the cookie with the path of whichever directory answered, so a browser ended up holding two cookies
 * of the same name. When the session later expired and the person signed in again, only the root one
 * was renewed. Browsers send the more specific path first and PHP keeps the first, so every API call
 * presented the dead ID and answered 401 while the page itself loaded fine — for a month. Now the
 * path is always the app root, a duplicate is resolved in favour of the root cookie, and the stray is
 * expired on the spot.
 */
if (!function_exists('fp_session_start')) {
/** The URL path of the app root, whichever script is answering (api/*.php and rewrites included). */
function fp_cookie_path() {
    if (defined('FP_COOKIE_PATH')) return FP_COOKIE_PATH;
    // Best: the app root on disk, relative to the document root — immune to rewrites and routers.
    $root = realpath(dirname(__DIR__)); $doc = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($root && $doc && strpos($root, $doc) === 0) {
        $rel = str_replace('\\', '/', substr($root, strlen($doc)));
        return $rel === '' ? '/' : $rel;
    }
    // Fallback (aliases, odd hosts): strip the script directories we know about.
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    while (in_array(basename($dir), ['api', 'v1'], true)) $dir = rtrim(dirname($dir), '/');
    return ($dir === '' || $dir === '.') ? '/' : $dir;
}
function fp_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $life = defined('FP_SESSION_LIFETIME') ? (int)FP_SESSION_LIFETIME : 604800;
    $name = defined('FP_SESSION_NAME') ? FP_SESSION_NAME : 'fp_session';
    $path = fp_cookie_path();
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $opts = ['path' => $path, 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax'];

    $dir = __DIR__ . '/data/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) {
        session_save_path($dir);                    // out of reach of the system's session sweeper
        ini_set('session.gc_probability', '0');     // we collect our own below
    }
    ini_set('session.gc_maxlifetime', (string)$life);
    ini_set('session.cookie_httponly', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_samesite', 'Lax');      // Lax so a redirect back from an OAuth consent keeps the session
    ini_set('session.use_strict_mode', '1');
    if (!headers_sent()) {
        session_name($name);
        session_set_cookie_params($opts + ['lifetime' => $life]);
    }

    // Two cookies of our name? Keep the app-root one (browsers send it last) and expire the stray.
    $vals = [];
    foreach (explode(';', $_SERVER['HTTP_COOKIE'] ?? '') as $c) {
        $kv = explode('=', trim($c), 2);
        if (count($kv) === 2 && trim($kv[0]) === $name) $vals[] = urldecode($kv[1]);
    }
    if (count($vals) > 1) session_id(end($vals));

    session_start();
    // Expire a stray cookie only now: session_start() discards any earlier Set-Cookie carrying the
    // session's name when it sends its own, so one queued before it never reached the browser.
    // Cover wherever an older build could have put it — this script's own directory and api/.
    if (count($vals) > 1 && !headers_sent()) {
        $here = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') ?: '/';
        foreach (array_unique([$here, rtrim($path, '/') . '/api']) as $stray) {
            if ($stray !== $path) setcookie($name, '', ['expires' => time() - 86400, 'path' => $stray] + $opts);
        }
    }
    // keep the file young: lazy_write skips untouched sessions, and a stale mtime is what got them swept
    $_SESSION['fp_seen'] = time();
    if (!empty($_SESSION['fp_authenticated']) && !headers_sent()) {
        setcookie($name, session_id(), ['expires' => time() + $life] + $opts);
    }
    fp_session_gc($life);
}
/** Delete our own expired session files, now and then. */
function fp_session_gc($life) {
    $dir = session_save_path(); if (!$dir || strpos($dir, '/data/sessions') === false) return;
    if (mt_rand(1, 200) !== 1) return;
    foreach (glob("$dir/sess_*") ?: [] as $f) { if (filemtime($f) < time() - $life) @unlink($f); }
}
}
