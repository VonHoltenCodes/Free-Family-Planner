"""Demo mode end-to-end check (Playwright, python). Run a dev server first:
    python3 tools/serve.py --port 8766 --no-open
    python3 tests/demo_mode_test.py            # BASE=http://... to point elsewhere
config.js is stubbed with config.example.js (backend 'local') so nothing of yours is touched."""
import os, re, sys, pathlib
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://127.0.0.1:8766/')
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(os.environ.get('OUT', '/tmp'))
example = (ROOT / 'web/config.example.js').read_text().replace("backend: 'sync'", "backend: 'local'")
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else '')); 
    if not ok: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1080, 'height': 1920}); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.route(re.compile(r'config\.js'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=example))
    page.route(re.compile(r'api\.weather\.gov|open-meteo|ws4kp'), lambda r: r.abort())
    page.goto(BASE); page.wait_for_timeout(2500)
    opts = page.eval_on_selector_all('#cal-select option', 'o => o.map(x => [x.value, x.textContent, x.selected])')
    check('1 picker visible with demo option (no Google)', page.is_visible('#cal-select') and any(v == 'demo' for v, *_ in opts), str(opts))
    check('1b real title shown', page.text_content('#hdr-title').startswith('OUR FAMILY'), page.text_content('#hdr-title'))
    before = page.evaluate("localStorage.getItem('fp.data')")
    page.select_option('#cal-select', 'demo'); page.wait_for_load_state('load'); page.wait_for_timeout(3000)
    title = page.text_content('#hdr-title'); opts = page.eval_on_selector_all('#cal-select option', 'o => o.map(x => [x.value, x.textContent, x.selected])')
    check('2 demo title', title.startswith('THE PARKER FAMILY'), title)
    check('2b demo option selected + back option', page.input_value('#cal-select') == 'demo' and any(v == '' for v, *_ in opts), str(opts))
    chips = page.locator('.chip').count(); hol = page.locator('.chip.holiday').count()
    shop = page.eval_on_selector_all('#shop-list li .txt', 'o => o.map(x => x.textContent)')
    chores = page.eval_on_selector_all('#kids .kn', 'o => o.map(x => x.textContent)')
    chore_txt = page.eval_on_selector_all('#kids .chore input', 'o => o.map(x => x.value)')
    meals = page.eval_on_selector_all('#meals textarea', 'o => o.map(x => x.value)')
    notes = page.eval_on_selector_all('#note-list li .txt', 'o => o.map(x => x.textContent)')
    check('3 month grid has demo events', chips >= 20, f'chips={chips} holidays={hol}')
    check('3b shopping list seeded', 'Milk' in shop, str(shop))
    check('3c kids are demo kids', chores == ['EMMA', 'JACK'], str(chores))
    check('3d chores seeded', 'Make bed' in chore_txt, str(chore_txt))
    check('3e meals seeded', 'Tacos' in meals, str(meals))
    check('3f notes seeded', any('plumber' in n for n in notes), str(notes))
    check('3g footer says sample data', 'SAMPLE DATA' in page.text_content('#status-footer'), page.text_content('#status-footer'))
    check('3h data LED label', page.text_content('#led-fb-label') == 'DEMO DATA', page.text_content('#led-fb-label'))
    week = page.locator('#week .chip, .wday .chip').count(); check('3i week ahead populated', week >= 3, f'week chips={week}')
    # edits work in memory and vanish on reload
    page.fill('#shop-input', 'Ice cream'); page.press('#shop-input', 'Enter'); page.wait_for_timeout(300)
    check('4 add item in demo works', 'Ice cream' in page.eval_on_selector_all('#shop-list li .txt', 'o => o.map(x => x.textContent)'))
    page.reload(); page.wait_for_timeout(2500)
    check('4b edit gone after reload, still demo', 'Ice cream' not in page.eval_on_selector_all('#shop-list li .txt', 'o => o.map(x => x.textContent)') and page.text_content('#hdr-title').startswith('THE PARKER'))
    check('4c real local data untouched by demo edits', page.evaluate("localStorage.getItem('fp.data')") == before)
    page.screenshot(path=str(OUT / 'demo_portrait.png'))
    page.click('#btn-setup'); page.wait_for_timeout(300)
    check('5 setup blocked in demo', page.is_hidden('#setup-overlay') if page.locator('#setup-overlay').count() else True, page.text_content('#toast'))
    page.select_option('#cal-select', ''); page.wait_for_load_state('load'); page.wait_for_timeout(2500)
    check('6 back to real title', page.text_content('#hdr-title').startswith('OUR FAMILY'), page.text_content('#hdr-title'))
    check('6b demo flag cleared', page.evaluate("localStorage.getItem('fp.demo')") is None)
    page.goto(BASE + '?demo=1'); page.wait_for_timeout(2500)
    check('8 ?demo=1 enters demo and strips the param', page.text_content('#hdr-title').startswith('THE PARKER') and 'demo' not in page.url, page.url)
    page.goto(BASE + '?demo=0'); page.wait_for_timeout(2500)
    check('8b ?demo=0 leaves demo', page.text_content('#hdr-title').startswith('OUR FAMILY') and page.evaluate("localStorage.getItem('fp.demo')") is None, page.url)
    check('7 no page errors', not errors, '; '.join(errors)[:300])
    b.close()
print('FAILED:', fails) if fails else print('ALL PASS')
sys.exit(1 if fails else 0)
