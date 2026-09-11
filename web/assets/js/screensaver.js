// Burn-in care for a display that never sleeps.
//
//  - shift: every few minutes the whole layout moves a pixel or two, so no edge sits still for weeks
//  - screensaver: after N idle minutes the panels give way to a slow-moving clock (and the next event,
//    the temperature, the price) that drifts around the screen. Any touch brings the planner back.
// Styles: drift (minimal), bounce (corner-to-corner, DVD-logo style), stars, off (black).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const SAVERS = [['off', 'Off'], ['drift', 'Drifting clock'], ['bounce', 'Bouncing clock'], ['stars', 'Starfield'], ['black', 'Black screen']];

/* ---- pixel shift (always on unless disabled): nudges the layout inside the canvas ---- */
export function startPixelShift(enabled) {
  const c = document.getElementById('canvas');
  if (!enabled) { c.style.removeProperty('--shift-x'); c.style.removeProperty('--shift-y'); return () => {}; }
  let i = 0;
  const steps = [[0, 0], [3, 2], [6, 4], [3, 5], [0, 3], [-3, 1], [-6, 3], [-3, 5]];
  const tick = () => { const [x, y] = steps[i++ % steps.length]; c.style.setProperty('--shift-x', `${x}px`); c.style.setProperty('--shift-y', `${y}px`); };
  tick(); const t = setInterval(tick, 4 * 60_000);
  return () => clearInterval(t);
}

/* ---- screensaver ---- */
export function startScreensaver(display, getInfo) {
  let overlay = null, raf = 0, timer = 0, idleAt = Date.now(), active = false;
  const style = () => display.saver || 'drift';
  const idleMs = () => Math.max(1, display.saverMinutes ?? 20) * 60_000;

  const build = () => {
    overlay = el('div', `saver ${style()}`); overlay.id = 'saver';
    const box = el('div', 'saver-box');
    box.append(el('div', 'saver-clock'), el('div', 'saver-date'), el('div', 'saver-line'), el('div', 'saver-sub'));
    overlay.appendChild(box);
    if (style() === 'stars') { const cv = el('canvas', 'saver-stars'); overlay.appendChild(cv); }
    document.getElementById('canvas').appendChild(overlay);
    return overlay;
  };
  const paint = () => {
    if (!overlay) return;
    const now = new Date(); const info = getInfo() || {};
    let h = now.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; if (!display.clock24) h = h % 12 || 12;
    overlay.querySelector('.saver-clock').textContent = `${display.clock24 ? String(h).padStart(2, '0') : h}:${String(now.getMinutes()).padStart(2, '0')}${display.clock24 ? '' : ' ' + ampm}`;
    overlay.querySelector('.saver-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    overlay.querySelector('.saver-line').textContent = info.line || '';
    overlay.querySelector('.saver-sub').textContent = info.sub || '';
  };

  // slow movement so no pixel is asked to hold the same bright colour
  let pos = { x: 0.5, y: 0.45, dx: 0.00035, dy: 0.00026 }, stars = null;
  const move = () => {
    if (!overlay) return;
    const box = overlay.querySelector('.saver-box'); const w = overlay.clientWidth, hgt = overlay.clientHeight;
    const bw = box.offsetWidth / w, bh = box.offsetHeight / hgt;
    if (style() === 'bounce') {
      pos.x += pos.dx * 3; pos.y += pos.dy * 3;
      if (pos.x < bw / 2 || pos.x > 1 - bw / 2) pos.dx *= -1;
      if (pos.y < bh / 2 || pos.y > 1 - bh / 2) pos.dy *= -1;
    } else {
      const t = Date.now() / 1000;
      pos.x = 0.5 + Math.sin(t / 90) * (0.5 - bw / 2 - 0.02);
      pos.y = 0.5 + Math.cos(t / 140) * (0.5 - bh / 2 - 0.02);
    }
    box.style.left = `${pos.x * 100}%`; box.style.top = `${pos.y * 100}%`;
    if (stars) drawStars();
    raf = requestAnimationFrame(move);
  };
  const drawStars = () => {
    const cv = overlay.querySelector('.saver-stars'); if (!cv) return;
    if (cv.width !== overlay.clientWidth) { cv.width = overlay.clientWidth; cv.height = overlay.clientHeight; stars = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, z: Math.random() * 0.8 + 0.2 })); }
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#9fb4d6';
    stars.forEach((s) => { s.y += s.z * 0.25; if (s.y > cv.height) { s.y = 0; s.x = Math.random() * cv.width; } g.globalAlpha = s.z * 0.7; g.fillRect(s.x, s.y, s.z * 2, s.z * 2); });
    g.globalAlpha = 1;
  };

  const show = () => {
    if (active || style() === 'off') return;
    active = true; build(); if (style() === 'stars') stars = [];
    paint(); timer = setInterval(paint, 10_000); raf = requestAnimationFrame(move);
    document.getElementById('canvas').classList.add('saving');
  };
  const hide = () => {
    if (!active) return;
    active = false; cancelAnimationFrame(raf); clearInterval(timer); stars = null;
    overlay?.remove(); overlay = null;
    document.getElementById('canvas').classList.remove('saving');
  };
  const wake = () => { idleAt = Date.now(); hide(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
  const check = setInterval(() => {
    if (style() === 'off') { hide(); return; }
    if (document.querySelector('.overlay:not([hidden])')) { idleAt = Date.now(); return; }   // a dialog is open
    if (!active && Date.now() - idleAt > idleMs()) show();
  }, 15_000);
  return { wake, isActive: () => active, stop: () => { clearInterval(check); hide(); } };
}
