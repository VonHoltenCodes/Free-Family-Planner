<?php
/**
 * Free Family Planner - login configuration.
 * Copy to auth_config.php (same folder). It is served to nobody (.htaccess blocks includes/)
 * and is never committed.
 *
 * Generate the password hash once:
 *   php -r 'echo password_hash("your-password-here", PASSWORD_DEFAULT), PHP_EOL;'
 */

if (!defined('FP_AUTH')) { http_response_code(403); exit; }

define('FP_USERNAME', 'family');
define('FP_PASSWORD_HASH', '$2y$10$REPLACE_WITH_OUTPUT_OF_password_hash');
define('FP_SESSION_NAME', 'fp_session');
define('FP_SESSION_LIFETIME', 7 * 24 * 60 * 60);   // seconds; 7 days keeps the wall display signed in

// Optional branding for the sign-in page (the app itself reads config.js)
define('FP_TITLE', 'OUR FAMILY');
define('FP_SUBTITLE', 'CENTRAL COMMAND');
define('FP_FOOTER', 'FAMILY COMMAND CENTER • YOUR TOWN, ST');
