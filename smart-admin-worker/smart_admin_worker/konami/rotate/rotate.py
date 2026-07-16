import os
import random
import sys

from dotenv import load_dotenv
from patchright.sync_api import Page, TimeoutError as PWTimeout, sync_playwright


def human_pause(min_ms: int = 400, max_ms: int = 1400) -> int:
    return random.randint(min_ms, max_ms)


def launch_random_chromium(p, headless: bool):
    common = {
        "headless": headless,
        "slow_mo": random.randint(60, 150),
        "args": ["--disable-blink-features=AutomationControlled"],
    }
    candidates = [
        ("bundled-chromium", lambda: p.chromium.launch(**common)),
        ("chrome", lambda: p.chromium.launch(channel="chrome", **common)),
        ("msedge", lambda: p.chromium.launch(channel="msedge", **common)),
    ]
    random.shuffle(candidates)
    last_err = None
    for label, factory in candidates:
        try:
            browser = factory()
            return browser, label
        except Exception as e:
            print(f"       Brauzer {label!r} mavjud emas: {type(e).__name__}")
            last_err = e
            continue
    raise RuntimeError(f"Hech qaysi brauzer ishga tushmadi: {last_err}")

FORGOT_URL = "https://my.konami.net/en_US/password-reminder/input-email-address"

EMAIL_SELECTORS = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="login_id"]',
    'input[id*="email" i]',
]
SUBMIT_SELECTORS = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Next")',
    'button:has-text("Send")',
    'button:has-text("Submit")',
    'button:has-text("Continue")',
    'a:has-text("Next")',
    'a:has-text("Send")',
    'a:has-text("Submit")',
    '[role="button"]:has-text("Next")',
    '[role="button"]:has-text("Send")',
    '[role="button"]:has-text("Submit")',
    'input[value="Next" i]',
    'input[value="Send" i]',
    'input[value="Submit" i]',
    '*[class*="submit" i][class*="btn" i]',
    '*[class*="next" i][class*="btn" i]',
]
SUCCESS_KEYWORDS = [
    "sent",
    "check your email",
    "we have sent",
    "email has been sent",
    "instructions",
]

COOKIE_ACCEPT_SELECTORS = [
    "#onetrust-accept-btn-handler",
    "button#onetrust-accept-btn-handler",
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Allow all")',
    'button:has-text("Agree")',
    "[aria-label*='accept' i]",
]


def first_visible(page: Page, selectors: list[str], timeout: int = 8000):
    last_err = None
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=timeout)
            return loc
        except PWTimeout as e:
            last_err = e
            continue
    raise RuntimeError(
        f"Hech qaysi selector topilmadi: {selectors}. "
        "Sahifa o'zgargan bo'lishi mumkin — selectorlarni yangilang."
    ) from last_err


def dump_buttons(page: Page) -> None:
    print("       --- Sahifadagi tugma-elementlar (debug) ---")
    candidates = page.evaluate(
        """() => {
            const sel = 'button, input[type=submit], input[type=button], a, [role=button], [class*=btn i], [class*=button i]';
            return [...document.querySelectorAll(sel)].slice(0, 30).map(el => ({
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                text: (el.innerText || el.value || '').trim().slice(0, 60),
                id: el.id || '',
                cls: el.className?.toString().slice(0, 80) || '',
                visible: !!(el.offsetWidth || el.offsetHeight),
            }));
        }"""
    )
    for c in candidates:
        if c["text"] or c["id"]:
            print(f"       {c['tag']}[type={c['type']}] text={c['text']!r} id={c['id']!r} cls={c['cls']!r} visible={c['visible']}")
    print("       --------------------------------------------")


def remove_overlays(page: Page) -> None:
    removed = page.evaluate(
        """() => {
            const ids = ['onetrust-banner-sdk', 'onetrust-consent-sdk', 'onetrust-pc-sdk'];
            let n = 0;
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) { el.remove(); n++; }
            }
            const high = [...document.querySelectorAll('div')].filter(el => {
                const s = getComputedStyle(el);
                const z = parseInt(s.zIndex) || 0;
                return z > 1000 && s.position === 'fixed' && el.offsetWidth > 200 && el.offsetHeight > 100;
            });
            for (const el of high) { el.style.pointerEvents = 'none'; el.style.display = 'none'; n++; }
            return n;
        }"""
    )
    if removed:
        print(f"       Overlay tozalandi: {removed} ta element")


