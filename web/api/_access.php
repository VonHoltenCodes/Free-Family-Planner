<?php
/**
 * Free Family Planner - login + API-token management for hosted installs.
 * Rewrites includes/auth_config.php (server-only) from the example template, keeping unrelated constants.
 */
function fp_auth_file() { return __DIR__ . '/../includes/auth_config.php'; }
function fp_auth_exists() { return is_file(fp_auth_file()); }
function fp_auth_read_constants() {
    $keys = ['FP_USERNAME', 'FP_PASSWORD_HASH', 'FP_SESSION_NAME', 'FP_SESSION_LIFETIME', 'FP_API_TOKEN', 'FP_STATE_TOKEN', 'FP_TIMEZONE', 'FP_TITLE', 'FP_SUBTITLE', 'FP_FOOTER'];
    if (defined('FP_USERNAME')) { $out = []; foreach ($keys as $k) if (defined($k)) $out[$k] = constant($k); return $out; }   // file already loaded: exact values
    $out = []; $src = @file_get_contents(fp_auth_file()); if ($src === false) return $out;
    if (preg_match_all("/define\(\s*['\"]([A-Z_]+)['\"]\s*,\s*(.*?)\);/s", $src, $m, PREG_SET_ORDER)) foreach ($m as $x) { $v = trim($x[2]); if (preg_match("/^'(.*)'$/s", $v, $q)) $v = str_replace("\\'", "'", $q[1]); elseif (preg_match('/^"(.*)"$/s', $v, $q)) $v = $q[1]; elseif (preg_match('/^[\d\s*+\-()]+$/', $v)) $v = (int)eval("return $v;"); $out[$x[1]] = $v; }
    return $out;
}
/** Write auth_config.php with the given constants (username/hash/session/token/branding). */
function fp_auth_write(array $c) {
    $q = fn($s) => "'" . str_replace("'", "\\'", (string)$s) . "'";
    $lines = ["<?php", "/**", " * Free Family Planner - login configuration (written by the setup wizard " . date('c') . ")", " * Server-only: .htaccess blocks includes/. Never commit this file.", " */", "", "if (!defined('FP_AUTH')) { http_response_code(403); exit; }", "",
        "define('FP_USERNAME', " . $q($c['FP_USERNAME'] ?? 'family') . ");", "define('FP_PASSWORD_HASH', " . $q($c['FP_PASSWORD_HASH'] ?? '') . ");",
        "define('FP_SESSION_NAME', " . $q($c['FP_SESSION_NAME'] ?? 'fp_session') . ");", "define('FP_SESSION_LIFETIME', " . (int)($c['FP_SESSION_LIFETIME'] ?? 7 * 24 * 60 * 60) . ");", "",
        "// API token for tools/ffp, agents and automations (Authorization: Bearer …); empty = disabled", "define('FP_API_TOKEN', " . $q($c['FP_API_TOKEN'] ?? '') . ");",
        "// Lets a home hub read api/state.php?token=… without a login; empty = disabled", "define('FP_STATE_TOKEN', " . $q($c['FP_STATE_TOKEN'] ?? '') . ");",
        "define('FP_TIMEZONE', " . $q($c['FP_TIMEZONE'] ?? 'America/Chicago') . ");", "",
        "// Sign-in page branding", "define('FP_TITLE', " . $q($c['FP_TITLE'] ?? 'FAMILY') . ");", "define('FP_SUBTITLE', " . $q($c['FP_SUBTITLE'] ?? 'PLANNER') . ");", "define('FP_FOOTER', " . $q($c['FP_FOOTER'] ?? 'FREE FAMILY PLANNER') . ");", ""];
    $dir = dirname(fp_auth_file()); if (!is_dir($dir)) @mkdir($dir, 0750, true);
    if (file_put_contents(fp_auth_file(), implode("\n", $lines), LOCK_EX) === false) throw new Exception('includes/ is not writable by the web server');
    @chmod(fp_auth_file(), 0640); return true;
}
