<?php
/**
 * Family Planner - Main Entry Point
 * Serves the vanilla app (app.html) after authentication.
 */

define('FP_AUTH', true);
require_once __DIR__ . '/includes/auth_config.php';

ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME);
session_set_cookie_params(FP_SESSION_LIFETIME);
session_start();

if (!isset($_SESSION['fp_authenticated']) || $_SESSION['fp_authenticated'] !== true) {
    $_SESSION['fp_redirect'] = $_SERVER['REQUEST_URI'];
    header('Location: auth.php');
    exit;
}

if (isset($_SESSION['fp_login_time']) && (time() - $_SESSION['fp_login_time']) > FP_SESSION_LIFETIME) {
    session_destroy();
    header('Location: auth.php');
    exit;
}

header('Cache-Control: no-store');
readfile(__DIR__ . '/app.html');
