/* درع — بوابة مسؤول القسم: رابط خاص + معرّف (ID) */
(() => {
  const { $app, esc, fmt, toast, api, route, gauge, bar, C, SHIELD } = App;
  const bare = () => { document.getElementById('shell').classList.add('bare'); document.getElementById('side').hidden = true; };

  // ---------- صفحة الدخول بالرابط ----------
  route('/d/:token', async (token) => {
    bare();
    let info;
    try { info = await api('GET', `/api/portal/link/${token}`); } catch {
      $app.innerHTML = `<div class="portal-wrap"><div class="card empty"><span style="width:56px;height:56px;display:inline-block">${SHIELD}</span><h2>الرابط غير صالح</h2><p class="muted">ربما تم تغيير الرابط من قبل الإدارة. تواصل مع مدير المنصة للحصول على رابط جديد.</p></div></div>`;
      return;
    }
    $app.innerHTML = `
      <div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--ink);background-image:radial-gradient(circle at 20% 80%, rgba(14,124,107,.35), transparent 45%)">
        <div class="card" style="width:100%;max-width:440px;padding:36px">
          <div class="row" style="gap:10px;margin-bottom:18px"><span style="width:36px;height:36px;display:block">${SHIELD}</span><b style="font-size:1.2rem">درع</b><span class="muted" style="font-size:.85rem">تقييم الجاهزية السيبرانية</span></div>
          <p class="muted" style="margin:0">${esc(info.company)}</p>
          <h2 style="margin:2px 0 14px">قسم ${esc(info.department)}</h2>
          <p>أدخل <b>المعرّف (ID)</b> الخاص بك الذي وصلك مع الرابط.</p>
          <form id="f">
            <div class="field"><label>المعرّف</label><input type="text" name="code" required dir="ltr" autocomplete="off" placeholder="ABC-1234" style="font-size:1.2rem;letter-spacing:.08em;text-align:center"></div>
            <div class="error" id="err"></div>
            <button class="btn lg" style="width:100%;justify-content:center">دخول</button>
          </form>
          <p class="muted" style="font-size:.8rem;margin:16px 0 0">إجاباتك تُستخدم لتقييم جاهزية الشركة وتقديم توصيات لتحسينها. أجب بصدق؛ "لا" أو "غير متأكد" إجابة مفيدة.</p>
        </div></div>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('POST', `/api/portal/link/${token}/login`, { code: e.target.code.value }); location.hash = '#/portal'; } catch (er) { document.getElementById('err').textContent = er.message; }
    };
  }, { public: true });

  // ---------- البوابة ----------
  route('/portal', async (q) => {
    bare();
    let s;
    try { s = await api('GET', `/api/portal/me${q.question ? `?question=${encodeURIComponent(q.question)}` : ''}`); } catch {
      $app.innerHTML = `<div class="portal-wrap"><div class="card empty"><h2>انتهت الجلسة</h2><p class="muted">افتح الرابط الذي وصلك وأدخل المعرّف مجدداً.</p></div></div>`;
      return;
    }
    render(s);

    function header(st) {
      return `<header class="portal-head">
        <div class="row" style="gap:12px"><span style="width:34px;height:34px;display:block">${SHIELD}</span>
          <div class="who"><b>${esc(st.head.name)}</b><span>${esc(st.head.title)} · قسم ${esc(st.department)} · ${esc(st.company)}</span></div></div>
        <button class="btn ghost sm" id="out">خروج</button></header>`;
    }
    function bindOut() { document.getElementById('out').onclick = async () => { await api('POST', '/api/portal/logout'); $app.innerHTML = '<div class="portal-wrap"><div class="card empty"><h2>تم تسجيل الخروج</h2><p class="muted">يمكنك العودة لاحقاً عبر الرابط نفسه والمعرّف؛ إجاباتك محفوظة.</p></div></div>'; }; }

    function render(st) {
      let body;
      if (!st.round) {
        body = `<div class="card empty"><h2>لا توجد جولة تقييم مفتوحة حالياً</h2><p class="muted">سيتم إبلاغك عند بدء جولة جديدة.</p></div>`;
      } else if (st.status === 'submitted') {
        const sm = st.summary;
        body = `<div class="card" style="text-align:center"><span style="width:56px;height:56px;display:inline-block">${SHIELD}</span>
            <h1 style="margin-top:8px">شكراً ${esc(st.head.name.split(' ').slice(0, 2).join(' '))}</h1>
            <p class="muted">تم تسليم إجابات قسم ${esc(st.department)} في "${esc(st.round.title)}". ستطّلع الإدارة على النتائج الكاملة.</p></div>
          <div class="section-title"><h2>ملخص نتيجة قسمك</h2></div>
          <div class="card row" style="gap:24px;flex-wrap:wrap">${gauge(sm.overall, 160)}<div style="flex:1;min-width:220px"><span class="tier-pill t${sm.tier.tier}">${sm.tier.name}</span>
            <div class="bars-h" style="margin-top:12px">${sm.functions.map((f) => bar(esc(f.name), f.score)).join('')}</div></div></div>
          ${sm.top.length ? `<div class="section-title"><h2>أهم 3 خطوات لقسمك</h2></div><div class="card" style="padding:0">${sm.top.map((r, i) => `<div class="rec" style="grid-template-columns:44px 1fr"><span class="n">${i + 1}</span><div><h3>${esc(r.title)}</h3><p>${esc(r.action)}</p><div class="tags"><span class="tag p-${r.priority}">أولوية ${C.PRI[r.priority]}</span><span class="tag">خلال ${r.days} يوماً</span></div></div></div>`).join('')}</div>` : ''}`;
      } else if (!st.question) {
        body = `<div class="card" style="text-align:center;padding:40px"><span style="width:60px;height:60px;display:inline-block">${SHIELD}</span>
          <h1 style="margin-top:10px">أجبت على جميع الأسئلة</h1>
          <p class="muted">${st.answered} سؤالاً${st.skipped ? ` · تم تخطي ${st.skipped} غير منطبق` : ''}. راجع إجاباتك إن أردت، ثم سلّمها للإدارة.</p>
          <div class="row" style="justify-content:center;margin-top:20px"><button class="btn light" id="review">مراجعة الإجابات</button><button class="btn lg" id="submit">تسليم الإجابات ←</button></div>
          <p class="muted" style="font-size:.82rem;margin-top:14px">بعد التسليم لا يمكن التعديل إلا بإذن الإدارة.</p></div>`;
      } else {
        const qq = st.question;
        const idx = st.history.indexOf(qq.id);
        const prevId = idx === -1 ? st.history[st.history.length - 1] : st.history[idx - 1];
        const fns = st.functions;
        const cur = fns.findIndex((f) => f.code === qq.fn);
        body = `
          <p class="muted" style="margin:0 0 6px">${esc(st.round.title)}</p>
          <div class="stepper" style="grid-template-columns:repeat(${fns.length},1fr)">${fns.map((f, i) => `<div class="${i < cur ? 'done' : i === cur ? 'cur' : ''}">${esc(f.name)}</div>`).join('')}</div>
          <div class="progress-meta"><span>السؤال ${idx === -1 ? st.answered + 1 : idx + 1} من ~${st.total}</span><span>${st.progress}٪ مكتمل · يُحفظ تلقائياً</span></div>
          <form class="card q-card" id="qf" data-qid="${esc(qq.id)}">
            <div class="q-head"><span class="badge fn">${esc(qq.functionName || qq.fn)}</span>${qq.ref ? `<span class="badge mono">${esc(qq.ref)}</span>` : ''}</div>
            <div class="q-text">${esc(qq.text)}</div>
            ${qq.help ? `<div class="why"><b>لماذا نسأل؟</b> ${esc(qq.help)}</div>` : ''}
            <div class="opts">${qq.options.map((o) => `<label class="opt"><input type="radio" name="v" value="${esc(o.value)}" ${st.currentAnswer === o.value ? 'checked' : ''}>${esc(o.label)}</label>`).join('')}</div>
            <div class="q-foot"><button type="button" class="btn light" id="prev" ${prevId ? '' : 'disabled'}>→ السابق</button><button class="btn" id="next" ${st.currentAnswer ? '' : 'disabled'}>التالي ←</button></div>
          </form>
          ${st.skipped ? `<p class="skipnote">✓ تم تخطي <b>${st.skipped}</b> سؤالاً تلقائياً لأنها لا تنطبق حسب إجاباتك.</p>` : ''}`;
        setTimeout(() => {
          const form = document.getElementById('qf');
          form.addEventListener('change', () => { document.getElementById('next').disabled = false; });
          document.getElementById('prev').onclick = () => prevId && go(prevId);
          form.onsubmit = async (e) => {
            e.preventDefault();
            try {
              const ns = await api('POST', '/api/portal/answers', { questionId: qq.id, value: form.v.value });
              const i = ns.history.indexOf(qq.id);
              if (idx !== -1 && i !== -1 && ns.history[i + 1]) return go(ns.history[i + 1]);
              render(ns); window.scrollTo(0, 0);
            } catch (er) { toast(er.message); }
          };
        });
      }
      $app.innerHTML = header(st) + `<div class="portal-wrap">${body}</div>`;
      bindOut();
      const sb = document.getElementById('submit');
      if (sb) sb.onclick = async () => { try { render(await api('POST', '/api/portal/submit')); window.scrollTo(0, 0); } catch (er) { toast(er.message); } };
      const rv = document.getElementById('review');
      if (rv) rv.onclick = () => go(st.history[0]);
    }
    async function go(qid) { render(await api('GET', `/api/portal/me?question=${encodeURIComponent(qid)}`)); window.scrollTo(0, 0); }
  }, { public: true });
})();
