/* درع — لوحة الإدارة */
(() => {
  const { $app, esc, fmt, date, toast, api, route, modal, formData, copy, gauge, radar, trend, bar, tierPill, statusPill, recList, bindRecTabs, scoreColor, heatBg, C, SHIELD } = App;
  let me = null;
  let fwCache = null;
  const framework = async (force) => (fwCache && !force ? fwCache : (fwCache = await api('GET', '/api/admin/framework')));
  const confirmDel = (msg) => window.confirm(msg);

  async function layout(navKey) {
    if (!me) me = await api('GET', '/api/admin/me');
    document.getElementById('shell').classList.remove('bare');
    document.getElementById('side').hidden = false;
    document.getElementById('adminName').textContent = me.name;
    document.querySelectorAll('.side nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav.split(' ').includes(navKey)));
  }
  document.getElementById('logoutBtn').onclick = async () => { await api('POST', '/api/admin/logout'); me = null; location.hash = '#/login'; };
  const inviteText = (d, company) => {
    const link = `${location.origin}/#/d/${d.link_token}`;
    return `مرحباً ${d.head_name}،\nيرجى المشاركة في تقييم الجاهزية السيبرانية لقسم "${d.name}" في ${company}.\nالرابط: ${link}\nالمعرّف الخاص بك (ID): ${d.access_code}\nمع الشكر.`;
  };

  // ======================= تسجيل الدخول =======================
  route('/login', async () => {
    document.getElementById('shell').classList.add('bare');
    document.getElementById('side').hidden = true;
    $app.innerHTML = `
      <div class="auth">
        <section class="auth-hero">
          <div>
            <div class="row" style="gap:10px"><span style="width:40px;height:40px;display:block">${SHIELD}</span><b style="font-size:1.3rem;color:#fff">درع</b></div>
            <h1>منصة ذكية لتقييم الجاهزية السيبرانية للشركات الصغيرة والمتوسطة</h1>
            <p class="lead">مبنية على إطار NIST CSF 2.0. أضف الشركات وأقسامها، وأرسل لكل مسؤول قسم رابطاً ومعرّفاً خاصاً، وتابع النتائج والتوصيات من لوحة واحدة.</p>
            <ul>
              <li><span class="dot">1</span><div><b>كل شيء قابل للإعداد</b><span>المحاور، المعايير، الأسئلة، الأوزان، التوصيات، وأنواع الأقسام.</span></div></li>
              <li><span class="dot">2</span><div><b>كل قسم يجيب على أسئلته</b><span>تقنية المعلومات عن MFA والنسخ، المالية عن التحويلات، الموارد البشرية عن المغادرين.</span></div></li>
              <li><span class="dot">3</span><div><b>إحصائيات شاملة</b><span>درجة كل قسم وكل محور، مقارنة الجولات، وخطة عمل مرتبة.</span></div></li>
            </ul>
          </div>
          <div class="fn-strip"><span>الحوكمة · GV</span><span>التحديد · ID</span><span>الحماية · PR</span><span>الكشف · DE</span><span>الاستجابة · RS</span><span>التعافي · RC</span></div>
        </section>
        <section class="auth-form"><div class="card">
          <h2>دخول الإدارة</h2>
          <p class="muted">لمسؤولي الأقسام: استخدم الرابط الذي وصلك.</p>
          <form id="f">
            <div class="field"><label>اسم المستخدم</label><input type="text" name="username" required dir="ltr" autocomplete="username"></div>
            <div class="field"><label>كلمة المرور</label><input type="password" name="password" required dir="ltr" autocomplete="current-password"></div>
            <div class="error" id="err"></div>
            <button class="btn lg" style="width:100%;justify-content:center">دخول</button>
          </form></div></section>
      </div>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { me = await api('POST', '/api/admin/login', formData(e.target)); location.hash = '#/'; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  }, { public: true });

  // ======================= نظرة عامة =======================
  route('/', async () => {
    await layout('');
    const o = await api('GET', '/api/admin/overview');
    const k = o.counts;
    $app.innerHTML = `
      <div class="page-head"><div><p class="crumbs">مرحباً ${esc(me.name)}</p><h1>نظرة عامة</h1></div>
        <a class="btn" href="#/companies/new">+ إضافة شركة</a></div>
      <div class="grid g4">
        <div class="card kpi"><div class="k">الشركات</div><div class="v">${k.companies}</div><div class="s">${o.bySize.map((s) => `${s.count} ${s.name}`).join(' · ')}</div></div>
        <div class="card kpi"><div class="k">الأقسام / المسؤولون</div><div class="v">${k.departments}</div><div class="s">${k.heads} مسؤول قسم مسجّل</div></div>
        <div class="card kpi"><div class="k">متوسط الجاهزية</div><div class="v" style="color:${scoreColor(o.avgScore)}">${fmt(o.avgScore)}</div><div class="s">آخر جولة مغلقة لكل شركة</div></div>
        <div class="card kpi"><div class="k">الجولات المفتوحة</div><div class="v">${k.openRounds}</div><div class="s">${k.pending} قسم لم يسلّم بعد</div></div>
      </div>
      <div class="grid g4" style="margin-top:14px">
        <div class="card kpi"><div class="k">المعايير الفعالة</div><div class="v">${k.questions}</div><div class="s">في ${k.functions} محاور</div></div>
        <div class="card kpi"><div class="k">أنواع الأقسام</div><div class="v">${k.types}</div><div class="s">قابلة للإضافة</div></div>
        <div class="card kpi"><div class="k">التوصيات في قاعدة المعرفة</div><div class="v">${k.recommendations}</div><div class="s">مرتبطة بالإجابات الضعيفة</div></div>
        <div class="card kpi"><div class="k">إجابات أقسام مُسلّمة</div><div class="v">${k.submissions}</div><div class="s">في ${k.rounds} جولة تقييم</div></div>
      </div>

      <div class="grid g2" style="margin-top:20px">
        <div class="card"><h3>متوسط المحاور (كل الشركات)</h3><div class="bars-h" style="margin-top:12px">${o.functions.map((f) => bar(esc(f.name), f.avg)).join('')}</div></div>
        <div class="card"><h3>توزيع مستويات النضج</h3>
          <div class="bars-h" style="margin-top:12px">${o.byTier.map((t) => `<div class="row-b"><span>${tierPill(t.tier)}</span><div class="track"><div class="fill" style="width:${k.companies ? (t.count / k.companies) * 100 : 0}%;background:var(--ink-2)"></div></div><b class="num">${t.count}</b></div>`).join('')}</div>
          <h3 style="margin-top:22px">حسب حجم الشركة</h3>
          <div class="chips" style="margin-top:8px">${o.bySize.map((s) => `<span class="chip">${s.name}: <b>${s.count}</b> <span dir="ltr">(${s.range})</span></span>`).join('')}</div></div>
      </div>

      <div class="section-title"><h2>الشركات</h2><a href="#/companies">عرض الكل ←</a></div>
      <div class="card" style="padding:6px 12px;overflow-x:auto"><table>
        <thead><tr><th>الشركة</th><th>الحجم</th><th>الأقسام</th><th>آخر درجة</th><th>المستوى</th><th>الجولة الحالية</th></tr></thead>
        <tbody>${o.companies.map((c) => `<tr>
          <td><a href="#/company/${c.id}"><b>${esc(c.name)}</b></a><div class="muted" style="font-size:.8rem">${C.SECTORS[c.sector]} · ${esc(c.city)}</div></td>
          <td><span class="chip">${C.SIZES[c.size]}</span> <span class="muted" style="font-size:.8rem">${c.employees}</span></td>
          <td class="num">${c.departments}</td>
          <td class="num" style="color:${scoreColor(c.lastScore)}">${c.lastRoundId ? `<a style="color:inherit" href="#/round/${c.lastRoundId}">${fmt(c.lastScore)}</a>` : '—'}</td>
          <td>${tierPill(c.lastTier)}</td>
          <td>${c.openRound ? `<a href="#/round/${c.openRound.id}">${esc(c.openRound.title)}</a><div class="row" style="gap:8px"><div class="mini-bar" style="flex:1"><div style="width:${(c.openRound.submitted / c.openRound.total) * 100}%"></div></div><span class="muted" style="font-size:.8rem">${c.openRound.submitted}/${c.openRound.total}</span></div>` : '<span class="muted">لا توجد</span>'}</td></tr>`).join('')}</tbody></table></div>

      <div class="grid g2" style="margin-top:20px">
        <div class="card"><h3>آخر النشاطات</h3>${o.activity.length ? `<table>${o.activity.map((a) => `<tr><td>${statusPill(a.status)}</td><td><b>${esc(a.dept)}</b><div class="muted" style="font-size:.8rem">${esc(a.company)} · ${esc(a.respondent_name || '')}</div></td><td class="muted" style="font-size:.8rem">${date(a.submitted_at || a.started_at)}</td></tr>`).join('')}</table>` : '<p class="muted">لا يوجد نشاط</p>'}</div>
        <div class="card"><h3>أقسام بانتظار التسليم</h3>${o.pendingList.length ? `<table>${o.pendingList.map((p) => `<tr><td>${statusPill(p.status)}</td><td><b>${esc(p.dept)}</b><div class="muted" style="font-size:.8rem">${esc(p.company)} · ${esc(p.head_name)}</div></td><td><a class="btn light sm" href="#/company/${p.company_id}?tab=depts">الرابط</a></td></tr>`).join('')}</table>` : '<p class="muted">لا توجد أقسام متأخرة 👍</p>'}</div>
      </div>`;
  });

  // ======================= الشركات =======================
  route('/companies', async () => {
    await layout('companies');
    const list = await api('GET', '/api/admin/companies');
    $app.innerHTML = `
      <div class="page-head"><div><h1>الشركات والأقسام</h1><p class="muted" style="margin:0">${list.length} شركة. اضغط على شركة لإدارة أقسامها ومسؤوليها وجولات تقييمها.</p></div>
        <a class="btn" href="#/companies/new">+ إضافة شركة</a></div>
      <div class="grid g3">${list.map((c) => `
        <a class="card" href="#/company/${c.id}" style="color:inherit;display:block">
          <div class="row between"><span class="chip">${C.SIZES[c.size]}</span>${tierPill(c.lastTier)}</div>
          <h3 style="margin:10px 0 2px">${esc(c.name)}</h3>
          <p class="muted" style="font-size:.85rem;margin:0">${C.SECTORS[c.sector]} · ${esc(c.city)} · ${c.employees} موظف</p>
          <div class="row between" style="margin-top:16px">
            <div><div class="muted" style="font-size:.78rem">الأقسام</div><b>${c.departments}</b></div>
            <div><div class="muted" style="font-size:.78rem">الجولات</div><b>${c.history.length}${c.openRound ? ' + 1 مفتوحة' : ''}</b></div>
            <div><div class="muted" style="font-size:.78rem">آخر درجة</div><b style="color:${scoreColor(c.lastScore)};font-size:1.3rem">${fmt(c.lastScore)}</b></div>
          </div></a>`).join('') || '<div class="card empty"><h3>لا توجد شركات</h3></div>'}</div>`;
  });

  function companyForm(c = {}) {
    return `
      <div class="form-grid">
        <div class="field full"><label>اسم الشركة *</label><input type="text" name="name" required value="${esc(c.name || '')}"></div>
        <div class="field"><label>القطاع</label><select name="sector">${Object.entries(C.SECTORS).map(([k, v]) => `<option value="${k}" ${c.sector === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>عدد الموظفين * <span class="muted" id="sizeHint"></span></label><input type="number" name="employees" min="1" max="249" required value="${esc(c.employees || 10)}"></div>
        <div class="field"><label>المدينة</label><input type="text" name="city" value="${esc(c.city || '')}"></div>
        <div class="field"><label>الهاتف</label><input type="text" name="phone" value="${esc(c.phone || '')}" dir="ltr"></div>
        <div class="field full"><label>العنوان</label><input type="text" name="address" value="${esc(c.address || '')}"></div>
        <div class="field"><label>البريد الإلكتروني</label><input type="email" name="email" value="${esc(c.email || '')}" dir="ltr"></div>
        <div class="field"><label>الموقع الإلكتروني</label><input type="text" name="website" value="${esc(c.website || '')}" dir="ltr"></div>
        <div class="field full"><label>نبذة عن الشركة ونشاطها</label><textarea name="description">${esc(c.description || '')}</textarea></div>
      </div>
      <label>طبيعة العمل التقنية <span class="muted">(تحدد الأسئلة التي ستظهر وأوزانها)</span></label>
      <div class="toggles">${C.FLAGS.map(([k, t, d]) => `<label class="toggle"><input type="checkbox" name="${k}" ${c[k] ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('')}</div>`;
  }
  function sizeHintBind(root) {
    const inp = root.querySelector('[name=employees]'); const hint = root.querySelector('#sizeHint');
    const upd = () => { const n = +inp.value || 1; hint.textContent = `← ${n < 10 ? C.SIZES.micro : n < 50 ? C.SIZES.small : C.SIZES.medium}`; };
    inp.oninput = upd; upd();
  }

  route('/companies/new', async () => {
    await layout('companies');
    $app.innerHTML = `<p class="crumbs"><a href="#/companies">الشركات</a> ›</p><h1>إضافة شركة</h1>
      <form class="card" id="f" style="max-width:860px">${companyForm()}<div class="error" id="err" style="margin-top:12px"></div>
      <div class="row"><button class="btn">حفظ الشركة والانتقال لإضافة الأقسام</button><a class="btn light" href="#/companies">إلغاء</a></div></form>`;
    sizeHintBind($app);
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('POST', '/api/admin/companies', formData(e.target)); toast('تمت إضافة الشركة'); location.hash = `#/company/${r.id}?tab=depts`; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  });

  route('/company/:id', async (id, q) => {
    await layout('companies');
    const tab = q.tab || 'info';
    const c = await api('GET', `/api/admin/companies/${id}`);
    const fw = await framework();
    const head = `
      <p class="crumbs"><a href="#/companies">الشركات</a> ›</p>
      <div class="page-head"><div><h1>${esc(c.name)}</h1>
        <div class="chips" style="margin-top:6px"><span class="chip">${C.SIZES[c.size]} · ${c.employees} موظف</span><span class="chip">${C.SECTORS[c.sector]}</span>${c.city ? `<span class="chip">${esc(c.city)}</span>` : ''}
        ${C.FLAGS.map(([k, l]) => `<span class="chip ${c[k] ? '' : 'off'}">${l}</span>`).join('')}</div></div>
        <div class="row"><a class="btn light" href="#/company/${c.id}/edit">تعديل البيانات</a><button class="btn light" id="delCo" style="color:var(--critical)">حذف</button></div></div>
      <div class="tabs">${[['info', 'المعلومات والنتائج'], ['depts', `الأقسام والمسؤولون (${c.departmentsList.length})`], ['rounds', `جولات التقييم (${c.rounds.length})`]]
        .map(([k, l]) => `<a href="#/company/${c.id}?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;

    let body = '';
    if (tab === 'info') {
      body = `<div class="grid g2">
        <div class="card"><h3>بيانات الشركة</h3><table>
          ${[['الاسم', c.name], ['القطاع', C.SECTORS[c.sector]], ['الحجم', `${C.SIZES[c.size]} (${c.employees} موظف)`], ['المدينة', c.city], ['العنوان', c.address], ['الهاتف', c.phone], ['البريد', c.email], ['الموقع', c.website]]
          .map(([k, v]) => `<tr><td class="muted" style="width:110px">${k}</td><td>${esc(v || '—')}</td></tr>`).join('')}</table>
          ${c.description ? `<p style="margin-top:12px">${esc(c.description)}</p>` : ''}</div>
        <div class="card"><h3>آخر نتيجة</h3>${c.lastRoundId ? `<div class="row" style="gap:20px">${gauge(c.lastScore, 160)}<div>${tierPill(c.lastTier)}<p class="muted" style="margin-top:8px">${esc(c.history[c.history.length - 1].title)}<br>${date(c.history[c.history.length - 1].closed_at)}</p><a class="btn sm" href="#/round/${c.lastRoundId}">التقرير الكامل</a></div></div>
          <div style="display:grid;place-items:center">${radar(fw.functions.map((f) => ({ code: f.code, name: f.name, score: c.lastFunctions[f.code] ?? null })))}</div>` : '<p class="muted">لا توجد جولة مغلقة بعد.</p>'}</div></div>
        ${c.history.length >= 2 ? `<div class="section-title"><h2>تطور الجاهزية</h2></div><div class="card">${trend(c.history.map((h) => ({ score: h.overall_score, label: h.title.length > 22 ? h.title.slice(0, 22) + '…' : h.title })))}</div>` : ''}`;
    } else if (tab === 'depts') {
      body = `<div class="row between" style="margin-bottom:14px"><p class="muted" style="margin:0">لكل قسم مسؤول واحد يدخل عبر <b>رابط خاص</b> + <b>معرّف (ID)</b>، ويجيب على المعايير الموجهة لنوع قسمه.</p><button class="btn" id="addDept">+ إضافة قسم</button></div>
        <div class="grid g2">${c.departmentsList.map((d) => `
          <div class="card">
            <div class="row between"><div><h3 style="margin:0">${esc(d.name)}</h3><span class="muted" style="font-size:.85rem">${esc(d.type_name || 'بدون نوع — أسئلة عامة فقط')} · ${d.employees} موظف · ${d.questions} سؤال</span></div>
              <div class="row" style="gap:4px"><button class="btn light sm" data-edit="${d.id}">تعديل</button><button class="btn light sm" data-del="${d.id}" style="color:var(--critical)">حذف</button></div></div>
            ${d.description ? `<p class="muted" style="font-size:.88rem;margin:6px 0 0">${esc(d.description)}</p>` : ''}
            <div class="dept-who"><span class="avatar">${esc(d.head_name.replace(/^(م\.|د\.)\s*/, '').charAt(0))}</span><div><b>${esc(d.head_name)}</b><div class="muted" style="font-size:.85rem">${esc(d.head_title)}</div>
              <div class="muted" style="font-size:.8rem" dir="ltr">${esc(d.head_email)} ${d.head_phone ? '· ' + esc(d.head_phone) : ''}</div></div></div>
            <div class="row" style="gap:8px;margin-bottom:8px"><span class="muted" style="font-size:.85rem">المعرّف (ID):</span><span class="code-pill">${esc(d.access_code)}</span></div>
            <div class="copybox"><code>${location.origin}/#/d/${esc(d.link_token)}</code><button class="btn light sm" data-copylink="${d.id}">نسخ الرابط</button></div>
            <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
              <button class="btn sm" data-invite="${d.id}">نسخ رسالة الدعوة</button>
              <a class="btn light sm" target="_blank" href="https://wa.me/?text=${encodeURIComponent(inviteText(d, c.name))}">واتساب</a>
              ${d.head_email ? `<a class="btn light sm" href="mailto:${esc(d.head_email)}?subject=${encodeURIComponent('تقييم الجاهزية السيبرانية — ' + d.name)}&body=${encodeURIComponent(inviteText(d, c.name))}">بريد</a>` : ''}
              <button class="btn light sm" data-regen="${d.id}">توليد معرّف/رابط جديد</button>
            </div></div>`).join('') || '<div class="card empty"><h3>لا توجد أقسام بعد</h3><p class="muted">أضف أقسام الشركة ومسؤوليها.</p></div>'}</div>`;
    } else {
      body = `<div class="row between" style="margin-bottom:14px"><p class="muted" style="margin:0">الجولة تُرسل لكل الأقسام؛ وعند إغلاقها تُحفظ الدرجات للمقارنة لاحقاً.</p>
          <button class="btn" id="newRound" ${c.openRound ? 'disabled title="أغلق الجولة المفتوحة أولاً"' : ''}>+ بدء جولة تقييم جديدة</button></div>
        <div class="card" style="padding:6px 12px">${c.rounds.length ? `<table><thead><tr><th>الجولة</th><th>التاريخ</th><th>الحالة</th><th>المشاركة</th><th>الدرجة</th><th>المستوى</th><th></th></tr></thead><tbody>
          ${c.rounds.map((r) => `<tr><td><b>${esc(r.title)}</b></td><td>${date(r.created_at)}</td><td>${statusPill(r.status)}</td>
            <td><div class="row" style="gap:8px"><div class="mini-bar" style="flex:1"><div style="width:${r.total ? (r.submitted / r.total) * 100 : 0}%"></div></div><span class="muted" style="font-size:.8rem">${r.submitted}/${r.total}</span></div></td>
            <td class="num" style="color:${scoreColor(r.overall_score)}">${fmt(r.overall_score)}</td><td>${tierPill(r.tier)}</td>
            <td><div class="row" style="gap:4px"><a class="btn light sm" href="#/round/${r.id}">${r.status === 'open' ? 'المتابعة' : 'التقرير'}</a><button class="btn light sm" data-delround="${r.id}" style="color:var(--critical)">حذف</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><h3>لا توجد جولات</h3></div>'}</div>`;
    }
    $app.innerHTML = head + body;

    document.getElementById('delCo').onclick = async () => {
      if (!confirmDel(`حذف "${c.name}" مع كل أقسامها وتقييماتها؟ لا يمكن التراجع.`)) return;
      await api('DELETE', `/api/admin/companies/${c.id}`); toast('تم الحذف'); location.hash = '#/companies';
    };
    const dept = (did) => c.departmentsList.find((d) => d.id === +did);
    $app.querySelectorAll('[data-copylink]').forEach((b) => { b.onclick = () => copy(`${location.origin}/#/d/${dept(b.dataset.copylink).link_token}`); });
    $app.querySelectorAll('[data-invite]').forEach((b) => { b.onclick = () => copy(inviteText(dept(b.dataset.invite), c.name)); });
    $app.querySelectorAll('[data-regen]').forEach((b) => {
      b.onclick = async () => {
        if (!confirmDel('سيُلغى المعرّف والرابط الحاليان وتحتاج إرسال الجديد للمسؤول. متابعة؟')) return;
        await api('POST', `/api/admin/departments/${b.dataset.regen}/regenerate`, { what: 'both' }); toast('تم توليد معرّف ورابط جديدين'); location.reload();
      };
    });
    $app.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => { if (!confirmDel(`حذف قسم "${dept(b.dataset.del).name}" وكل إجاباته؟`)) return; await api('DELETE', `/api/admin/departments/${b.dataset.del}`); toast('تم حذف القسم'); location.reload(); };
    });
    const deptModal = (d = null) => modal(`<h2>${d ? 'تعديل القسم' : 'إضافة قسم'}</h2>
      <div class="form-grid">
        <div class="field"><label>اسم القسم *</label><input type="text" name="name" required value="${esc(d ? d.name : '')}"></div>
        <div class="field"><label>نوع القسم <span class="muted">(يحدد المعايير)</span></label><select name="type_id"><option value="">بدون نوع — الأسئلة العامة فقط</option>${fw.types.map((t) => `<option value="${t.id}" ${d && d.type_id === t.id ? 'selected' : ''}>${esc(t.name)} (${t.questions} سؤال)</option>`).join('')}</select></div>
        <div class="field"><label>عدد موظفي القسم</label><input type="number" name="employees" min="0" value="${d ? d.employees : 1}"></div>
        <div class="field"><label>وصف القسم</label><input type="text" name="description" value="${esc(d ? d.description : '')}"></div>
      </div>
      <h3 style="margin-top:8px">المسؤول عن القسم</h3>
      <div class="form-grid">
        <div class="field"><label>الاسم الكامل *</label><input type="text" name="head_name" required value="${esc(d ? d.head_name : '')}"></div>
        <div class="field"><label>الدور الوظيفي</label><input type="text" name="head_title" value="${esc(d ? d.head_title : '')}" placeholder="مثال: مدير تقنية المعلومات"></div>
        <div class="field"><label>البريد الإلكتروني</label><input type="email" name="head_email" dir="ltr" value="${esc(d ? d.head_email : '')}"></div>
        <div class="field"><label>الهاتف</label><input type="text" name="head_phone" dir="ltr" value="${esc(d ? d.head_phone : '')}"></div>
        <div class="field full"><label>المعرّف (ID) <span class="muted">— اتركه فارغاً للتوليد التلقائي</span></label><input type="text" name="access_code" dir="ltr" value="${esc(d ? d.access_code : '')}" placeholder="ABC-1234"></div>
      </div>`, async (f) => {
      const b = formData(f);
      if (d) await api('PUT', `/api/admin/departments/${d.id}`, b); else await api('POST', `/api/admin/companies/${c.id}/departments`, b);
      toast(d ? 'تم حفظ القسم' : 'تمت إضافة القسم'); location.reload();
    });
    const add = document.getElementById('addDept'); if (add) add.onclick = () => deptModal();
    $app.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => deptModal(dept(b.dataset.edit)); });
    const nr = document.getElementById('newRound');
    if (nr) {
      nr.onclick = () => modal(`<h2>بدء جولة تقييم</h2><p class="muted">ستُفتح الجولة لجميع أقسام الشركة (${c.departmentsList.length}). أرسل الروابط والمعرّفات لمسؤولي الأقسام.</p>
        <div class="field"><label>عنوان الجولة</label><input type="text" name="title" required value="تقييم ${new Date().toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' })}"></div>`,
      async (f) => { const r = await api('POST', `/api/admin/companies/${c.id}/rounds`, formData(f)); toast('تم فتح الجولة'); location.hash = `#/round/${r.id}`; });
    }
    $app.querySelectorAll('[data-delround]').forEach((b) => {
      b.onclick = async () => { if (!confirmDel('حذف الجولة وكل إجاباتها؟')) return; await api('DELETE', `/api/admin/rounds/${b.dataset.delround}`); toast('تم الحذف'); location.reload(); };
    });
  });

  route('/company/:id/edit', async (id) => {
    await layout('companies');
    const c = await api('GET', `/api/admin/companies/${id}`);
    $app.innerHTML = `<p class="crumbs"><a href="#/companies">الشركات</a> › <a href="#/company/${c.id}">${esc(c.name)}</a> ›</p><h1>تعديل بيانات الشركة</h1>
      <form class="card" id="f" style="max-width:860px">${companyForm(c)}<p class="muted" style="font-size:.85rem;margin-top:10px">التعديلات تُطبَّق على الجولات الجديدة؛ الجولات السابقة تحتفظ بنسخة من ملف الشركة وقت إنشائها.</p>
      <div class="error" id="err"></div><div class="row"><button class="btn">حفظ</button><a class="btn light" href="#/company/${c.id}">إلغاء</a></div></form>`;
    sizeHintBind($app);
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('PUT', `/api/admin/companies/${c.id}`, formData(e.target)); toast('تم الحفظ'); location.hash = `#/company/${c.id}`; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  });

  // ======================= تقرير الجولة =======================
  route('/round/:id', async (id) => {
    await layout('companies');
    const r = await api('GET', `/api/admin/rounds/${id}/report`);
    const p = r.participation;
    const hasData = p.submitted > 0;
    const fnCodes = r.functions.filter((f) => f.score !== null).map((f) => f.code);
    const prevFns = r.comparison ? Object.fromEntries(r.comparison.functions.map((f) => [f.code, f.previous])) : null;
    $app.innerHTML = `
      <p class="crumbs"><a href="#/companies">الشركات</a> › <a href="#/company/${r.company.id}?tab=rounds">${esc(r.company.name)}</a> ›</p>
      <div class="page-head"><div><h1>${esc(r.round.title)}</h1><div class="row" style="gap:8px;margin-top:6px">${statusPill(r.round.status)}<span class="muted">بدأت ${date(r.round.createdAt)}${r.round.closedAt ? ' · أُغلقت ' + date(r.round.closedAt) : ''}</span><span class="chip">${C.SIZES[r.profile.size]}</span></div></div>
        <div class="row no-print">${r.round.status === 'open' ? `<button class="btn" id="closeR" ${hasData ? '' : 'disabled'}>إغلاق الجولة واعتماد النتائج</button>` : '<button class="btn light" id="reopenR">إعادة فتح الجولة</button>'}
          <button class="btn light" onclick="window.print()">طباعة / PDF</button></div></div>

      <div class="section-title" style="margin-top:8px"><h2>مشاركة الأقسام</h2><span class="muted">${p.submitted} من ${p.total} سلّمت · ${p.inProgress} قيد الإجابة · ${p.pending} لم تبدأ</span></div>
      <div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>القسم</th><th>المسؤول</th><th>الحالة</th><th>التقدم</th><th>تاريخ التسليم</th><th>الدرجة</th><th class="no-print"></th></tr></thead><tbody>
        ${p.departments.map((d) => { const ds = r.departments.find((x) => x.id === d.id); return `<tr>
          <td><b>${esc(d.name)}</b><div class="muted" style="font-size:.78rem">${esc(d.typeName || 'عام')}</div></td>
          <td>${esc(d.head)}<div class="muted" style="font-size:.78rem">${esc(d.title)}</div></td><td>${statusPill(d.status)}</td>
          <td><div class="row" style="gap:8px"><div class="mini-bar" style="flex:1"><div style="width:${d.total ? Math.min(100, (d.answered / d.total) * 100) : 0}%"></div></div><span class="muted" style="font-size:.8rem">${d.answered}/${d.total}</span></div></td>
          <td class="muted" style="font-size:.85rem">${date(d.submittedAt)}</td>
          <td class="num" style="color:${scoreColor(ds ? ds.overall : null)}">${ds ? fmt(ds.overall) : '—'}</td>
          <td class="no-print"><div class="row" style="gap:4px">${d.status !== 'pending' ? `<a class="btn light sm" href="#/round/${r.round.id}/dept/${d.id}">الإجابات</a>` : ''}${d.status === 'submitted' && r.round.status === 'open' ? `<button class="btn light sm" data-reopen="${d.rdId}">السماح بالتعديل</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>

      ${!hasData ? '<div class="card empty" style="margin-top:20px"><h3>بانتظار تسليم أول قسم</h3><p class="muted">ستظهر النتائج هنا تلقائياً فور تسليم أي قسم لإجاباته.</p></div>' : `
      ${r.round.status === 'open' ? '<div class="warn" style="margin-top:16px">نتائج أولية مبنية على الأقسام التي سلّمت فقط. تُعتمد عند إغلاق الجولة.</div>' : ''}
      <div class="card report-hero" style="margin-top:20px">
        ${gauge(r.overall)}
        <div><span class="tier-pill t${r.tier.tier}">المستوى ${r.tier.tier} من 4</span>
          <h2 style="font-size:1.6rem;margin-top:8px">${r.tier.name} <span class="muted mono" style="font-size:.9rem">${r.tier.en}</span></h2>
          <p class="muted">${r.tier.desc}</p>
          ${r.comparison ? `<p>مقارنة بـ "${esc(r.comparison.previousTitle)}": <span class="delta ${r.comparison.delta >= 0 ? 'up' : 'down'}" style="font-size:.95rem">${r.comparison.delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(r.comparison.delta))} نقطة</span></p>` : ''}
          ${r.strongest ? `<p style="margin:0">أقوى محور: <b>${esc(r.strongest.name)}</b> (${fmt(r.strongest.score)}) · الأضعف: <b style="color:var(--critical)">${esc(r.weakest.name)}</b> (${fmt(r.weakest.score)})</p>` : ''}
          <div class="tier-scale">${C.TIERS.map((t) => `<div class="${t.tier === r.tier.tier ? 'on' : ''}"><b>${t.name}</b><span dir="ltr">${t.range}</span></div>`).join('')}</div></div></div>

      ${r.alerts.length ? `<div class="section-title"><h2>ثغرات حرجة</h2></div><div class="grid">${r.alerts.map((a) => `<div class="alert"><span class="ic">!</span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div></div>`).join('')}</div>` : ''}

      <div class="section-title"><h2>النتيجة حسب المحاور</h2></div>
      <div class="grid g2"><div class="card" style="display:grid;place-items:center">${radar(r.functions, prevFns)}${prevFns ? '<p class="muted" style="font-size:.8rem;margin:0">الخط المتقطع: الجولة السابقة</p>' : ''}</div>
        <div class="card"><div class="bars-h">${r.functions.filter((f) => f.score !== null).map((f) => { const d = r.comparison && r.comparison.functions.find((x) => x.code === f.code); return bar(`<b>${esc(f.name)}</b>${d && d.delta ? ` <span class="delta ${d.delta > 0 ? 'up' : 'down'}">${d.delta > 0 ? '▲' : '▼'}${fmt(Math.abs(d.delta))}</span>` : ''}`, f.score); }).join('')}</div></div></div>

      <div class="section-title"><h2>مصفوفة الأقسام × المحاور</h2><span class="muted">أين تكمن الفجوة بالضبط؟</span></div>
      <div class="card" style="overflow-x:auto"><table class="heat"><thead><tr><th>القسم</th>${fnCodes.map((c) => `<th>${esc(r.functions.find((f) => f.code === c).name)}</th>`).join('')}<th>الإجمالي</th></tr></thead><tbody>
        ${r.departments.map((d) => `<tr><td class="name">${esc(d.name)}</td>${fnCodes.map((c) => (d.functions[c] === null || d.functions[c] === undefined ? '<td class="na">—</td>' : `<td style="background:${heatBg(d.functions[c])}">${fmt(d.functions[c])}</td>`)).join('')}<td style="background:${heatBg(d.overall)}">${fmt(d.overall)}</td></tr>`).join('')}
        <tr><td class="name"><b>الشركة</b></td>${fnCodes.map((c) => { const v = r.functions.find((f) => f.code === c).score; return `<td style="background:${heatBg(v)};outline:2px solid var(--ink)">${fmt(v)}</td>`; }).join('')}<td style="background:${heatBg(r.overall)};outline:2px solid var(--ink)">${fmt(r.overall)}</td></tr>
      </tbody></table><p class="muted" style="font-size:.8rem;margin:8px 0 0">"—" = لا توجد معايير من هذا المحور موجهة لهذا القسم.</p></div>

      <div class="grid g2" style="margin-top:20px">
        <div class="card"><h3>ترتيب الأقسام</h3><div class="bars-h" style="margin-top:12px">${r.departments.slice().sort((a, b) => b.overall - a.overall).map((d) => bar(esc(d.name), d.overall)).join('')}</div></div>
        <div class="card proj" style="padding:6px;flex-direction:column">
          <h3 style="padding:12px 16px 0">أين يمكن أن تصل الشركة؟</h3>
          <div class="proj"><div><div class="k">الآن</div><div class="v" style="color:${scoreColor(r.overall)}">${fmt(r.overall)}</div></div>
          <div><div class="k">بعد المكاسب السريعة</div><div class="v" style="color:${scoreColor(r.projected.afterQuickWins)}">${fmt(r.projected.afterQuickWins)}</div></div>
          <div><div class="k">بعد 30 يوماً</div><div class="v" style="color:${scoreColor(r.projected.afterMonth)}">${fmt(r.projected.afterMonth)}</div></div></div></div></div>

      <div class="section-title"><h2>خطة العمل والتوصيات</h2><span class="muted">${r.recommendations.length} توصية</span></div>
      ${recList(r.recommendations, r.quickWins)}

      <div class="section-title"><h2>أضعف المعايير</h2><span class="muted">مع إجابة كل قسم</span></div>
      <div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>المعيار</th><th>السؤال</th><th>الدرجة</th><th>إجابات الأقسام</th></tr></thead><tbody>
        ${r.questionStats.filter((q) => q.avg < 100).slice(0, 12).map((q) => `<tr><td class="mono">${q.id}</td><td style="max-width:420px">${esc(q.text)}</td><td class="num" style="color:${scoreColor(q.avg)}">${fmt(q.avg)}</td>
          <td style="font-size:.85rem">${q.answers.map((a) => `<div><b>${esc(a.dept)}:</b> ${esc(a.label)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div>`}`;
    bindRecTabs($app);
    const cl = document.getElementById('closeR');
    if (cl) cl.onclick = async () => { if (p.submitted < p.total && !confirmDel(`${p.total - p.submitted} قسم لم يسلّم بعد. إغلاق الجولة بالنتائج الحالية؟`)) return; await api('POST', `/api/admin/rounds/${id}/close`); toast('تم إغلاق الجولة واعتماد النتائج'); location.reload(); };
    const ro = document.getElementById('reopenR');
    if (ro) ro.onclick = async () => { try { await api('POST', `/api/admin/rounds/${id}/reopen`); toast('أُعيد فتح الجولة'); location.reload(); } catch (e) { toast(e.message); } };
    $app.querySelectorAll('[data-reopen]').forEach((b) => { b.onclick = async () => { await api('POST', `/api/admin/round-departments/${b.dataset.reopen}/reopen`); toast('يمكن للمسؤول تعديل إجاباته الآن'); location.reload(); }; });
  });

  route('/round/:id/dept/:dept', async (id, deptId) => {
    await layout('companies');
    const r = await api('GET', `/api/admin/rounds/${id}/departments/${deptId}`);
    const d = r.department;
    $app.innerHTML = `<p class="crumbs"><a href="#/round/${id}">← العودة لتقرير الجولة</a></p>
      <div class="page-head"><div><h1>${esc(d.name)}</h1><p class="muted" style="margin:0">${esc(d.head)} — ${esc(d.title)} · ${statusPill(d.status)} ${d.submittedAt ? '· سُلّم ' + date(d.submittedAt) : ''}</p></div><button class="btn light no-print" onclick="window.print()">طباعة</button></div>
      <div class="grid g2"><div class="card row" style="gap:24px">${gauge(r.overall, 170)}<div>${tierPill(r.tier.tier)}<p class="muted" style="margin-top:8px">${r.tier.desc}</p></div></div>
        <div class="card"><div class="bars-h">${r.functions.filter((f) => f.score !== null).map((f) => bar(esc(f.name), f.score)).join('')}</div></div></div>
      <div class="section-title"><h2>توصيات القسم</h2></div>${recList(r.recommendations, [])}
      <div class="section-title"><h2>الإجابات</h2></div>
      <div class="card" style="padding:6px 12px"><table><thead><tr><th>الرمز</th><th>السؤال</th><th>الإجابة</th></tr></thead><tbody>
        ${r.answers.map((a) => `<tr><td class="mono">${a.id}</td><td>${esc(a.text)}</td><td>${a.answer ? esc(a.answer) : `<span class="ans-state">${a.state === 'skipped_na' ? 'غير منطبق' : a.state === 'skipped_zero' ? 'تم تخطيه (المتطلب غير موجود) — صفر' : 'لم يُجب'}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
    bindRecTabs($app);
  });

  // ======================= المعايير والأسئلة =======================
  route('/criteria', async (q) => {
    await layout('criteria');
    const fw = await framework(true);
    const typeName = (id) => (fw.types.find((t) => t.id === id) || {}).name || '?';
    $app.innerHTML = `
      <div class="page-head"><div><h1>المعايير والأسئلة</h1><p class="muted" style="margin:0">${fw.questions.length} سؤالاً في ${fw.functions.length} محاور. كل سؤال: وزنه، خياراته ودرجاتها، التوصية لكل إجابة ضعيفة، الأقسام الموجه لها، وحجم الشركات.</p></div>
        <a class="btn" href="#/question/new">+ إضافة سؤال / معيار</a></div>
      <div class="filters">
        <select id="fFn"><option value="">كل المحاور</option>${fw.functions.map((f) => `<option value="${f.code}" ${q.fn === f.code ? 'selected' : ''}>${esc(f.name)} (${f.code})</option>`).join('')}</select>
        <select id="fType"><option value="">كل أنواع الأقسام</option><option value="all">الأسئلة العامة (لكل الأقسام)</option>${fw.types.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        <select id="fSize"><option value="">كل الأحجام</option>${fw.sizes.map((s) => `<option value="${s.code}">${s.name}</option>`).join('')}</select>
        <input type="text" id="fText" placeholder="بحث في النص أو الرمز…">
      </div>
      <div class="card" style="padding:0" id="qlist"></div>`;
    const render = () => {
      const fn = document.getElementById('fFn').value; const ty = document.getElementById('fType').value;
      const sz = document.getElementById('fSize').value; const tx = document.getElementById('fText').value.trim();
      const list = fw.questions.filter((x) => (!fn || x.fn === fn)
        && (!ty || (ty === 'all' ? !x.targets.length : (!x.targets.length || x.targets.includes(+ty))))
        && (!sz || !x.sizes.length || x.sizes.includes(sz))
        && (!tx || x.text.includes(tx) || x.id.includes(tx.toUpperCase())));
      document.getElementById('qlist').innerHTML = list.map((x) => `
        <div class="q-item ${x.active ? '' : 'off'}">
          <div><span class="code-pill" style="font-size:.8rem">${x.id}</span></div>
          <div><b>${esc(x.text)}</b>
            <div class="meta"><span class="badge fn">${esc((fw.functions.find((f) => f.code === x.fn) || {}).name)}</span>${x.ref ? `<span class="badge mono">${esc(x.ref)}</span>` : ''}<span class="badge">الوزن ${x.weight}</span>
              <span class="badge">${x.targets.length ? '🏢 ' + x.targets.map(typeName).join('، ') : '🏢 كل الأقسام'}</span>
              ${x.sizes.length ? `<span class="badge">📏 ${x.sizes.map((s) => C.SIZES[s]).join('، ')} فقط</span>` : ''}
              ${x.when ? `<span class="badge">↪ شرطي: ${x.when.answer ? esc(x.when.answer) : 'ملف الشركة'}</span>` : ''}
              <span class="badge">${x.options.length} خيارات · ${Object.keys(x.rec).length} توصيات</span>
              ${x.usage ? `<span class="badge">${x.usage} إجابة</span>` : ''}${x.active ? '' : '<span class="badge" style="background:var(--critical-bg);color:var(--critical)">معطّل</span>'}</div></div>
          <div><a class="btn light sm" href="#/question/${x.id}">تعديل</a></div></div>`).join('') || '<div class="empty"><h3>لا توجد نتائج</h3></div>';
    };
    ['fFn', 'fType', 'fSize'].forEach((i) => { document.getElementById(i).onchange = render; });
    document.getElementById('fText').oninput = render;
    render();
  });

  route('/question/:id', async (qid) => {
    await layout('criteria');
    const fw = await framework(true);
    const isNew = qid === 'new';
    const q = isNew ? { id: '', fn: fw.functions[0].code, ref: '', text: '', help: '', weight: 3, sizes: [], targets: [], active: true, when: null, onSkip: null,
      options: [{ value: 'yes', label: 'نعم', score: 1 }, { value: 'partial', label: 'جزئياً', score: 0.5 }, { value: 'no', label: 'لا', score: 0 }], rec: {} }
      : fw.questions.find((x) => x.id === qid);
    if (!q) throw new Error('السؤال غير موجود');
    const cond = q.when ? (q.when.answer ? 'answer' : 'profile') : 'none';
    const optRow = (o, i) => { const r = q.rec[o.value] || {}; return `
      <div class="opt-row" data-i="${i}">
        <div class="top">
          <div><label>القيمة (رمز)</label><input type="text" class="o-value" dir="ltr" value="${esc(o.value)}"></div>
          <div><label>نص الخيار</label><input type="text" class="o-label" value="${esc(o.label)}"></div>
          <div><label>الدرجة 0–1</label><input type="number" class="o-score" step="0.05" min="0" max="1" value="${o.score === null ? '' : o.score}" placeholder="غير منطبق"></div>
          <button type="button" class="icon-btn o-del" title="حذف الخيار">×</button>
        </div>
        <details ${r.title ? 'open' : ''}><summary>التوصية عند اختيار هذه الإجابة ${r.title ? '✓' : '(اختياري)'}</summary>
          <div class="field" style="margin-top:8px"><input type="text" class="r-title" placeholder="عنوان التوصية" value="${esc(r.title || '')}"></div>
          <textarea class="r-action" placeholder="الخطوات العملية المطلوبة…">${esc(r.action || '')}</textarea>
          <div class="rec-grid">
            <select class="r-priority">${Object.entries(C.PRI).map(([k, v]) => `<option value="${k}" ${(r.priority || 'medium') === k ? 'selected' : ''}>أولوية ${v}</option>`).join('')}</select>
            <select class="r-effort">${Object.entries(C.EFFORT).map(([k, v]) => `<option value="${k}" ${(r.effort || 'low') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <select class="r-cost">${Object.entries(C.COST).map(([k, v]) => `<option value="${k}" ${(r.cost || 'free') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <input type="number" class="r-days" min="1" max="365" value="${r.days || 30}" title="المدة بالأيام">
          </div></details></div>`; };
    $app.innerHTML = `
      <p class="crumbs"><a href="#/criteria">المعايير والأسئلة</a> ›</p>
      <div class="page-head"><h1>${isNew ? 'إضافة سؤال / معيار' : `تعديل ${esc(q.id)}`}</h1>${!isNew ? '<button class="btn light" id="delQ" style="color:var(--critical)">حذف / أرشفة</button>' : ''}</div>
      <form id="f" style="max-width:900px" class="stack">
        <div class="card"><h3>الأساسيات</h3><div class="form-grid">
          <div class="field"><label>رمز السؤال *</label><input type="text" name="id" dir="ltr" required value="${esc(q.id)}" ${isNew ? '' : 'readonly'} placeholder="PR-20"></div>
          <div class="field"><label>المحور *</label><select name="fn">${fw.functions.map((f) => `<option value="${f.code}" ${q.fn === f.code ? 'selected' : ''}>${esc(f.name)} (${f.code})</option>`).join('')}</select></div>
          <div class="field full"><label>نص السؤال *</label><textarea name="text" required style="min-height:60px">${esc(q.text)}</textarea></div>
          <div class="field full"><label>لماذا نسأل؟ (شرح يظهر للمسؤول)</label><textarea name="help" style="min-height:50px">${esc(q.help || '')}</textarea></div>
          <div class="field"><label>المرجع في NIST CSF 2.0</label><input type="text" name="ref" dir="ltr" value="${esc(q.ref)}" placeholder="PR.AA-03"></div>
          <div class="field"><label>الوزن (0.5–10) <span class="muted">— 5 للضوابط الأهم</span></label><input type="number" name="weight" step="0.5" min="0.5" max="10" value="${q.weight}"></div>
          <div class="field full"><label class="toggle" style="display:inline-flex"><input type="checkbox" name="active" ${q.active ? 'checked' : ''}><div><b>السؤال فعّال</b><span>الأسئلة المعطلة لا تظهر في الجولات الجديدة</span></div></label></div>
        </div></div>

        <div class="card"><h3>لمن يُطرح السؤال؟</h3>
          <label>أنواع الأقسام <span class="muted">(بدون اختيار = يُطرح على كل الأقسام)</span></label>
          <div class="checks">${fw.types.map((t) => `<label class="check"><input type="checkbox" name="targets" data-multi="1" value="${t.id}" ${q.targets.includes(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</div>
          <label style="margin-top:14px">حجم الشركة <span class="muted">(بدون اختيار = كل الأحجام)</span></label>
          <div class="checks">${fw.sizes.map((s) => `<label class="check"><input type="checkbox" name="sizes" data-multi="1" value="${s.code}" ${q.sizes.includes(s.code) ? 'checked' : ''}>${s.name} (${s.range})</label>`).join('')}</div>
        </div>

        <div class="card"><h3>منطق التخطي (اختياري)</h3>
          <div class="form-grid">
            <div class="field"><label>يظهر السؤال</label><select name="condType" id="condType">
              <option value="none" ${cond === 'none' ? 'selected' : ''}>دائماً</option>
              <option value="answer" ${cond === 'answer' ? 'selected' : ''}>حسب إجابة سؤال آخر</option>
              <option value="profile" ${cond === 'profile' ? 'selected' : ''}>حسب ملف الشركة</option></select></div>
            <div class="field" id="skipBox"><label>عند التخطي</label><select name="onSkip">
              <option value="na" ${q.onSkip !== 'zero' ? 'selected' : ''}>غير منطبق — يُستبعد من الحساب</option>
              <option value="zero" ${q.onSkip === 'zero' ? 'selected' : ''}>المتطلب مفقود — يُحسب صفراً</option></select></div>
          </div>
          <div id="condAnswer" class="form-grid">
            <div class="field"><label>السؤال المرجعي</label><select name="condQ" id="condQ">${fw.questions.filter((x) => x.id !== q.id).map((x) => `<option value="${x.id}" ${q.when && q.when.answer === x.id ? 'selected' : ''}>${x.id} — ${esc(x.text.slice(0, 50))}…</option>`).join('')}</select></div>
            <div class="field"><label>الشرط</label><select name="condOp"><option value="in" ${q.when && q.when.notIn ? '' : 'selected'}>إذا كانت الإجابة إحدى</option><option value="notIn" ${q.when && q.when.notIn ? 'selected' : ''}>إذا لم تكن الإجابة إحدى</option></select></div>
            <div class="field full"><label>القيم</label><div class="checks" id="condVals"></div></div>
          </div>
          <div id="condProfile" class="field"><label>إذا كانت الشركة</label><select name="condProfile">${C.FLAGS.map(([k, l]) => `<option value="${k}" ${q.when && q.when.profile === k ? 'selected' : ''}>تستخدم/لديها: ${l}</option>`).join('')}</select></div>
        </div>

        <div class="card"><div class="row between"><h3 style="margin:0">الخيارات والدرجات والتوصيات</h3><button type="button" class="btn light sm" id="addOpt">+ خيار</button></div>
          <p class="muted" style="font-size:.85rem">الدرجة 1 = ممتاز، 0 = غير موجود. اترك الدرجة فارغة لخيار "غير منطبق". أضف توصية لكل إجابة ضعيفة لتظهر في خطة العمل.</p>
          <div id="opts">${q.options.map(optRow).join('')}</div></div>

        <div class="error" id="err"></div>
        <div class="row"><button class="btn lg">حفظ السؤال</button><a class="btn light" href="#/criteria">إلغاء</a></div>
      </form>`;
    const f = document.getElementById('f');
    const condVals = () => {
      const ref = fw.questions.find((x) => x.id === document.getElementById('condQ').value);
      const sel = q.when ? (q.when.in || q.when.notIn || []) : [];
      document.getElementById('condVals').innerHTML = ref ? ref.options.map((o) => `<label class="check"><input type="checkbox" class="cv" value="${esc(o.value)}" ${sel.includes(o.value) ? 'checked' : ''}>${esc(o.label)}</label>`).join('') : '';
    };
    const condUI = () => {
      const t = document.getElementById('condType').value;
      document.getElementById('condAnswer').style.display = t === 'answer' ? '' : 'none';
      document.getElementById('condProfile').style.display = t === 'profile' ? '' : 'none';
      document.getElementById('skipBox').style.visibility = t === 'none' ? 'hidden' : 'visible';
    };
    document.getElementById('condType').onchange = condUI;
    document.getElementById('condQ').onchange = condVals;
    condVals(); condUI();
    const bindDel = () => document.querySelectorAll('.o-del').forEach((b) => { b.onclick = () => b.closest('.opt-row').remove(); });
    bindDel();
    document.getElementById('addOpt').onclick = () => {
      const n = document.querySelectorAll('.opt-row').length;
      document.getElementById('opts').insertAdjacentHTML('beforeend', optRow({ value: `opt${n + 1}`, label: '', score: 0 }, n));
      bindDel();
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = formData(f);
      const t = b.condType;
      const payload = {
        id: b.id, fn: b.fn, text: b.text, help: b.help, ref: b.ref, weight: +b.weight, active: b.active,
        targets: (b.targets || []).map(Number), sizes: b.sizes || [], onSkip: b.onSkip,
        when: t === 'answer' ? { answer: b.condQ, op: b.condOp, values: [...document.querySelectorAll('.cv:checked')].map((x) => x.value) } : t === 'profile' ? { profile: b.condProfile } : null,
        options: [...document.querySelectorAll('.opt-row')].map((r) => ({
          value: r.querySelector('.o-value').value, label: r.querySelector('.o-label').value,
          score: r.querySelector('.o-score').value === '' ? null : +r.querySelector('.o-score').value,
          rec: { title: r.querySelector('.r-title').value, action: r.querySelector('.r-action').value, priority: r.querySelector('.r-priority').value,
            effort: r.querySelector('.r-effort').value, cost: r.querySelector('.r-cost').value, days: +r.querySelector('.r-days').value },
        })),
      };
      try {
        if (isNew) await api('POST', '/api/admin/questions', payload); else await api('PUT', `/api/admin/questions/${q.id}`, payload);
        fwCache = null; toast('تم حفظ السؤال'); location.hash = '#/criteria';
      } catch (er) { document.getElementById('err').textContent = er.message; window.scrollTo(0, document.body.scrollHeight); }
    };
    const dq = document.getElementById('delQ');
    if (dq) dq.onclick = async () => {
      if (!confirmDel(`حذف ${q.id}؟ إذا كان مستخدماً في إجابات سابقة سيُعطَّل بدلاً من حذفه.`)) return;
      try { const r = await api('DELETE', `/api/admin/questions/${q.id}`); fwCache = null; toast(r.archived ? 'تم تعطيل السؤال (له إجابات سابقة)' : 'تم حذف السؤال'); location.hash = '#/criteria'; } catch (er) { toast(er.message); }
    };
  });

  // ======================= المحاور =======================
  route('/functions', async () => {
    await layout('functions');
    const fw = await framework(true);
    $app.innerHTML = `<div class="page-head"><div><h1>المحاور</h1><p class="muted" style="margin:0">وظائف NIST CSF 2.0 الست، ويمكن إضافة محاور جديدة (مثل حماية البيانات الشخصية).</p></div><button class="btn" id="add">+ إضافة محور</button></div>
      <div class="grid g3">${fw.functions.map((f) => `<div class="card"><div class="row between"><span class="code-pill">${f.code}</span><span class="muted mono">${esc(f.name_en)}</span></div>
        <h3 style="margin:12px 0 4px">${esc(f.name)}</h3><p class="muted" style="font-size:.9rem">${esc(f.goal)}</p>
        <div class="row between"><a href="#/criteria?fn=${f.code}">${f.questions} سؤالاً ←</a><div class="row" style="gap:4px"><button class="btn light sm" data-e="${f.code}">تعديل</button><button class="btn light sm" data-d="${f.code}" style="color:var(--critical)">حذف</button></div></div></div>`).join('')}</div>`;
    const m = (f) => modal(`<h2>${f ? 'تعديل محور' : 'إضافة محور'}</h2>
      <div class="form-grid"><div class="field"><label>الرمز (إنجليزي)</label><input type="text" name="code" dir="ltr" required value="${esc(f ? f.code : '')}" ${f ? 'readonly' : ''} placeholder="PDP"></div>
      <div class="field"><label>الترتيب</label><input type="number" name="sort" value="${f ? f.sort : fw.functions.length + 1}"></div>
      <div class="field"><label>الاسم بالعربية</label><input type="text" name="name" required value="${esc(f ? f.name : '')}"></div>
      <div class="field"><label>الاسم بالإنجليزية</label><input type="text" name="name_en" dir="ltr" value="${esc(f ? f.name_en : '')}"></div>
      <div class="field full"><label>الهدف</label><textarea name="goal">${esc(f ? f.goal : '')}</textarea></div></div>`,
    async (form) => { const b = formData(form); if (f) await api('PUT', `/api/admin/functions/${f.code}`, b); else await api('POST', '/api/admin/functions', b); fwCache = null; toast('تم الحفظ'); location.reload(); });
    document.getElementById('add').onclick = () => m();
    $app.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => m(fw.functions.find((x) => x.code === b.dataset.e)); });
    $app.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => { if (!confirmDel('حذف المحور؟')) return; try { await api('DELETE', `/api/admin/functions/${b.dataset.d}`); fwCache = null; location.reload(); } catch (e) { toast(e.message); } }; });
  });

  // ======================= أنواع الأقسام =======================
  route('/types', async () => {
    await layout('types');
    const fw = await framework(true);
    const targeted = fw.questions.filter((q) => q.targets.length && q.active);
    const general = fw.questions.filter((q) => !q.targets.length && q.active);
    $app.innerHTML = `<div class="page-head"><div><h1>أنواع الأقسام</h1><p class="muted" style="margin:0">نوع القسم يحدد المعايير التي يجيب عليها مسؤوله. ${general.length} أسئلة عامة تُطرح على كل الأقسام تلقائياً: ${general.map((q) => q.id).join('، ')}.</p></div><button class="btn" id="add">+ إضافة نوع قسم</button></div>
      <div class="grid g3">${fw.types.map((t) => `<div class="card"><h3 style="margin:0 0 4px">${esc(t.name)}</h3><p class="muted" style="font-size:.88rem">${esc(t.description)}</p>
        <div class="row between"><span><b>${t.questions}</b> سؤال · <b>${t.departments}</b> قسم</span><div class="row" style="gap:4px"><button class="btn light sm" data-e="${t.id}">تعديل</button><button class="btn light sm" data-d="${t.id}" style="color:var(--critical)">حذف</button></div></div>
        <div class="chips" style="margin-top:10px">${targeted.filter((q) => q.targets.includes(t.id)).map((q) => `<span class="chip" title="${esc(q.text)}">${q.id}</span>`).join('')}</div></div>`).join('')}</div>`;
    const m = (t) => modal(`<h2>${t ? 'تعديل نوع قسم' : 'إضافة نوع قسم'}</h2>
      <div class="field"><label>الاسم</label><input type="text" name="name" required value="${esc(t ? t.name : '')}" placeholder="مثال: التسويق الرقمي"></div>
      <div class="field"><label>الوصف</label><input type="text" name="description" value="${esc(t ? t.description : '')}"></div>
      <label>المعايير المخصصة لهذا النوع <span class="muted">(إضافة للأسئلة العامة)</span></label>
      <div style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">${fw.functions.map((f) => {
        const qs = targeted.filter((q) => q.fn === f.code); if (!qs.length) return '';
        return `<b style="font-size:.85rem">${esc(f.name)}</b>${qs.map((q) => `<label style="display:flex;gap:8px;font-weight:400;font-size:.88rem;margin:4px 0"><input type="checkbox" name="questions" data-multi="1" value="${q.id}" ${t && q.targets.includes(t.id) ? 'checked' : ''}><span><span class="mono">${q.id}</span> ${esc(q.text)}</span></label>`).join('')}`;
      }).join('')}</div>`,
    async (form) => { const b = formData(form); if (t) await api('PUT', `/api/admin/types/${t.id}`, b); else await api('POST', '/api/admin/types', b); fwCache = null; toast('تم الحفظ'); location.reload(); });
    document.getElementById('add').onclick = () => m();
    $app.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => m(fw.types.find((x) => x.id === +b.dataset.e)); });
    $app.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => { if (!confirmDel('حذف نوع القسم؟')) return; try { await api('DELETE', `/api/admin/types/${b.dataset.d}`); fwCache = null; location.reload(); } catch (e) { toast(e.message); } }; });
  });

  // ======================= الإعدادات =======================
  route('/settings', async () => {
    await layout('settings');
    const admins = await api('GET', '/api/admin/admins');
    $app.innerHTML = `<h1>الإعدادات والمدراء</h1>
      <div class="grid g2">
        <form class="card" id="f"><h3>حسابي</h3>
          <div class="field"><label>الاسم</label><input type="text" name="name" value="${esc(me.name)}"></div>
          <div class="field"><label>اسم المستخدم</label><input type="text" name="username" dir="ltr" value="${esc(me.username)}"></div>
          <div class="field"><label>كلمة المرور الجديدة <span class="muted">(اتركها فارغة لعدم التغيير)</span></label><input type="password" name="newPassword" dir="ltr" minlength="8" autocomplete="new-password"></div>
          <div class="field"><label>كلمة المرور الحالية *</label><input type="password" name="currentPassword" dir="ltr" required autocomplete="current-password"></div>
          <div class="error" id="err"></div><button class="btn">حفظ التغييرات</button></form>
        <div class="card"><div class="row between"><h3 style="margin:0">المدراء</h3><button class="btn light sm" id="addA">+ إضافة مدير</button></div>
          <table style="margin-top:10px">${admins.map((a) => `<tr><td><b>${esc(a.name)}</b><div class="muted mono">${esc(a.username)}</div></td><td class="muted" style="font-size:.8rem">${date(a.created_at)}</td><td>${a.id !== me.id ? `<button class="btn light sm" data-d="${a.id}" style="color:var(--critical)">حذف</button>` : '<span class="chip">أنت</span>'}</td></tr>`).join('')}</table></div>
      </div>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('PUT', '/api/admin/me', formData(e.target)); me = null; toast('تم الحفظ'); location.reload(); } catch (er) { document.getElementById('err').textContent = er.message; }
    };
    document.getElementById('addA').onclick = () => modal(`<h2>إضافة مدير</h2>
      <div class="field"><label>الاسم</label><input type="text" name="name" required></div>
      <div class="field"><label>اسم المستخدم</label><input type="text" name="username" dir="ltr" required></div>
      <div class="field"><label>كلمة المرور (8 أحرف على الأقل)</label><input type="password" name="password" dir="ltr" minlength="8" required></div>`,
    async (form) => { await api('POST', '/api/admin/admins', formData(form)); toast('تمت الإضافة'); location.reload(); });
    $app.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => { if (!confirmDel('حذف هذا المدير؟')) return; await api('DELETE', `/api/admin/admins/${b.dataset.d}`); location.reload(); }; });
  });
})();
