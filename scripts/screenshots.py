"""
اختبار شامل للواجهة (End-to-End) عبر Playwright + التقاط صور الشاشة لدراسة الحالة.
الاستخدام:  python3 scripts/screenshots.py http://localhost:3000
"""
import json, sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CASE = json.loads((ROOT / "scripts" / "case_study.json").read_text(encoding="utf-8"))
errors = []


def shot(page, name, full=False):
    page.add_style_tag(content=".toast{display:none!important}")
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("📸", name)


def answer_all(page, answers, captures=None):
    captures = captures or {}
    seen = []
    for _ in range(80):
        page.wait_for_selector("#qf, #finishBtn")
        if page.query_selector("#finishBtn"):
            break
        qid = page.get_attribute("#qf", "data-qid")
        seen.append(qid)
        assert qid in answers, f"سؤال غير متوقع ظهر: {qid}"
        page.check(f'#qf input[value="{answers[qid]}"]')
        if qid in captures:
            shot(page, captures[qid])
        page.click("#nextBtn")
        page.wait_for_function("(q) => !document.querySelector('#qf') || document.querySelector('#qf').dataset.qid !== q", arg=qid)
    return seen


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1366, "height": 860}, device_scale_factor=1.5, locale="ar")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1) تسجيل الدخول + إنشاء الحساب
    page.goto(BASE + "/#/login")
    page.wait_for_selector("form#f")
    shot(page, "01-login")
    page.click("text=أنشئ حساباً مجانياً")
    page.fill("input[name=name]", "م. أحمد الكبيسي")
    page.fill("input[name=email]", "ahmed@alnukhba.iq")
    page.fill("input[name=password]", "Str0ngPass!")
    page.click("button:has-text('إنشاء الحساب')")

    # 2) ملف الشركة
    page.wait_for_selector("input[name=employees]")
    c = CASE["company"]
    page.fill("input[name=name]", c["name"])
    page.select_option("select[name=sector]", c["sector"])
    page.fill("input[name=employees]", str(c["employees"]))
    for k in ["uses_cloud", "remote_work", "card_payments", "has_website"]:
        page.set_checked(f"input[name={k}]", c[k])
    shot(page, "02-company-profile")
    page.click("button:has-text('حفظ ومتابعة')")

    # 3) لوحة التحكم الفارغة
    page.wait_for_selector("#startBtn")
    shot(page, "03-dashboard-empty")

    # 4) التقييم الأول (قبل التحسين)
    page.click("#startBtn")
    seen = answer_all(page, CASE["before"], {"GV-1": "04-question-govern", "PR-1": "05-question-mfa-skip-logic"})
    assert "GV-2" not in seen, "منطق التخطي فشل: سؤال السياسات ظهر رغم عدم وجود مسؤول"
    assert "PR-14" not in seen, "منطق التخطي فشل: سؤال الدفع الإلكتروني ظهر"
    assert "RS-2" not in seen, "منطق التخطي فشل: RS-2 ظهر رغم عدم وجود خطة"
    shot(page, "06-questionnaire-complete")
    page.click("#finishBtn")
    page.wait_for_selector(".gauge")
    shot(page, "07-report-overview")
    page.evaluate("document.querySelector('.fn-bars').scrollIntoView({block:'center'})")
    shot(page, "08-report-functions")
    page.evaluate("document.querySelector('#recs').scrollIntoView()")
    page.evaluate("window.scrollBy(0,-170)")
    shot(page, "09-report-recommendations")
    page.click(".plan-tabs button[data-f=qw]")
    shot(page, "10-report-quick-wins")
    shot(page, "report-full-before", full=True)
    first = page.evaluate("location.hash")

    # 5) التقييم الثاني بعد 30 يوماً (تتبع التقدم)
    page.goto(BASE + "/#/dashboard")
    page.wait_for_selector("#startBtn")
    page.click("#startBtn")
    seen2 = answer_all(page, CASE["after"])
    assert "GV-2" in seen2 and "RS-2" in seen2
    page.click("#finishBtn")
    page.wait_for_selector(".gauge")
    shot(page, "11-report-after-improvement")
    page.evaluate("document.querySelector('.fn-bars').scrollIntoView({block:'center'})")
    shot(page, "12-report-comparison-radar")

    page.goto(BASE + "/#/dashboard")
    page.wait_for_selector("table")
    shot(page, "13-dashboard-history", full=True)

    page.goto(BASE + "/#/about")
    page.wait_for_selector(".tier-pill")
    shot(page, "14-methodology", full=True)

    # 6) العرض على الهاتف
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ar",
                            storage_state=ctx.storage_state())
    mp = m.new_page()
    mp.goto(BASE + "/" + first)
    mp.wait_for_selector(".gauge")
    shot(mp, "15-mobile-report")

    # 7) تصدير PDF للتقرير
    page.goto(BASE + "/" + first)
    page.wait_for_selector(".gauge")
    page.emulate_media(media="print")
    page.pdf(path=str(ROOT / "docs" / "sample-report.pdf"), format="A4", print_background=True,
             margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"})
    print("📄 sample-report.pdf")
    browser.close()

if errors:
    print("❌ أخطاء في المتصفح:", errors)
    sys.exit(1)
print("✅ اختبار الواجهة اكتمل بدون أخطاء")
