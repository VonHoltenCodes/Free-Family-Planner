<?php
/**
 * Free Family Planner - one place that starts the session.
 *
 * Why this file exists: distribution PHP ships `session.gc_maxlifetime = 1440` (24 minutes) and
 * Debian/Ubuntu disable PHP's own collector in favour of a system timer that deletes anything older
 * than that from /var/lib/php/sessions. With `session.lazy_write` on, an idle-but-alive wall display
 * never touches its session file, so the sweeper removed it every half hour: the display's API calls
 * started answering 401 and the next tap landed on the sign-in page. A "7 day" cookie made no
 * difference because the server had already thrown the session away.
 *
 * So the planner keeps sessions in its own private directory, sets the lifetime to match the cookie,
 * touches the file on every request, and collects its own leftovers.
 */
if (!function_exists('fp_session_start')) {
function fp_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $life = defined('FP_SESSION_LIFETIME') ? (int)FP_SESSION_LIFETIME : 604800;
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
        session_name(defined('FP_SESSION_NAME') ? FP_SESSION_NAME : 'fp_session');
        session_set_cookie_params(['lifetime' => $life, 'path' => dirname($_SERVER['SCRIPT_NAME'] ?? '/') ?: '/', 'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Lax']);
    }
    session_start();
    // keep the file young: lazy_write skips untouched sessions, and a stale mtime is what got them swept
    $_SESSION['fp_seen'] = time();
    if (!empty($_SESSION['fp_authenticated']) && !headers_sent()) {
        setcookie(session_name(), session_id(), ['expires' => time() + $life, 'path' => dirname($_SERVER['SCRIPT_NAME'] ?? '/') ?: '/', 'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Lax']);
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