def diagnose_button(page: Page, btn) -> dict:
    info = page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) return {found: false};
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
            return {
                found: true,
                tag: el.tagName,
                disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
                visible: !!(el.offsetWidth || el.offsetHeight),
                rect: {x: r.x, y: r.y, w: r.width, h: r.height},
                topAtCenter: top ? (top.tagName + '#' + top.id + '.' + top.className).slice(0, 80) : null,
                isSelf: top === el,
            };
        }""",
        "button[type=\"submit\"]",
    )
    return info


def click_submit(page: Page, email_locator) -> None:
    try:
        btn = first_visible(page, SUBMIT_SELECTORS, timeout=4000)
        print(f" Submit topildi: {btn}")
    except RuntimeError:
        print(" Submit selectorlar topilmadi — Enter bosib ko'raman")
        try:
            email_locator.press("Enter")
            print(" Enter bosildi")
            return
        except Exception as e:
            print(f" Enter ham ishlamadi: {e}")
        dump_buttons(page)
        raise RuntimeError("Submit tugmasi topilmadi.")

    info = diagnose_button(page, btn)
    print(f" Tugma holati: {info}")

    # ==================== YANGI: SICHQONCHA HARAKATI ====================
    if info.get("found") and info.get("rect"):
        rect = info["rect"]
        # Tugma ichidagi random nuqta
        padding = 8
        target_x = int(rect["x"] + random.randint(padding, max(padding, rect["w"] - padding)))
        target_y = int(rect["y"] + random.randint(padding, max(padding, rect["h"] - padding)))

        print(f"🖱 Sichqoncha random nuqtadan tugma ichidagi ({target_x}, {target_y}) ga harakatlanmoqda...")

        # Random boshlang'ich nuqtadan harakat
        start_x = random.randint(80, 500)
        start_y = random.randint(80, 400)
        
        steps = random.randint(25, 35)
        for i in range(1, steps + 1):
            ratio = i / steps
            eased = ratio * ratio * (3 - 2 * ratio)  # tabiiy harakat
            
            x = int(start_x + (target_x - start_x) * eased + random.uniform(-10, 10))
            y = int(start_y + (target_y - start_y) * eased + random.uniform(-8, 8))
            
            page.mouse.move(x, y)
            page.wait_for_timeout(random.randint(10, 28))

        # Oxirgi aniq nuqta
        page.mouse.move(target_x, target_y)
        page.wait_for_timeout(random.randint(60, 140))

        print("   ✅ Sichqoncha tugmaga yetkazildi")
    # =================================================================

    if info.get("found") and not info.get("isSelf"):
        print(f" OGOH: tugma ustida boshqa element bor: {info.get('topAtCenter')}. Overlay tozalanyapti...")
        remove_overlays(page)
        page.wait_for_timeout(300)

    # Eski click usullari (o'zgarmagan)
    click_methods = [
        ("mouse click", lambda: page.mouse.click(target_x, target_y)),  # yangi qo'shildi
        ("native click", lambda: btn.click(timeout=5000)),
        ("force click", lambda: btn.click(force=True, timeout=5000)),
        ("JS click", lambda: page.evaluate("document.querySelector('button[type=\"submit\"]').click()")),
        ("dispatch event", lambda: btn.dispatch_event("click")),
        ("Enter on email", lambda: email_locator.press("Enter")),
    ]

    request_seen = {"posted": False}
    def on_request(req):
        if req.method == "POST" or "password-reminder" in req.url:
            request_seen["posted"] = True
            print(f" >>> Network: {req.method} {req.url}")

    page.on("request", on_request)

    try:
        for name, fn in click_methods:
            print(f" Click usuli: {name}")
            try:
                fn()
            except Exception as e:
                print(f" xato: {e}")
                continue
            page.wait_for_timeout(1500)
            if request_seen["posted"] or page.url != FORGOT_URL:
                print(f" {name!r} ishladi (network/url o'zgardi)")
                return
        raise RuntimeError("Hech qaysi click usuli ishlamadi — Konami silent throttle yoki sahifa tuzilishi o'zgargan.")
    finally:
        page.remove_listener("request", on_request)

def dismiss_cookies(page: Page) -> None:
    try:
        clicked = page.evaluate(
            """() => {
                const ids = ['onetrust-accept-btn-handler', 'accept-recommended-btn-handler'];
                for (const id of ids) {
                    const el = document.getElementById(id);
                    if (el) { el.click(); return id; }
                }
                const all = [...document.querySelectorAll('button, a, [role=button]')];
                const accept = all.find(el => /^(accept all|accept|allow all|i agree|agree)$/i.test((el.innerText || '').trim()));
                if (accept) { accept.click(); return accept.innerText.trim(); }
                return null;
            }"""
        )
        if clicked:
            print(f"       Cookie banner yopildi (JS click): {clicked}")
            page.wait_for_timeout(800)
            return
    except Exception as e:
        print(f"       JS click xatosi: {e}")

    for sel in COOKIE_ACCEPT_SELECTORS:
        try:
            btn = page.locator(sel).first
            btn.wait_for(state="visible", timeout=2000)
            btn.click(force=True)
            print(f"       Cookie banner yopildi (locator): {sel}")
            page.wait_for_timeout(800)
            return
        except PWTimeout:
            continue
        except Exception:
            continue
    print("       Cookie banner topilmadi (ehtimol allaqachon yo'q yoki boshqa ID)")


def request_reset(page: Page, email: str) -> None:
    print(f"[1/3] Forgot password sahifasiga o'tyapman: {FORGOT_URL}")
    page.goto(FORGOT_URL, wait_until="domcontentloaded")

    wait1 = human_pause(1800, 2800)
    print(f"       Cookie banner kutilmoqda ({wait1}ms)")
    page.wait_for_timeout(wait1)
    dismiss_cookies(page)
    page.wait_for_timeout(human_pause(600, 1500))

    print("[2/3] Email kiritilmoqda (human-like)")
    email_input = first_visible(page, EMAIL_SELECTORS)
    email_input.click()
    page.wait_for_timeout(human_pause(200, 600))
    email_input.fill("")
    page.wait_for_timeout(human_pause(150, 400))
    for ch in email:
        email_input.press_sequentially(ch, delay=0)
        page.wait_for_timeout(random.randint(40, 180))
    email_input.press("Tab")
    page.wait_for_timeout(human_pause(700, 1600))

    actual = email_input.input_value()
    if actual != email:
        print(f"       OGOHLANTIRISH: input qiymati kutilgandan farq qiladi: {actual!r} != {email!r}")

    print("[3/3] Submit bosilmoqda")
    click_submit(page, email_input)

    print("       Sahifa o'zgarishini kutmoqda...")
    try:
        page.wait_for_function(
            f"() => location.href !== {FORGOT_URL!r} || /sent|check your email|instructions/i.test(document.body.innerText)",
            timeout=15_000,
        )
    except PWTimeout:
        pass

    page.wait_for_timeout(500)
    inline_error = page.evaluate(
        """() => {
            const candidates = [...document.querySelectorAll('[class*=error i], [class*=alert i], [role=alert], [aria-live]')];
            const txt = candidates.map(el => el.innerText?.trim()).filter(Boolean).join(' | ');
            return txt || null;
        }"""
    )
    if inline_error:
        print(f"       Inline xato/alert topildi: {inline_error}")

    try:
        page.wait_for_load_state("networkidle", timeout=20_000)
    except PWTimeout:
        pass

    body_text = page.locator("body").inner_text().lower()
    if any(kw in body_text for kw in SUCCESS_KEYWORDS):
        print(f"       OK: tasdiq xabari topildi. URL: {page.url}")
        return

    if page.url != FORGOT_URL:
        print(f"       Sahifa o'zgardi (ehtimol tasdiq sahifasi): {page.url}")
        return

    raise RuntimeError(
        "Tasdiq xabari topilmadi va URL o'zgarmadi. "
        "Submit ishlamagan bo'lishi mumkin — failure.png screenshot'ga qarang."
    )


def main() -> int:
    load_dotenv()
    email = os.environ.get("KONAMI_EMAIL")
    headless = os.environ.get("HEADLESS", "false").lower() == "true"

    if not email:
        print("ERROR: KONAMI_EMAIL .env'da o'rnatilmagan", file=sys.stderr)
        return 2

    viewports = [
        {"width": 1280, "height": 800},
        {"width": 1440, "height": 900},
        {"width": 1536, "height": 864},
        {"width": 1366, "height": 768},
    ]
    locales = ["en-US", "en-GB", "en-CA"]
    timezones = ["America/New_York", "Europe/London", "Europe/Berlin", "Asia/Tokyo"]

    with sync_playwright() as p:
        browser, label = launch_random_chromium(p, headless)
        print(f"       Brauzer tanlandi: {label}")
        context = browser.new_context(
            locale=random.choice(locales),
            timezone_id=random.choice(timezones),
            viewport=random.choice(viewports),
        )
        page = context.new_page()
        try:
            request_reset(page, email)
        except Exception as e:
            print(f"FAILED: {e}", file=sys.stderr)
            page.screenshot(path="failure.png", full_page=True)
            print("Screenshot saqlandi: failure.png", file=sys.stderr)
            return 1
        finally:
            context.close()
            browser.close()

    print(f"OK: {email} ga reset linki yuborildi (Konami tasdiqlagan bo'lsa)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
