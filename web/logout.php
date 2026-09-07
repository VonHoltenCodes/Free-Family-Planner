<?php
/**
 * Family Planner - Logout Handler
 */

define('FP_AUTH', true);
require_once __DIR__ . '/includes/auth_config.php';

session_name(FP_SESSION_NAME);
session_start();

// Clear all session data
$_SESSION = array();

// Delete the session cookie
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Destroy the session
session_destroy();

// Redirect to login
header('Location: auth.php');
exit;
