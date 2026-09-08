<?php
/**
 * Family Planner - Authentication Page
 */

define('FP_AUTH', true);
if (!is_file(__DIR__ . '/includes/auth_config.php')) { header('Location: setup-login.php'); exit; }   // first run: create the login
require_once __DIR__ . '/includes/auth_config.php';

// Start secure session
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Strict');
session_name(FP_SESSION_NAME);
session_set_cookie_params(FP_SESSION_LIFETIME);
session_start();

// Already authenticated? Redirect to app
if (isset($_SESSION['fp_authenticated']) && $_SESSION['fp_authenticated'] === true) {
    header('Location: index.php');
    exit;
}

$error = '';
$fpTitle = defined('FP_TITLE') ? FP_TITLE : 'FAMILY';
$fpSubtitle = defined('FP_SUBTITLE') ? FP_SUBTITLE : 'PLANNER';
$fpFooter = defined('FP_FOOTER') ? FP_FOOTER : 'FREE FAMILY PLANNER';

// Handle login attempt
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';

    // Validate credentials (timing-safe comparison for username)
    if (hash_equals(strtolower(FP_USERNAME), strtolower($username)) &&
        password_verify($password, FP_PASSWORD_HASH)) {
        // Regenerate session ID to prevent fixation
        session_regenerate_id(true);

        $_SESSION['fp_authenticated'] = true;
        $_SESSION['fp_user'] = FP_USERNAME;
        $_SESSION['fp_login_time'] = time();

        // Redirect to app
        header('Location: index.php');
        exit;
    } else {
        $error = 'Invalid username or password';
        // Add small delay to prevent brute force
        usleep(500000); // 0.5 second delay
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#14141a">
    <meta name="mobile-web-app-capable" content="yes">
    <title>Sign In - <?= htmlspecialchars($fpTitle) ?></title>
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
    <style>
        @font-face{font-family:"Pixelify Sans";src:url("assets/fonts/PixelifySans.ttf") format("truetype");font-weight:400 700;font-display:swap;}
        @font-face{font-family:"Saira";src:url("assets/fonts/Saira.ttf") format("truetype");font-weight:100 900;font-display:swap;}
        @font-face{font-family:"DSEG7 Classic";src:url("assets/fonts/DSEG7Classic-Bold.ttf") format("truetype");font-weight:700;font-display:swap;}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:"Saira",Tahoma,"Segoe UI",system-ui,sans-serif;color:#d6dbe6;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;
            background:#14141a;background-image:radial-gradient(120% 90% at 50% 0%,rgba(54,64,110,.35) 0%,transparent 60%),repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 1px,transparent 1px 3px);}
        .unit{width:100%;max-width:400px;background:#1e1e26;border-radius:4px;overflow:hidden;
            border-top:1px solid #50505e;border-left:1px solid #50505e;border-right:1px solid #06060a;border-bottom:1px solid #06060a;box-shadow:0 12px 40px rgba(0,0,0,.7);}
        .bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#36406e;
            background-image:linear-gradient(180deg,rgba(255,255,255,.08),rgba(0,0,0,.18)),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 2px,transparent 2px 6px);
            border-top:1px solid #7d8ec0;border-bottom:1px solid #090b14;}
        .bar .elbow{width:34px;height:26px;background:#ff9f5b;border-radius:4px 0 0 4px;clip-path:polygon(0 0,100% 0,100% 35%,12px 35%,12px 100%,0 100%);}
        .bar .fl{width:4px;height:26px;background:linear-gradient(180deg,#f0d878,#d9b33d 40%,#7a5f16);border-radius:2px;}
        .bar h1{font-family:"Pixelify Sans",monospace;font-weight:400;font-size:18px;letter-spacing:3px;color:#2bd0ff;text-shadow:0 0 10px rgba(43,208,255,.7),1px 1px 0 #000;}
        .bar h1 small{display:block;font-size:10px;letter-spacing:2px;color:#ffd11a;}
        .body{padding:22px 20px 20px;display:flex;flex-direction:column;gap:14px;}
        .lcd{align-self:center;font-family:"DSEG7 Classic",monospace;font-weight:700;font-size:22px;color:#1eff1e;text-shadow:0 0 8px rgba(30,255,30,.75);background:#0b1a0b;padding:6px 14px;border-radius:3px;
            border-top:1px solid #06060a;border-left:1px solid #06060a;border-right:1px solid #44444e;border-bottom:1px solid #44444e;box-shadow:inset 0 0 14px rgba(0,0,0,.8);letter-spacing:2px;}
        label{display:flex;flex-direction:column;gap:5px;font-family:"Pixelify Sans",monospace;font-size:11px;letter-spacing:2px;color:#8f97a8;text-transform:uppercase;}
        input{width:100%;padding:12px 14px;font-size:16px;font-family:inherit;color:#fff;background:#1a1a20;border-radius:3px;outline:none;-webkit-appearance:none;
            border-top:1px solid #06060a;border-left:1px solid #06060a;border-right:1px solid #44444e;border-bottom:1px solid #44444e;}
        input:focus{box-shadow:0 0 0 2px rgba(43,208,255,.45);}
        input::placeholder{color:#5f6678;}
        .error{font-family:"Pixelify Sans",monospace;font-size:12px;letter-spacing:1px;color:#ff3b2e;background:rgba(255,59,46,.1);border:1px solid rgba(255,59,46,.4);padding:10px 12px;border-radius:3px;text-align:center;}
        .btn{width:100%;min-height:42px;font-family:"Pixelify Sans",monospace;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#1e1e24;background:#c4c4cc;border-radius:3px;cursor:pointer;
            border-top:1px solid #fff;border-left:1px solid #fff;border-right:1px solid #2c2c32;border-bottom:1px solid #2c2c32;box-shadow:inset 1px 1px 0 #ededf2,inset -1px -1px 0 #8a8a92,0 1px 2px rgba(0,0,0,.6);-webkit-tap-highlight-color:transparent;}
        .btn:hover{background:#d0d0d8;}
        .btn:active{background:#aeaeb6;border-top-color:#2c2c32;border-left-color:#2c2c32;border-right-color:#fff;border-bottom-color:#fff;box-shadow:inset 1px 1px 0 #8a8a92;}
        .foot{padding:6px 12px;font-family:"Pixelify Sans",monospace;font-size:10px;letter-spacing:1.5px;color:#5f6678;background:linear-gradient(180deg,#22222a,#17171d);border-top:1px solid #50505e;display:flex;gap:10px;align-items:center;}
        .foot .pill{height:8px;border-radius:4px;background:#ff9f5b;width:28px;}
        .foot .pill.m{background:#c98bdb;width:14px;}
        .foot .pill.b{background:#7d9bff;width:40px;}
        input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-text-fill-color:#fff;-webkit-box-shadow:0 0 0px 1000px #1a1a20 inset;}
    </style>
</head>
<body>
    <div class="unit">
        <div class="bar"><div class="elbow"></div><div class="fl"></div><h1><?= htmlspecialchars($fpTitle) ?><small><?= htmlspecialchars($fpSubtitle) ?></small></h1></div>
        <form class="body" method="POST" autocomplete="off">
            <div class="lcd">SIGN IN</div>
            <?php if ($error): ?>
            <div class="error"><?= htmlspecialchars($error) ?></div>
            <?php endif; ?>
            <label for="username">Username<input type="text" id="username" name="username" required autofocus placeholder="Enter username"></label>
            <label for="password">Password<input type="password" id="password" name="password" required placeholder="Enter password"></label>
            <button type="submit" class="btn">Sign In</button>
        </form>
        <div class="foot"><span class="pill"></span><span class="pill m"></span><span class="pill b"></span><span><?= htmlspecialchars($fpFooter) ?></span></div>
    </div>
</body>
</html>
