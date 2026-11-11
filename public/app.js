/* درع — الواجهة الأمامية (Vanilla JS, SPA بموجّه hash) */
(() => {
  const $app = document.getElementById('app');
  const $top = document.getElementById('topbar');
  let me = null;

  // ---------- أدوات ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US'));
  const date = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
  const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); };
  const scoreColor = (s) => (s < 40 ? 'var(--critical)' : s < 60 ? 'var(--high)' : s < 80 ? 'var(--medium)' : 'var(--accent)');

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.startsWith('/api/auth/login')) { me = null; location.hash = '#/login'; }
    if (!res.ok) throw Object.assign(new Error(data.error || 'خطأ غير متوقع'), { status: res.status, data });
    return data;
  }

  const SECTORS = { retail: 'تجارة التجزئة', ecommerce: 'تجارة إلكترونية', health: 'الرعاية الصحية', finance: 'خدمات مالية ومحاسبة', education: 'التعليم والتدريب', services: 'خدمات مهنية', manufacturing: 'التصنيع', other: 'أخرى' };
  const FN = { GV: 'الحوكمة', ID: 'التحديد', PR: 'الحماية', DE: 'الكشف', RS: 'الاستجابة', RC: 'التعافي' };
  const FN_ORDER = ['GV', 'ID', 'PR', 'DE', 'RS', 'RC'];
  const PRI = { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
  const EFFORT = { low: 'جهد قليل', medium: 'جهد متوسط', high: 'جهد كبير' };
  const COST = { free: 'مجاني', low: 'تكلفة منخفضة', medium: 'تكلفة متوسطة', high: 'تكلفة عالية' };
  const TIERS = [
    { tier: 1, name: 'جزئي', en: 'Partial', range: '0–39' },
    { tier: 2, name: 'مُدرك للمخاطر', en: 'Risk Informed', range: '40–59' },
    { tier: 3, name: 'قابل للتكرار', en: 'Repeatable', range: '60–79' },
    { tier: 4, name: 'متكيّف', en: 'Adaptive', range: '80–100' },
  ];
  const SHIELD = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l12 5v8c0 8-5.5 13-12 15C9.5 28 4 23 4 15V7z" fill="#0e7c6b"/><path d="M11 16l4 4 7-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- الموجّه ----------
  const routes = {
    login: viewLogin, register: viewRegister, dashboard: viewDashboard,
    profile: viewProfile, assess: viewAssess, report: viewReport, about: viewAbout,
  };
  async function router() {
    const [, name = 'dashboard', param] = location.hash.split('/');
    const isAuth = name === 'login' || name === 'register';
    if (!me && !isAuth) {
      try { me = await api('GET', '/api/auth/me'); } catch { return void (location.hash = '#/login'); }
    }
    document.body.classList.toggle('auth-mode', isAuth);
    $top.hidden = isAuth;
    if (me) document.getElementById('userName').textContent = me.name;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    window.scrollTo(0, 0);
    await (routes[name] || viewDashboard)(param);
  }
  window.addEventListener('hashchange', router);
  document.getElementById('logoutBtn').onclick = async () => { await api('POST', '/api/auth/logout'); me = null; location.hash = '#/login'; };

  // ---------- المصادقة ----------
  function authShell(formHtml) {
    $app.innerHTML = `
      <div class="auth">
        <section class="auth-hero">
          <div>
            <div class="row" style="gap:10px"><span style="width:40px;height:40px;display:block">${SHIELD}</span><b style="font-size:1.3rem;color:#fff">درع</b></div>
            <h1>اعرف مدى جاهزية شركتك السيبرانية في 10 دقائق</h1>
            <p class="lead">منصة تقييم ذكية مصممة للشركات الصغيرة والمتوسطة، مبنية على إطار NIST CSF 2.0، تعطيك درجة واضحة وخطة عمل عملية — لا مجرد وصف لمستوى النضج.</p>
            <ul>
              <li><span class="dot">1</span><div><b>استبيان يتكيّف معك</b><span>لا نسألك عن السحابة إن لم تستخدمها، ونركّز على المجالات الأخطر.</span></div></li>
              <li><span class="dot">2</span><div><b>درجة ومستوى نضج لكل وظيفة</b><span>الحوكمة، التحديد، الحماية، الكشف، الاستجابة، التعافي.</span></div></li>
              <li><span class="dot">3</span><div><b>توصيات قابلة للتنفيذ</b><span>مرتبة حسب الأولوية مع خطة 7 / 30 / 90 يوماً.</span></div></li>
            </ul>
          </div>
          <div class="fn-strip">${FN_ORDER.map((c) => `<span>${FN[c]} · ${c}</span>`).join('')}</div>
        </section>
        <section class="auth-form"><div class="card">${formHtml}</div></section>
      </div>`;
  }

  function viewLogin() {
    authShell(`
      <h2>تسجيل الدخول</h2>
      <p class="muted">أهلاً بعودتك. ادخل لمتابعة تقييماتك.</p>
      <form id="f">
        <div class="field"><label>البريد الإلكتروني</label><input type="email" name="email" required autocomplete="email" dir="ltr"></div>
        <div class="field"><label>كلمة المرور</label><input type="password" name="password" required autocomplete="current-password" dir="ltr"></div>
        <div class="error" id="err"></div>
        <button class="btn lg" style="width:100%;justify-content:center">دخول</button>
      </form>
      <p class="muted" style="margin-top:18px;text-align:center">ليس لديك حساب؟ <a href="#/register">أنشئ حساباً مجانياً</a></p>`);
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try { await api('POST', '/api/auth/login', fd); me = null; location.hash = '#/dashboard'; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  }

  function viewRegister() {
    authShell(`
      <h2>إنشاء حساب</h2>
      <p class="muted">ابدأ تقييم شركتك مجاناً.</p>
      <form id="f">
        <div class="field"><label>الاسم</label><input type="text" name="name" required></div>
        <div class="field"><label>البريد الإلكتروني</label><input type="email" name="email" required dir="ltr"></div>
        <div class="field"><label>كلمة المرور <span class="muted">(8 أحرف على الأقل)</span></label><input type="password" name="password" minlength="8" required dir="ltr"></div>
        <div class="error" id="err"></div>
        <button class="btn lg" style="width:100%;justify-content:center">إنشاء الحساب</button>
      </form>
      <p class="muted" style="margin-top:18px;text-align:center">لديك حساب؟ <a href="#/login">سجّل الدخول</a></p>`);
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('POST', '/api/auth/register', Object.fromEntries(new FormData(e.target))); me = null; location.hash = '#/profile'; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  }

  // ---------- لوحة التحكم ----------
  async function viewDashboard() {
    if (!me.company) { location.hash = '#/profile'; return; }
    const list = await api('GET', '/api/assessments');
    const done = list.filter((a) => a.status === 'completed');
    const open = list.find((a) => a.status === 'in_progress');
    const last = done[0];
    const prev = done[1];
    const c = me.company;
    const delta = last && prev ? Math.round((last.overall_score - prev.overall_score) * 10) / 10 : null;
    const flags = [['uses_cloud', 'خدمات سحابية'], ['remote_work', 'عمل عن بعد'], ['card_payments', 'دفع إلكتروني'], ['has_website', 'موقع إلكتروني']];

    $app.innerHTML = `
      <div class="hello">
        <div>
          <p class="muted" style="margin:0">مرحباً ${esc(me.name)}</p>
          <h1>${esc(c.name)}</h1>
          <div class="chips"><span class="chip">${SECTORS[c.sector]}</span><span class="chip">${fmt(c.employees)} موظف</span>
            ${flags.map(([k, l]) => `<span class="chip ${c[k] ? '' : 'off'}">${l}</span>`).join('')}</div>
        </div>
        <button class="btn lg" id="startBtn">${open ? 'متابعة التقييم الحالي' : 'ابدأ تقييماً جديداً'} ←</button>
      </div>

      <div class="grid g3">
        <div class="card stat"><div class="k">آخر درجة جاهزية</div><div class="v" style="color:${last ? scoreColor(last.overall_score) : 'inherit'}">${last ? fmt(last.overall_score) : '—'}<small> / 100</small></div>
          ${delta !== null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} عن التقييم السابق</span>` : '<span class="muted" style="font-size:.85rem">أكمل تقييمين لتتبع التقدم</span>'}</div>
        <div class="card stat"><div class="k">مستوى النضج</div><div class="v">${last ? TIERS[last.tier - 1].name : '—'}</div>
          <span class="muted" style="font-size:.85rem">${last ? `المستوى ${last.tier} من 4 · ${TIERS[last.tier - 1].en}` : 'لم يكتمل أي تقييم بعد'}</span></div>
        <div class="card stat"><div class="k">التقييمات المكتملة</div><div class="v">${fmt(done.length)}</div>
          <span class="muted" style="font-size:.85rem">${last ? 'آخرها في ' + date(last.completed_at) : 'ابدأ أول تقييم الآن'}</span></div>
      </div>

      ${done.length >= 2 ? `<div class="section-title"><h2>تطور الجاهزية عبر الزمن</h2></div><div class="card">${trendChart(done.slice().reverse())}</div>` : ''}

      <div class="section-title"><h2>سجل التقييمات</h2></div>
      <div class="card" style="padding:8px 12px">
        ${list.length ? `<table>
          <thead><tr><th>#</th><th>التاريخ</th><th>الحالة</th><th>الدرجة</th><th>المستوى</th>${FN_ORDER.map((f) => `<th>${FN[f]}</th>`).join('')}<th></th></tr></thead>
          <tbody>${list.map((a) => `<tr>
            <td class="muted">${a.id}</td><td>${date(a.completed_at || a.started_at)}</td>
            <td>${a.status === 'completed' ? 'مكتمل' : '<span style="color:var(--high)">قيد التنفيذ</span>'}</td>
            <td class="num" style="color:${a.overall_score !== null ? scoreColor(a.overall_score) : ''}">${fmt(a.overall_score)}</td>
            <td>${a.tier ? `<span class="tier-pill t${a.tier}">${TIERS[a.tier - 1].name}</span>` : '—'}</td>
            ${FN_ORDER.map((f) => `<td class="num" style="font-weight:500">${fmt(a.functions[f])}</td>`).join('')}
            <td>${a.status === 'completed' ? `<a class="btn light sm" href="#/report/${a.id}">التقرير</a>` : `<a class="btn sm" href="#/assess/${a.id}">متابعة</a>`}</td></tr>`).join('')}</tbody></table>`
          : `<div class="empty">${SHIELD}<h3 style="margin-top:12px">لا توجد تقييمات بعد</h3><p class="muted">يستغرق التقييم حوالي 10 دقائق ويتكيف مع طبيعة شركتك.</p></div>`}
      </div>`;
    document.getElementById('startBtn').onclick = async () => {
      try { const r = await api('POST', '/api/assessments'); location.hash = `#/assess/${r.id}`; } catch (e) { toast(e.message); }
    };
  }

  function trendChart(items) {
    const W = 1000; const H = 200; const P = 36;
    const x = (i) => P + 50 + (i * (W - 2 * P - 100)) / Math.max(1, items.length - 1);
    const y = (v) => H - P - (v / 100) * (H - 2 * P);
    const pts = items.map((a, i) => `${x(i)},${y(a.overall_score)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      ${[0, 40, 60, 80, 100].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e1da" stroke-dasharray="${v ? '3 4' : ''}"/><text x="${P - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#6b768a">${v}</text>`).join('')}
      <polyline points="${pts}" fill="none" stroke="#0e7c6b" stroke-width="3" stroke-linejoin="round"/>
      ${items.map((a, i) => `<circle cx="${x(i)}" cy="${y(a.overall_score)}" r="6" fill="#fff" stroke="#0e7c6b" stroke-width="3"/>
        <text x="${x(i)}" y="${y(a.overall_score) - 14}" text-anchor="middle" font-size="14" font-weight="600" fill="#0f1b2d">${fmt(a.overall_score)}</text>
        <text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#6b768a">تقييم #${a.id}</text>`).join('')}
    </svg>`;
  }

  // ---------- ملف الشركة ----------
  function viewProfile() {
    const c = me.company || { name: '', sector: 'retail', employees: 5 };
    $app.innerHTML = `
      <div style="max-width:760px;margin:0 auto">
        <h1>ملف الشركة</h1>
        <p class="muted">هذه المعلومات تخصّص الاستبيان لشركتك: نتخطى الأسئلة غير المنطبقة، ونرفع وزن المخاطر الأهم لقطاعك.</p>
        <form class="card" id="f">
          <div class="field"><label>اسم الشركة</label><input type="text" name="name" value="${esc(c.name)}" required></div>
          <div class="grid g2">
            <div class="field"><label>القطاع</label><select name="sector">${Object.entries(SECTORS).map(([k, v]) => `<option value="${k}" ${c.sector === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label>عدد الموظفين</label><input type="number" name="employees" min="1" value="${esc(c.employees)}"></div>
          </div>
          <label style="margin-top:6px">طبيعة العمل التقنية</label>
          <div class="toggles">
            ${[['uses_cloud', 'نستخدم خدمات سحابية', 'مثل Google Drive أو OneDrive أو Microsoft 365'],
              ['remote_work', 'لدينا عمل عن بعد', 'موظفون يتصلون بأنظمة الشركة من خارج المكتب'],
              ['card_payments', 'نقبل الدفع الإلكتروني', 'بطاقات ائتمان أو بوابات دفع'],
              ['has_website', 'لدينا موقع إلكتروني', 'موقع تعريفي أو متجر إلكتروني']]
              .map(([k, t, d]) => `<label class="toggle"><input type="checkbox" name="${k}" ${c[k] ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('')}
          </div>
          <div class="error" id="err" style="margin-top:12px"></div>
          <div class="row between"><span class="muted" style="font-size:.85rem">التغييرات تُطبَّق على التقييمات الجديدة فقط.</span><button class="btn">حفظ ومتابعة</button></div>
        </form>
      </div>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { name: f.name.value, sector: f.sector.value, employees: f.employees.value };
      ['uses_cloud', 'remote_work', 'card_payments', 'has_website'].forEach((k) => { body[k] = f[k].checked; });
      try { me.company = await api('PUT', '/api/company', body); toast('تم حفظ ملف الشركة'); location.hash = '#/dashboard'; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  }

  // ---------- الاستبيان الديناميكي ----------
  async function viewAssess(id, questionId) {
    let st;
    try { st = await api('GET', `/api/assessments/${id}/state${questionId ? `?question=${questionId}` : ''}`); } catch (e) { toast(e.message); location.hash = '#/dashboard'; return; }
    if (st.status === 'completed') { location.hash = `#/report/${id}`; return; }
    render(st);

    function render(s) {
      if (!s.question) {
        $app.innerHTML = `<div class="q-wrap"><div class="card q-card" style="text-align:center">
          <span style="width:64px;height:64px;display:inline-block">${SHIELD}</span>
          <h1 style="margin-top:12px">اكتمل الاستبيان</h1>
          <p class="muted">أجبت على ${fmt(s.answered)} سؤالاً، وتم تخطي ${fmt(s.skipped.length)} سؤالاً غير منطبق على شركتك.</p>
          <div class="row" style="justify-content:center;margin-top:20px">
            <button class="btn light" id="backBtn">مراجعة الإجابات</button>
            <button class="btn lg" id="finishBtn">عرض النتائج والتوصيات ←</button></div></div></div>`;
          document.getElementById('finishBtn').onclick = async () => {
            try { await api('POST', `/api/assessments/${id}/complete`); location.hash = `#/report/${id}`; } catch (e) { toast(e.message); }
          };
          document.getElementById('backBtn').onclick = () => viewAssess(id, s.history[s.history.length - 1]);
        return;
      }
      const q = s.question;
      const curFnIdx = FN_ORDER.indexOf(q.fn);
      const histIdx = s.history.indexOf(q.id);
      const prevId = histIdx === -1 ? s.history[s.history.length - 1] : s.history[histIdx - 1];
      const current = s.currentAnswer || null;
      $app.innerHTML = `
        <div class="q-wrap">
          <div class="stepper">${FN_ORDER.map((f, i) => `<div class="${i < curFnIdx ? 'done' : i === curFnIdx ? 'cur' : ''}">${FN[f]}</div>`).join('')}</div>
          <div class="progress-meta"><span>السؤال ${fmt(histIdx === -1 ? s.answered + 1 : histIdx + 1)} من ~${fmt(s.total)}</span><span>${fmt(s.progress)}٪ مكتمل</span></div>
          <form class="card q-card" id="qf" data-qid="${esc(q.id)}">
            <div class="q-head"><span class="badge fn">${esc(q.functionName)}</span><span class="badge mono">${esc(q.ref)}</span><span class="badge">الوزن ${fmt(q.weight)}</span></div>
            <div class="q-text">${esc(q.text)}</div>
            ${q.help ? `<div class="why"><b>لماذا نسأل؟</b> ${esc(q.help)}</div>` : ''}
            <div class="opts">${q.options.map((o) => `<label class="opt"><input type="radio" name="v" value="${esc(o.value)}" ${current === o.value ? 'checked' : ''}>${esc(o.label)}</label>`).join('')}</div>
            <div class="q-foot">
              <button type="button" class="btn light" id="prevBtn" ${prevId ? '' : 'disabled'}>→ السابق</button>
              <button class="btn" id="nextBtn" ${current ? '' : 'disabled'}>التالي ←</button>
            </div>
          </form>
          ${s.skipped.length ? `<p class="skipnote">✓ تم تخطي <b>${fmt(s.skipped.length)}</b> سؤالاً تلقائياً لأنها لا تنطبق على شركتك أو على إجاباتك.</p>` : ''}
        </div>`;
      const form = document.getElementById('qf');
      form.addEventListener('change', () => { document.getElementById('nextBtn').disabled = false; });
      document.getElementById('prevBtn').onclick = () => prevId && viewAssess(id, prevId);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const v = form.v.value; if (!v) return;
        try {
          const ns = await api('POST', `/api/assessments/${id}/answers`, { questionId: q.id, value: v });
          // عند تعديل إجابة سابقة: انتقل للسؤال التالي في التسلسل (إن كان ما زال منطبقاً)
          const i = ns.history.indexOf(q.id);
          if (histIdx !== -1 && i !== -1 && ns.history[i + 1]) { viewAssess(id, ns.history[i + 1]); return; }
          render(ns); window.scrollTo(0, 0);
        } catch (er) { toast(er.message); }
      };
    }
  }

  // ---------- التقرير ----------
  async function viewReport(id) {
    let r;
    try { r = await api('GET', `/api/assessments/${id}/report`); } catch (e) { toast(e.message); location.hash = '#/dashboard'; return; }
    const cmp = r.comparison;
    const fnDelta = (code) => { const d = cmp && cmp.functions.find((f) => f.code === code); return d && d.delta !== null ? d.delta : null; };
    const qw = new Set(r.quickWins);
    const bucket = (rec) => (rec.days <= 7 ? 'week' : rec.days <= 30 ? 'month' : 'quarter');

    $app.innerHTML = `
      <div class="row between no-print" style="margin-bottom:18px">
        <a href="#/dashboard" class="muted">→ العودة للوحة التحكم</a>
        <button class="btn light" onclick="window.print()">طباعة / حفظ PDF</button>
      </div>
      <p class="muted" style="margin:0">تقرير الجاهزية السيبرانية · تقييم #${r.id} · ${date(r.completedAt)}</p>
      <h1>${esc(r.profile.name)}</h1>

      <div class="card report-hero" style="margin-top:16px">
        ${gauge(r.overall)}
        <div>
          <span class="tier-pill t${r.tier.tier}">المستوى ${r.tier.tier} من 4</span>
          <h2 style="font-size:1.6rem;margin-top:8px">${r.tier.name} <span class="muted mono" style="font-size:.9rem">${r.tier.en}</span></h2>
          <p class="muted">${r.tier.desc}</p>
          ${cmp ? `<p>مقارنة بالتقييم السابق (#${cmp.previousId}): <span class="delta ${cmp.delta >= 0 ? 'up' : 'down'}" style="font-size:.95rem">${cmp.delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(cmp.delta))} نقطة</span></p>` : ''}
          <p style="margin:0">أقوى وظيفة: <b>${r.strongest.name}</b> (${fmt(r.strongest.score)}) · الأضعف: <b style="color:var(--critical)">${r.weakest.name}</b> (${fmt(r.weakest.score)})</p>
          <div class="tier-scale">${TIERS.map((t) => `<div class="${t.tier === r.tier.tier ? 'on' : ''}"><b>${t.name}</b><span dir="ltr">${t.range}</span></div>`).join('')}</div>
        </div>
      </div>

      ${r.alerts.length ? `<div class="section-title"><h2>ثغرات حرجة تتطلب تدخلاً فورياً</h2><span class="muted">${fmt(r.alerts.length)}</span></div>
        <div class="grid">${r.alerts.map((a) => `<div class="alert"><span class="ic">!</span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div></div>`).join('')}</div>` : ''}

      <div class="section-title"><h2>النتيجة حسب وظائف NIST CSF 2.0</h2></div>
      <div class="grid g2">
        <div class="card" style="display:grid;place-items:center">${radar(r.functions, cmp)}</div>
        <div class="card fn-bars">${r.functions.map((f) => {
          const d = fnDelta(f.code);
          return `<div class="fn-bar"><div class="top"><span><b>${f.name}</b> <span class="muted mono">${f.code}</span></span>
            <span class="num">${fmt(f.score)}${d !== null && d !== 0 ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</span>` : ''}</span></div>
            <div class="track"><div class="fill" style="width:${f.score ?? 0}%;background:${scoreColor(f.score ?? 0)}"></div></div></div>`;
        }).join('')}
          <p class="muted" style="font-size:.82rem;margin:4px 0 0">الدرجة موزونة: الضوابط التي تمنع الهجمات الأكثر شيوعاً (مثل MFA والنسخ الاحتياطي المختبر) لها وزن أعلى.</p>
        </div>
      </div>

      <div class="section-title"><h2>أين يمكن أن تصل؟</h2></div>
      <div class="card proj" style="padding:6px">
        <div><div class="k">الدرجة الحالية</div><div class="v" style="color:${scoreColor(r.overall)}">${fmt(r.overall)}</div></div>
        <div><div class="k">بعد المكاسب السريعة</div><div class="v" style="color:${scoreColor(r.projected.afterQuickWins)}">${fmt(r.projected.afterQuickWins)}</div></div>
        <div><div class="k">بعد خطة الأسبوع الأول</div><div class="v" style="color:${scoreColor(r.projected.afterWeek)}">${fmt(r.projected.afterWeek)}</div></div>
        <div><div class="k">بعد خطة 30 يوماً</div><div class="v" style="color:${scoreColor(r.projected.afterMonth)}">${fmt(r.projected.afterMonth)}</div></div>
      </div>

      <div class="section-title"><h2>خطة العمل والتوصيات</h2><span class="muted">${fmt(r.recommendations.length)} توصية مرتبة حسب الأولوية والأثر</span></div>
      <div class="plan-tabs">
        <button data-f="all" class="on">الكل (${fmt(r.recommendations.length)})</button>
        <button data-f="qw">مكاسب سريعة (${fmt(r.quickWins.length)})</button>
        <button data-f="week">هذا الأسبوع (${fmt(r.plan.week.length)})</button>
        <button data-f="month">خلال 30 يوماً (${fmt(r.plan.month.length)})</button>
        <button data-f="quarter">خلال 90 يوماً (${fmt(r.plan.quarter.length)})</button>
      </div>
      <div class="card" style="padding:0" id="recs">
        ${r.recommendations.length ? r.recommendations.map((x) => `
          <div class="rec ${qw.has(x.questionId) ? 'is-qw' : ''}" data-b="${bucket(x)}">
            <span class="n">${fmt(x.rank)}</span>
            <div>
              <h3>${esc(x.title)}</h3>
              <p>${esc(x.action)}</p>
              <div class="tags">
                <span class="tag p-${x.priority}">أولوية ${PRI[x.priority]}</span>
                <span class="tag">${FN[x.fn]} · <span class="mono">${esc(x.ref)}</span></span>
                <span class="tag">${EFFORT[x.effort]}</span><span class="tag">${COST[x.cost]}</span>
                <span class="tag">خلال ${fmt(x.days)} يوماً</span>
                ${qw.has(x.questionId) ? '<span class="tag qw">مكسب سريع</span>' : ''}
              </div>
              ${x.weightReasons.length ? `<div class="why-w">↑ وزن أعلى لشركتك: ${x.weightReasons.map(esc).join('، ')}</div>` : ''}
              ${x.unlocks.length ? `<div class="why-w">🔓 تنفيذ هذه الخطوة يفتح ${fmt(x.unlocks.length)} ضوابط إضافية تم تخطيها</div>` : ''}
            </div>
            <div class="gain"><b>+${fmt(x.gain)}</b><span>نقطة متوقعة</span></div>
          </div>`).join('') : '<div class="empty"><h3>ممتاز! لا توجد توصيات</h3><p class="muted">حافظ على هذا المستوى وأعد التقييم كل 6 أشهر.</p></div>'}
      </div>

      <div class="section-title"><h2>ملحق: الإجابات</h2></div>
      <details class="card answers"><summary>عرض جميع الأسئلة والإجابات (${fmt(r.answers.length)})</summary>
        <table style="margin-top:12px"><thead><tr><th>الرمز</th><th>السؤال</th><th>الإجابة</th></tr></thead><tbody>
        ${r.answers.map((a) => `<tr><td class="mono">${a.id}</td><td>${esc(a.text)}</td><td>${a.answer ? esc(a.answer) : `<span class="ans-state">${a.state === 'skipped_na' ? 'غير منطبق — تم تخطيه' : 'تم تخطيه (المتطلب الأساسي غير موجود) — يُحسب صفراً'}</span>`}</td></tr>`).join('')}
        </tbody></table></details>`;

    document.querySelectorAll('.plan-tabs button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.plan-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        const f = b.dataset.f;
        document.querySelectorAll('#recs .rec').forEach((el) => {
          el.style.display = f === 'all' || (f === 'qw' ? el.classList.contains('is-qw') : el.dataset.b === f) ? '' : 'none';
        });
      };
    });
  }

  function gauge(score) {
    const R = 92; const C = 2 * Math.PI * R;
    return `<div class="gauge"><svg viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="#efede6" stroke-width="18"/>
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="${scoreColor(score)}" stroke-width="18" stroke-linecap="round"
        stroke-dasharray="${(score / 100) * C} ${C}"/></svg>
      <div class="center"><div><div class="score" style="color:${scoreColor(score)}">${fmt(score)}</div><div class="of">من 100</div></div></div></div>`;
  }

  function radar(fns, cmp) {
    const S = 360; const cx = S / 2; const cy = S / 2 + 4; const R = 120;
    const ang = (i) => -Math.PI / 2 - (i * 2 * Math.PI) / fns.length; // عكس عقارب الساعة ليناسب RTL
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 100), cy + Math.sin(ang(i)) * R * (v / 100)];
    const poly = (vals) => vals.map((v, i) => pt(i, v ?? 0).join(',')).join(' ');
    const prev = cmp ? fns.map((f) => (cmp.functions.find((x) => x.code === f.code) || {}).previous) : null;
    return `<svg class="radar" viewBox="0 0 ${S} ${S}" style="width:100%;max-width:380px">
      ${[25, 50, 75, 100].map((v) => `<polygon points="${poly(fns.map(() => v))}" fill="none" stroke="#e3e1da"/>`).join('')}
      ${fns.map((f, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e3e1da"/>`; }).join('')}
      ${prev && prev.every((v) => v !== null && v !== undefined) ? `<polygon points="${poly(prev)}" fill="none" stroke="#6b768a" stroke-width="1.5" stroke-dasharray="4 4"/>` : ''}
      <polygon points="${poly(fns.map((f) => f.score))}" fill="rgba(14,124,107,.18)" stroke="#0e7c6b" stroke-width="2.5" stroke-linejoin="round"/>
      ${fns.map((f, i) => { const [x, y] = pt(i, f.score ?? 0); return `<circle cx="${x}" cy="${y}" r="4" fill="#0e7c6b"/>`; }).join('')}
      ${fns.map((f, i) => { const [x, y] = pt(i, 124); const anchor = Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end';
        return `<text x="${x}" y="${y + (y < cy ? -6 : 14)}" text-anchor="${anchor}" font-weight="600">${f.name}</text>`; }).join('')}
    </svg>${prev ? '<p class="muted" style="font-size:.8rem;margin:0">الخط المتقطع: التقييم السابق</p>' : ''}`;
  }

  // ---------- عن الإطار ----------
  async function viewAbout() {
    const fw = await api('GET', '/api/framework');
    $app.innerHTML = `
      <h1>عن منهجية التقييم</h1>
      <p class="muted" style="max-width:760px">يعتمد التقييم على وظائف إطار NIST Cybersecurity Framework 2.0 الست. يتكوّن بنك الأسئلة من ${fmt(fw.questionCount)} سؤالاً، يظهر منها لكل شركة ما ينطبق عليها فقط.</p>
      <div class="grid g3" style="margin-top:20px">${fw.functions.map((f) => `
        <div class="card"><div class="row between"><h3 style="margin:0">${f.name}</h3><span class="badge mono">${f.code} · ${f.name_en}</span></div>
        <p class="muted" style="margin:8px 0 0">${f.goal}</p><p style="margin:8px 0 0;font-size:.85rem">${fmt(fw.byFunction.find((x) => x.code === f.code).count)} أسئلة</p></div>`).join('')}</div>
      <div class="section-title"><h2>مستويات النضج</h2></div>
      <div class="grid g2">${fw.tiers.map((t) => `<div class="card"><span class="tier-pill t${t.tier}">المستوى ${t.tier} · من ${t.min}</span><h3 style="margin-top:8px">${t.name} <span class="muted mono">${t.en}</span></h3><p class="muted" style="margin:0">${t.desc}</p></div>`).join('')}</div>
      <div class="section-title"><h2>كيف تُحسب الدرجة؟</h2></div>
      <div class="card"><ol style="margin:0;padding-inline-start:20px">
        <li><b>منطق التخطي:</b> الأسئلة غير المنطبقة (مثل السحابة لشركة لا تستخدمها) تُستبعد من الحساب. أما الأسئلة المتخطاة لغياب متطلب أساسي (مثل السياسات عند عدم وجود مسؤول) فتُحسب صفراً.</li>
        <li><b>الأوزان:</b> لكل سؤال وزن من 1 إلى 5 حسب قدرته على منع الهجمات الشائعة، ويُعدَّل حسب ملف الشركة (القطاع، الحجم، العمل عن بعد، الدفع الإلكتروني).</li>
        <li><b>الدرجة:</b> مجموع (الوزن × درجة الإجابة) ÷ مجموع الأوزان × 100، لكل وظيفة وللشركة ككل.</li>
        <li><b>التوصيات:</b> كل إجابة ضعيفة ترتبط بتوصية من قاعدة المعرفة، وتُرتَّب حسب الأولوية ثم الأثر (الوزن × الفجوة).</li>
      </ol></div>`;
  }

  router();
})();
