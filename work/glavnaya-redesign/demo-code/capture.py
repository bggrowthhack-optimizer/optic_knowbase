"""Снимает настоящую разметку и стили /home-demo для статической копии-артефакта."""
import base64, json, re
from playwright.sync_api import sync_playwright

B = "/tmp/claude-0/-home-user-optic-knowbase/305574ce-e6be-5e33-84fe-13d1578ffffb/scratchpad/glavnaya-artifact"
BASE = "http://localhost:3008"
out = {}

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ctx = b.new_context(viewport={"width": 1440, "height": 1000}, color_scheme="light")
    pg = ctx.new_page()
    pg.goto(BASE + "/login"); pg.wait_for_selector('input[placeholder="Введите логин"]', timeout=60000)
    pg.fill('input[placeholder="Введите логин"]', "kd@demo.local"); pg.fill('input[placeholder="Введите пароль"]', "demo12345")
    pg.click('button[type="submit"]'); pg.wait_for_timeout(2500)
    pg.goto(BASE + "/home-demo"); pg.wait_for_timeout(5000)
    # светлая тема явно
    pg.evaluate("localStorage.setItem('theme','light')")
    pg.reload(); pg.wait_for_timeout(5000)

    # --- CSS
    hrefs = pg.evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href)")
    inline_styles = pg.evaluate("[...document.querySelectorAll('style')].map(s=>s.textContent).join('\\n')")
    css = ""
    for h in hrefs:
        css += pg.request.get(h).text() + "\n"
    css += inline_styles

    def embed(m):
        url = m.group(1).strip("'\"")
        if url.startswith("data:"):
            return m.group(0)
        full = url if url.startswith("http") else BASE + (url if url.startswith("/") else "/_next/static/css/" + url)
        r = pg.request.get(full)
        if not r.ok:
            return m.group(0)
        ext = url.split("?")[0].rsplit(".", 1)[-1]
        mime = {"woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "svg": "image/svg+xml", "png": "image/png"}.get(ext, "application/octet-stream")
        return "url(data:%s;base64,%s)" % (mime, base64.b64encode(r.body()).decode())
    css = re.sub(r"url\(([^)]+)\)", embed, css)
    out["css"] = css
    out["htmlClass"] = pg.evaluate("document.documentElement.className")
    out["htmlStyle"] = pg.evaluate("document.documentElement.getAttribute('style')||''")
    out["bodyClass"] = pg.evaluate("document.body.className")

    clean_js = """(el)=>{const c=el.cloneNode(true);c.querySelectorAll('script,nextjs-portal,noscript').forEach(x=>x.remove());return c.outerHTML}"""

    # --- основная страница (свёрнуто)
    out["page"] = pg.evaluate("""()=>{const c=document.body.cloneNode(true);
      c.querySelectorAll('script,nextjs-portal,noscript,[data-radix-portal],[data-nextjs-toast]').forEach(x=>x.remove());
      // плавающие виджеты (чат, логотип Next) — убираем
      c.querySelectorAll('body > div').forEach(d=>{const s=d.getAttribute('style')||'';});
      return c.innerHTML}""")

    # задачи: свёрнуто / раскрыто (вся секция-обёртка сводки)
    sel_summary = "xpath=//button[contains(.,'Все задачи')]/ancestor::div[contains(@class,'space-y')][1]"
    out["summaryClosed"] = pg.locator(sel_summary).first.evaluate(clean_js)
    pg.click("button:has-text('Все задачи')"); pg.wait_for_timeout(600)
    out["summaryOpen"] = pg.locator("xpath=//button[contains(.,'Свернуть')]/ancestor::div[contains(@class,'space-y')][1]").first.evaluate(clean_js)
    pg.click("button:has-text('Свернуть')"); pg.wait_for_timeout(400)

    def dialog_html():
        return pg.evaluate("""()=>{const d=document.querySelector('[role=dialog]');const src=[...d.querySelectorAll('canvas')];const c=d.cloneNode(true);
          [...c.querySelectorAll('canvas')].forEach((cv,i)=>{const o=src[i];const img=document.createElement('img');try{img.src=o.toDataURL('image/png')}catch(e){};img.style.width=o.style.width||o.clientWidth+'px';img.style.height=o.style.height||o.clientHeight+'px';img.className=o.className;cv.replaceWith(img)});
          return c.outerHTML}""")
    def overlay_html():
        return pg.evaluate("""()=>{const d=document.querySelector('[role=dialog]');const o=d.previousElementSibling;return o?o.outerHTML:''}""")
    def expand_all():
        for _ in range(10):
            btns = pg.locator('[role=dialog] button[aria-expanded="false"]')
            if btns.count() == 0: break
            btns.first.click(); pg.wait_for_timeout(150)

    # --- Анализ филиала: по каждому филиалу с тегом, по вкладкам
    out["analysis"] = {}
    tags = pg.locator("button:has-text('требуют внимания'), button:has-text('требует внимания')")
    n = tags.count()
    for i in range(n):
        name = tags.nth(i).evaluate("b=>{let e=b;for(let k=0;k<8;k++){e=e.parentElement;const h=e.querySelector('h3');if(h)return h.textContent.trim()}return ''}")
        tags.nth(i).click(); pg.wait_for_timeout(900)
        st = {}
        for tab, key in [("Обзор месяца", "month"), ("Обзор смены", "shift"), ("Обзор трендов", "trend")]:
            pg.click(f'[role=dialog] button:text-is("{tab}")'); pg.wait_for_timeout(500)
            if key == "trend":
                pg.click('[role=dialog] button:text-is("По неделям")'); pg.wait_for_timeout(300)
                expand_all(); st["trend_weeks"] = dialog_html()
                pg.click('[role=dialog] button:text-is("К прошлым периодам")'); pg.wait_for_timeout(300)
                expand_all(); st["trend_periods"] = dialog_html()
                pg.click('[role=dialog] button:text-is("По неделям")'); pg.wait_for_timeout(200)
            elif key == "shift":
                for k in range(7):
                    expand_all(); st[f"shift_{k}"] = dialog_html()
                    if k < 6:
                        pg.click('[role=dialog] [aria-label="Предыдущая смена"]'); pg.wait_for_timeout(300)
                st["shift"] = st["shift_0"]
                for k in range(6):
                    pg.click('[role=dialog] [aria-label="Следующая смена"]'); pg.wait_for_timeout(150)
            else:
                expand_all(); st[key] = dialog_html()
        out["overlay"] = overlay_html()
        out["analysis"][name] = st
        pg.keyboard.press("Escape"); pg.wait_for_timeout(600)

    # --- модалки показателей: динамика (клик по плитке) и детализация (иконка)
    out["kpi"] = {}; out["breakdown"] = {}
    tiles = pg.locator('.stagger-item')
    for i in range(tiles.count()):
        t = tiles.nth(i)
        title = t.locator('h3').first.inner_text().strip()
        t.locator('h3').first.click(); pg.wait_for_timeout(3000)
        if pg.locator('[role=dialog]').count():
            out["kpi"][title] = dialog_html(); out["overlay_kpi"] = overlay_html()
            pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
        det = t.locator('button')
        if det.count():
            det.first.click(); pg.wait_for_timeout(2500)
            if pg.locator('[role=dialog]').count():
                out["breakdown"][title] = dialog_html()
                pg.keyboard.press("Escape"); pg.wait_for_timeout(600)

    # --- настройки показателей
    pg.click('[aria-label="Настроить показатели"]'); pg.wait_for_timeout(800)
    out["settings"] = dialog_html()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # --- фильтры (поповер)
    pg.click("button:has-text('Фильтры')"); pg.wait_for_timeout(600)
    out["filters"] = pg.evaluate("""()=>{const w=document.querySelector('[data-radix-popper-content-wrapper]');if(!w)return '';const r=w.firstElementChild.getBoundingClientRect();const c=w.firstElementChild.cloneNode(true);return JSON.stringify({html:c.outerHTML,left:r.left,top:r.top})}""")
    pg.keyboard.press("Escape")
    b.close()

json.dump(out, open(B + "/capture.json", "w"), ensure_ascii=False)
print({k: (len(v) if isinstance(v, str) else list(v.keys()) if isinstance(v, dict) else v) for k, v in out.items()})
