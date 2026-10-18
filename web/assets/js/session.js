// Our own server answered 401: the planner sign-in is gone. A page that cannot reach its own API is
// useless, so go to the login page — once. Bouncing straight back means something else is wrong (a
// stale cookie once shadowed the live one for a month), so a second time within two minutes shows a
// notice instead of looping. Local installs have no login page and never get here.
let handled = false;
export async function sessionLost(where, { toast } = {}) {
  if (handled) return false; handled = true;
  try { const r = await fetch('auth.php', { method: 'HEAD', cache: 'no-store' }); if (!r.ok) { handled = false; return false; } }
  catch { handled = false; return false; }
  let last = 0; try { last = +(sessionStorage.getItem('fp.relogin') || 0); } catch { /* ignore */ }
  if (Date.now() - last < 120_000) { toast?.(`Signed out of the planner (${where}) — sign in again`); return false; }
  try { sessionStorage.setItem('fp.relogin', String(Date.now())); } catch { /* ignore */ }
  location.replace('auth.php');
  return true;
}
