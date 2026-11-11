"""
اختبار شامل للواجهة (End-to-End) عبر Playwright + التقاط صور الشاشة.
يغطي: لوحة الإدارة (الشركات، الأقسام، المعايير، المحاور، أنواع الأقسام، الجولات، التقارير، الإعدادات)
وبوابة مسؤول القسم (رابط + معرّف ← الإجابة ← التسليم).

الاستخدام (على قاعدة بيانات جديدة بالبيانات التجريبية):
    rm -rf data && npm start &
    python3 scripts/screenshots.py http://localhost:3000
"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*.png"):
    old.unlink()
errors = []


def shot(page, name, full=False):
    page.add_style_tag(content=".toast{display:none!important}")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("📸", name)


def scroll_to(page, selector, offset=-90):
    page.evaluate(f"(() => {{ const el = document.querySelector({json.dumps(selector)}); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + ({offset})); }})()")


def watch(page):
    page.on("console", lambda m: m.type == "error" and "401" not in m.text and errors.append(m.text))  # 401 = اختبار المعرّف الخاطئ المقصود
    page.on("pageerror", lambda e: errors.append(str(e)))


def answer_portal(page, pick=None, captures=None):
    captures = captures or {}
    seen = []
    for _ in range(80):
        page.wait_for_selector("#qf, #submit")
        if page.query_selector("#submit"):
            break
        qid = page.get_attribute("#qf", "data-qid")
        seen.append(qid)
        radios = page.query_selector_all("#qf input[type=radio]")
        idx = pick(qid, len(radios)) if pick else 0
        radios[min(idx, len(radios) - 1)].check()
        if qid in captures:
            shot(page, captures.pop(qid))
        page.click("#next")
        page.wait_for_function("(q) => !document.querySelector('#qf') || document.querySelector('#qf').dataset.qid !== q", arg=qid)
    return seen


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, locale="ar")
    page = ctx.new_page(); watch(page)
    page.on("dialog", lambda d: d.accept())

    # ========== 1) دخول الإدارة ==========
    page.goto(BASE + "/#/login"); page.wait_for_selector("form#f")
    shot(page, "01-admin-login")
    page.fill("input[name=username]", "admin"); page.fill("input[name=password]", "Admin@12345")
    page.click("button:has-text('دخول')")
    page.wait_for_selector(".kpi")
    shot(page, "02-admin-overview", full=True)

    # ========== 2) الشركات ==========
    page.goto(BASE + "/#/companies"); page.wait_for_selector(".g3 .card")
    shot(page, "03-companies")
    api = lambda method, url, body=None: page.evaluate(
        "async ([m,u,b]) => { const r = await fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}); return r.json(); }",
        [method, url, body])
    companies = api("GET", "/api/admin/companies")
    raf = next(c for c in companies if c["size"] == "medium")
    nuk = next(c for c in companies if c["size"] == "small")

    page.goto(BASE + f"/#/company/{raf['id']}?tab=depts"); page.wait_for_selector(".code-pill")
    shot(page, "04-company-departments")

    # ========== 3) أنواع الأقسام: إضافة نوع جديد ==========
    page.goto(BASE + "/#/types"); page.wait_for_selector("#add")
    page.click("#add")
    page.fill("dialog input[name=name]", "التسويق الرقمي")
    page.fill("dialog input[name=description]", "إدارة حسابات التواصل الاجتماعي والإعلانات والموقع")
    for q in ["PR-15", "RC-3", "PR-1"]:
        page.check(f"dialog input[name=questions][value='{q}']")
    shot(page, "05-add-department-type")
    page.click("dialog button[value=ok]"); page.wait_for_timeout(1000)
    shot(page, "06-department-types")

    # ========== 4) المحاور: إضافة محور جديد ==========
    page.goto(BASE + "/#/functions"); page.wait_for_selector("#add")
    page.click("#add")
    page.fill("dialog input[name=code]", "PDP")
    page.fill("dialog input[name=name]", "حماية البيانات الشخصية")
    page.fill("dialog input[name=name_en]", "Personal Data Protection")
    page.fill("dialog textarea[name=goal]", "التعامل المسؤول مع بيانات العملاء الشخصية وموافقتهم.")
    page.click("dialog button[value=ok]"); page.wait_for_timeout(1000)
    shot(page, "07-functions")

    # ========== 5) إضافة سؤال جديد من المحرر ==========
    page.goto(BASE + "/#/question/new"); page.wait_for_selector("#f")
    page.fill("input[name=id]", "PDP-1")
    page.select_option("select[name=fn]", "PDP")
    page.fill("textarea[name=text]", "هل يحصل القسم على موافقة صريحة من العملاء قبل جمع بياناتهم الشخصية أو استخدامها في التسويق؟")
    page.fill("textarea[name=help]", "جمع البيانات بدون موافقة يعرّض الشركة لمخاطر قانونية ويضر بثقة العملاء.")
    page.fill("input[name=ref]", "GV.OC-03")
    page.fill("input[name=weight]", "3")
    for label in ["المبيعات وخدمة العملاء", "التسويق الرقمي"]:
        page.check(f"label.check:has-text('{label}') input")
    rows = page.query_selector_all(".opt-row")
    rows[2].query_selector("details").evaluate("d => d.open = true")
    rows[2].query_selector(".r-title").fill("اطلب موافقة صريحة وسجّلها")
    rows[2].query_selector(".r-action").fill("أضف خانة موافقة غير مُعلَّمة مسبقاً في نماذج الموقع والمتجر، واحفظ تاريخ الموافقة، ووفّر رابطاً لإلغاء الاشتراك في كل رسالة تسويقية.")
    rows[2].query_selector(".r-priority").select_option("high")
    rows[1].query_selector("details").evaluate("d => d.open = true")
    rows[1].query_selector(".r-title").fill("وحّد إجراء الموافقة في كل القنوات")
    rows[1].query_selector(".r-action").fill("طبّق نفس نموذج الموافقة في الموقع ومركز الاتصال ومنصات التواصل.")
    shot(page, "08-question-editor-new", full=True)
    page.click("button:has-text('حفظ السؤال')")
    page.wait_for_selector("#qlist .q-item")
    shot(page, "09-criteria-list")
    page.goto(BASE + "/#/question/PR-1"); page.wait_for_selector(".opt-row")
    shot(page, "10-question-editor-mfa", full=True)

    # ========== 6) إضافة قسم جديد بمسؤوله ==========
    page.goto(BASE + f"/#/company/{raf['id']}?tab=depts"); page.wait_for_selector("#addDept")
    page.click("#addDept")
    page.fill("dialog input[name=name]", "التسويق الرقمي")
    label = page.eval_on_selector("dialog select[name=type_id]", "s => [...s.options].find(o => o.text.startsWith('التسويق الرقمي')).text")
    page.select_option("dialog select[name=type_id]", label=label)
    page.fill("dialog input[name=employees]", "5")
    page.fill("dialog input[name=description]", "الإعلانات وحسابات التواصل الاجتماعي")
    page.fill("dialog input[name=head_name]", "زهراء قاسم العزاوي")
    page.fill("dialog input[name=head_title]", "مديرة التسويق الرقمي")
    page.fill("dialog input[name=head_email]", "zahraa@rafidain-shop.example")
    page.fill("dialog input[name=head_phone]", "0750 300 6077")
    shot(page, "11-add-department-modal")
    page.click("dialog button[value=ok]"); page.wait_for_timeout(1200)

    # ========== 7) متابعة الجولة المفتوحة ==========
    detail = api("GET", f"/api/admin/companies/{raf['id']}")
    open_round = next(r for r in detail["rounds"] if r["status"] == "open")
    page.goto(BASE + f"/#/round/{open_round['id']}"); page.wait_for_selector("table")
    shot(page, "12-round-in-progress")

    # ========== 8) بوابة مسؤول القسم ==========
    depts = {d["name"]: d for d in detail["departmentsList"]}
    portal = browser.new_context(viewport={"width": 1280, "height": 860}, device_scale_factor=1.5, locale="ar")
    pp = portal.new_page(); watch(pp)
    mkt = depts["التسويق الرقمي"]
    pp.goto(BASE + f"/#/d/{mkt['link_token']}"); pp.wait_for_selector("input[name=code]")
    shot(pp, "13-portal-link-login")
    pp.fill("input[name=code]", "WRONG-0000"); pp.click("button:has-text('دخول')"); pp.wait_for_selector("#err:not(:empty)")
    pp.fill("input[name=code]", mkt["access_code"]); pp.click("button:has-text('دخول')")
    pp.wait_for_selector(".portal-head")
    seen = answer_portal(pp, pick=lambda q, n: 0 if q in ("PR-15", "PR-1") else n - 1 if q == "PDP-1" else 1,
                         captures={"PDP-1": "14-portal-question-new-criterion", "PR-1": "15-portal-question-mfa"})
    assert "PDP-1" in seen and "PR-1" in seen and "RC-3" in seen, seen
    assert "PR-5" not in seen, "سؤال تقنية المعلومات ظهر لقسم التسويق"
    shot(pp, "16-portal-all-answered")
    pp.click("#submit"); pp.wait_for_selector(".gauge")
    shot(pp, "17-portal-submitted-summary", full=True)

    for name in ["المبيعات وخدمة العملاء", "المستودعات والتوصيل"]:
        d = depts[name]
        c2 = browser.new_context(locale="ar"); p2 = c2.new_page(); watch(p2)
        p2.goto(BASE + f"/#/d/{d['link_token']}"); p2.wait_for_selector("input[name=code]")
        p2.fill("input[name=code]", d["access_code"]); p2.click("button:has-text('دخول')")
        p2.wait_for_selector("#qf, #submit")
        s = answer_portal(p2, pick=lambda q, n: 0 if q in ("PR-4", "PR-9", "PDP-1") else 1)
        if name.startswith("المبيعات"):
            assert "PDP-1" in s and "PR-14" in s, s
        p2.click("#submit"); p2.wait_for_selector(".gauge"); c2.close()

    # ========== 9) إغلاق الجولة والتقرير ==========
    page.goto(BASE + f"/#/round/{open_round['id']}"); page.wait_for_selector("#closeR")
    page.click("#closeR"); page.wait_for_selector("#reopenR"); page.wait_for_selector(".gauge")
    shot(page, "18-round-report-overview")
    scroll_to(page, ".heat")
    shot(page, "19-round-heatmap-departments")
    scroll_to(page, ".radar", -160)
    shot(page, "20-round-functions")
    scroll_to(page, ".recs")
    shot(page, "21-round-recommendations")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    shot(page, "22-round-weakest-criteria")
    page.goto(BASE + f"/#/round/{open_round['id']}/dept/{mkt['id']}"); page.wait_for_selector(".gauge")
    shot(page, "23-department-detail")

    # ========== 10) شركة صغيرة: تطور الجاهزية ==========
    page.goto(BASE + f"/#/company/{nuk['id']}"); page.wait_for_selector(".gauge")
    shot(page, "24-small-company-progress", full=True)
    page.goto(BASE + f"/#/company/{raf['id']}?tab=rounds"); page.wait_for_selector("table")
    shot(page, "25-company-rounds")

    page.goto(BASE + "/#/settings"); page.wait_for_selector("#f")
    shot(page, "26-settings")
    page.goto(BASE + "/#/"); page.wait_for_selector(".kpi")
    shot(page, "27-overview-after", full=True)

    # ========== 11) الهاتف ==========
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ar")
    mp = m.new_page(); watch(mp)
    nd = api("GET", f"/api/admin/companies/{nuk['id']}")
    api("POST", f"/api/admin/companies/{nuk['id']}/rounds", {"title": "تقييم الربع الرابع"})
    hr = next(d for d in nd["departmentsList"] if d["name"].startswith("الموارد"))
    mp.goto(BASE + f"/#/d/{hr['link_token']}"); mp.wait_for_selector("input[name=code]")
    mp.fill("input[name=code]", hr["access_code"]); mp.click("button:has-text('دخول')"); mp.wait_for_selector("#qf")
    shot(mp, "28-mobile-portal")

    # ========== 12) PDF ==========
    page.goto(BASE + f"/#/round/{open_round['id']}"); page.wait_for_selector(".gauge")
    page.emulate_media(media="print")
    page.pdf(path=str(ROOT / "docs" / "sample-report.pdf"), format="A4", print_background=True,
             margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"})
    print("📄 sample-report.pdf")
    browser.close()

if errors:
    print("❌ أخطاء في المتصفح:", errors)
    sys.exit(1)
print("✅ اختبار الواجهة اكتمل بدون أخطاء")
