<?php
/**
 * Free Family Planner - first run on a hosted install: create the login before anything else.
 * Only works while includes/auth_config.php does not exist; after that, use ⚙ Setup → Access.
 */
require_once __DIR__ . '/api/_access.php';
if (fp_auth_exists()) { header('Location: auth.php'); exit; }
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $u = trim($_POST['username'] ?? ''); $p = $_POST['password'] ?? ''; $p2 = $_POST['password2'] ?? '';
    if ($u === '' || !preg_match('/^[A-Za-z0-9._@-]{2,64}$/', $u)) $error = 'Pick a username (letters, numbers, . _ @ -).';
    elseif (strlen($p) < 8) $error = 'Password must be at least 8 characters.';
    elseif ($p !== $p2) $error = 'Passwords do not match.';
    else {
        try {
            fp_auth_write(['FP_USERNAME' => $u, 'FP_PASSWORD_HASH' => password_hash($p, PASSWORD_DEFAULT), 'FP_TITLE' => strtoupper(trim($_POST['title'] ?? '')) ?: 'FAMILY', 'FP_SUBTITLE' => 'PLANNER']);
            // sign the creator in and hand off to the app (the ⚙ wizard opens on a fresh install)
            define('FP_AUTH', true); require_once fp_auth_file();
            ini_set('session.cookie_httponly', 1); ini_set('session.use_only_cookies', 1); ini_set('session.cookie_samesite', 'Strict');
            session_name(FP_SESSION_NAME); session_set_cookie_params(FP_SESSION_LIFETIME); session_start(); session_regenerate_id(true);
            $_SESSION['fp_authenticated'] = true; $_SESSION['fp_user'] = $u; $_SESSION['fp_login_time'] = time();
            header('Location: index.php'); exit;
        } catch (Exception $e) { $error = $e->getMessage(); }
    }
}
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Create your login - Free Family Planner</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<style>
@font-face{font-family:"Pixelify Sans";src:url("assets/fonts/PixelifySans.ttf") format("truetype");font-display:swap;}
@font-face{font-family:"Saira";src:url("assets/fonts/Saira.ttf") format("truetype");font-weight:100 900;font-display:swap;}
*{box-sizing:border-box;margin:0;padding:0;} body{font-family:"Saira",system-ui,sans-serif;color:#d6dbe6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#14141a;}
.unit{width:100%;max-width:440px;background:#1e1e26;border-radius:4px;overflow:hidden;border-top:1px solid #50505e;border-left:1px solid #50505e;border-right:1px solid #06060a;border-bottom:1px solid #06060a;box-shadow:0 12px 40px rgba(0,0,0,.7);}
.bar{padding:10px 14px;background:#36406e;border-top:1px solid #7d8ec0;border-bottom:1px solid #090b14;} .bar h1{font-family:"Pixelify Sans",monospace;font-weight:400;font-size:18px;letter-spacing:3px;color:#2bd0ff;} .bar h1 small{display:block;font-size:10px;letter-spacing:2px;color:#ffd11a;}
.body{padding:20px;display:flex;flex-direction:column;gap:12px;} p{font-size:14px;line-height:1.4;color:#8f97a8;}
label{display:flex;flex-direction:column;gap:5px;font-family:"Pixelify Sans",monospace;font-size:11px;letter-spacing:2px;color:#8f97a8;text-transform:uppercase;}
input{width:100%;padding:11px 12px;font-size:16px;font-family:inherit;color:#fff;background:#1a1a20;border-radius:3px;outline:none;border:1px solid #44444e;} input:focus{box-shadow:0 0 0 2px rgba(43,208,255,.45);}
.error{font-family:"Pixelify Sans",monospace;font-size:12px;color:#ff3b2e;background:rgba(255,59,46,.1);border:1px solid rgba(255,59,46,.4);padding:10px;border-radius:3px;}
.btn{min-height:42px;font-family:"Pixelify Sans",monospace;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#1e1e24;background:#c4c4cc;border-radius:3px;cursor:pointer;border:1px solid #fff;border-right-color:#2c2c32;border-bottom-color:#2c2c32;}
</style></head>
<body><div class="unit"><div class="bar"><h1>FREE FAMILY PLANNER<small>FIRST RUN — CREATE YOUR LOGIN</small></h1></div>
<form class="body" method="POST" autocomplete="off">
<p>This login protects the page on your web host. Pick anything; you can change it later in ⚙ Setup → Access. The wizard for everything else opens next.</p>
<?php if ($error): ?><div class="error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
<label>Family name (shown on the sign-in page)<input type="text" name="title" placeholder="OUR FAMILY"></label>
<label>Username<input type="text" name="username" required autofocus placeholder="family"></label>
<label>Password (8+ characters)<input type="password" name="password" required minlength="8"></label>
<label>Password again<input type="password" name="password2" required minlength="8"></label>
<button type="submit" class="btn">Create login &amp; continue</button>
</form></div></body></html>
