/* درع — أدوات مشتركة: الاتصال بالخادم، الموجّه، النوافذ، الرسوم البيانية */
window.App = (() => {
  const $app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n === null || n === undefined ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US'));
  const date = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
  const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); };
  const scoreColor = (s) => (s === null || s === undefined ? '#b5b9c2' : s < 40 ? 'var(--critical)' : s < 60 ? 'var(--high)' : s < 80 ? 'var(--medium)' : 'var(--accent)');
  const heatBg = (s) => (s === null || s === undefined ? '' : s < 40 ? '#f7d9d5' : s < 60 ? '#fae2cf' : s < 80 ? '#f5ebc4' : '#cfe8e1');

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'خطأ غير متوقع'), { status: res.status, data });
    return data;
  }

  const C = {
    SECTORS: { retail: 'تجارة التجزئة', ecommerce: 'تجارة إلكترونية', health: 'الرعاية الصحية', finance: 'خدمات مالية ومحاسبة', education: 'التعليم والتدريب', services: 'خدمات مهنية', manufacturing: 'التصنيع', other: 'أخرى' },
    SIZES: { micro: 'متناهية الصغر', small: 'صغيرة', medium: 'متوسطة' },
    PRI: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    EFFORT: { low: 'جهد قليل', medium: 'جهد متوسط', high: 'جهد كبير' },
    COST: { free: 'مجاني', low: 'تكلفة منخفضة', medium: 'تكلفة متوسطة', high: 'تكلفة عالية' },
    STATUS: { submitted: 'سلّم الإجابات', in_progress: 'قيد الإجابة', pending: 'لم يبدأ', open: 'مفتوحة', closed: 'مغلقة' },
    FLAGS: [['uses_cloud', 'خدمات سحابية', 'Google Drive / OneDrive / Microsoft 365'], ['remote_work', 'عمل عن بعد', 'موظفون يتصلون من خارج المكتب'], ['card_payments', 'دفع إلكتروني', 'بطاقات أو بوابات دفع'], ['has_website', 'موقع إلكتروني', 'موقع تعريفي أو متجر']],
    TIERS: [
      { tier: 1, name: 'جزئي', en: 'Partial', range: '0–39' },
      { tier: 2, name: 'مُدرك للمخاطر', en: 'Risk Informed', range: '40–59' },
      { tier: 3, name: 'قابل للتكرار', en: 'Repeatable', range: '60–79' },
      { tier: 4, name: 'متكيّف', en: 'Adaptive', range: '80–100' },
    ],
  };
  const SHIELD = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l12 5v8c0 8-5.5 13-12 15C9.5 28 4 23 4 15V7z" fill="#0e7c6b"/><path d="M11 16l4 4 7-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- الموجّه ----------
  const routes = [];
  const route = (pattern, fn, opts = {}) => routes.push({ re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), fn, ...opts });
  async function dispatch() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [p, qs] = hash.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    for (const r of routes) {
      const m = p.match(r.re);
      if (m) {
        window.scrollTo(0, 0);
        try { await r.fn(...m.slice(1).map(decodeURIComponent), query); } catch (e) {
          if (e.status === 401 && !r.public) { location.hash = '#/login'; return; }
          $app.innerHTML = `<div class="card empty"><h3>تعذر تحميل الصفحة</h3><p class="muted">${esc(e.message)}</p></div>`;
        }
        return;
      }
    }
    location.hash = '#/';
  }

  // ---------- نافذة منبثقة ----------
  function modal(html, onSubmit) {
    const dlg = document.getElementById('modal');
    const form = document.getElementById('modalForm');
    form.innerHTML = html + '<div class="error" id="mErr"></div><div class="actions"><button class="btn" value="ok">حفظ</button><button class="btn light" value="cancel" formnovalidate>إلغاء</button></div>';
    form.onsubmit = async (e) => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      e.preventDefault();
      try { await onSubmit(form); dlg.close(); } catch (er) { form.querySelector('#mErr').textContent = er.message; }
    };
    dlg.showModal();
    const first = form.querySelector('input,select,textarea'); if (first) first.focus();
  }
  const formData = (f) => {
    const o = {};
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') { if (el.dataset.multi) { (o[el.name] = o[el.name] || []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; } else o[el.name] = el.value;
    }
    return o;
  };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('تم النسخ'); } catch { prompt('انسخ النص:', text); }
  }

  // ---------- رسوم ----------
  function gauge(score, size = 220) {
    const R = 92; const Cc = 2 * Math.PI * R;
    return `<div class="gauge" style="width:${size}px;height:${size}px"><svg viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="#efede6" stroke-width="18"/>
      <circle cx="110" cy="110" r="${R}" fill="none" stroke="${scoreColor(score)}" stroke-width="18" stroke-linecap="round" stroke-dasharray="${(score / 100) * Cc} ${Cc}"/></svg>
      <div class="center"><div><div class="score" style="color:${scoreColor(score)}">${fmt(score)}</div><div class="of">من 100</div></div></div></div>`;
  }
  function radar(fns, prev) {
    fns = fns.filter((f) => f.score !== null);
    if (fns.length < 3) return '<p class="muted">لا تكفي البيانات لرسم المخطط</p>';
    const S = 380; const cx = S / 2; const cy = S / 2 + 4; const R = 120;
    const ang = (i) => -Math.PI / 2 - (i * 2 * Math.PI) / fns.length;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 100), cy + Math.sin(ang(i)) * R * (v / 100)];
    const poly = (vals) => vals.map((v, i) => pt(i, v ?? 0).join(',')).join(' ');
    const pv = prev ? fns.map((f) => prev[f.code]) : null;
    return `<svg class="radar" viewBox="0 0 ${S} ${S}" style="width:100%;max-width:380px">
      ${[25, 50, 75, 100].map((v) => `<polygon points="${poly(fns.map(() => v))}" fill="none" stroke="#e3e1da"/>`).join('')}
      ${fns.map((f, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e3e1da"/>`; }).join('')}
      ${pv && pv.every((v) => v !== null && v !== undefined) ? `<polygon points="${poly(pv)}" fill="none" stroke="#6b768a" stroke-width="1.5" stroke-dasharray="4 4"/>` : ''}
      <polygon points="${poly(fns.map((f) => f.score))}" fill="rgba(14,124,107,.18)" stroke="#0e7c6b" stroke-width="2.5" stroke-linejoin="round"/>
      ${fns.map((f, i) => { const [x, y] = pt(i, f.score ?? 0); return `<circle cx="${x}" cy="${y}" r="4" fill="#0e7c6b"/>`; }).join('')}
      ${fns.map((f, i) => { const [x, y] = pt(i, 126); const a = Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end';
        return `<text x="${x}" y="${y + (y < cy ? -6 : 14)}" text-anchor="${a}" font-weight="600">${esc(f.name)}</text>`; }).join('')}
    </svg>`;
  }
  function trend(items) {
    if (items.length < 2) return '';
    const W = 1000; const H = 200; const P = 36;
    const x = (i) => P + 50 + (i * (W - 2 * P - 100)) / (items.length - 1);
    const y = (v) => H - P - (v / 100) * (H - 2 * P);
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      ${[0, 40, 60, 80, 100].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e1da" stroke-dasharray="${v ? '3 4' : ''}"/><text x="${P - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#6b768a">${v}</text>`).join('')}
      <polyline points="${items.map((a, i) => `${x(i)},${y(a.score)}`).join(' ')}" fill="none" stroke="#0e7c6b" stroke-width="3"/>
      ${items.map((a, i) => `<circle cx="${x(i)}" cy="${y(a.score)}" r="6" fill="#fff" stroke="#0e7c6b" stroke-width="3"/>
        <text x="${x(i)}" y="${y(a.score) - 14}" text-anchor="middle" font-size="14" font-weight="600" fill="#0f1b2d">${fmt(a.score)}</text>
        <text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#6b768a">${esc(a.label)}</text>`).join('')}
    </svg>`;
  }
  const bar = (label, v, extra = '') => `<div class="row-b"><span>${label}</span><div class="track"><div class="fill" style="width:${v ?? 0}%;background:${scoreColor(v)}"></div></div><b class="num" style="color:${scoreColor(v)}">${fmt(v)}</b>${extra}</div>`;
  const tierPill = (t) => (t ? `<span class="tier-pill t${t}">${C.TIERS[t - 1].name}</span>` : '<span class="muted">—</span>');
  const statusPill = (s) => `<span class="status st-${s}">${C.STATUS[s] || s}</span>`;

  // ---------- قائمة التوصيات ----------
  function recList(recs, quickWins = []) {
    const qw = new Set(quickWins);
    const bucket = (r) => (r.days <= 7 ? 'week' : r.days <= 30 ? 'month' : 'quarter');
    const n = (f) => recs.filter(f).length;
    return `<div class="plan-tabs">
        <button data-f="all" class="on">الكل (${n(() => true)})</button>
        <button data-f="qw">مكاسب سريعة (${qw.size})</button>
        <button data-f="week">هذا الأسبوع (${n((r) => bucket(r) === 'week')})</button>
        <button data-f="month">خلال 30 يوماً (${n((r) => bucket(r) === 'month')})</button>
        <button data-f="quarter">خلال 90 يوماً (${n((r) => bucket(r) === 'quarter')})</button></div>
      <div class="card recs" style="padding:0">${recs.length ? recs.map((x) => `
        <div class="rec ${qw.has(x.questionId) ? 'is-qw' : ''}" data-b="${bucket(x)}">
          <span class="n">${x.rank}</span>
          <div><h3>${esc(x.title)}</h3><p>${esc(x.action)}</p>
            <div class="tags"><span class="tag p-${x.priority}">أولوية ${C.PRI[x.priority]}</span>
              <span class="tag"><span class="mono">${esc(x.questionId)} · ${esc(x.ref)}</span></span>
              <span class="tag">${C.EFFORT[x.effort]}</span><span class="tag">${C.COST[x.cost]}</span><span class="tag">خلال ${x.days} يوماً</span>
              ${qw.has(x.questionId) ? '<span class="tag qw">مكسب سريع</span>' : ''}</div>
            ${x.departments && x.departments.length ? `<div class="why-w">🏢 الأقسام المعنية: ${x.departments.map(esc).join('، ')}</div>` : ''}
            ${x.weightReasons && x.weightReasons.length ? `<div class="why-w">↑ وزن أعلى: ${x.weightReasons.map(esc).join('، ')}</div>` : ''}
            ${x.unlocks && x.unlocks.length ? `<div class="why-w">🔓 يفتح ${x.unlocks.length} ضوابط تم تخطيها</div>` : ''}
          </div>
          <div class="gain"><b>+${fmt(x.gain)}</b><span>نقطة متوقعة</span></div></div>`).join('') : '<div class="empty"><h3>لا توجد توصيات</h3></div>'}</div>`;
  }
  function bindRecTabs(root = document) {
    root.querySelectorAll('.plan-tabs button').forEach((b) => {
      b.onclick = () => {
        b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const f = b.dataset.f;
        b.parentNode.nextElementSibling.querySelectorAll('.rec').forEach((el) => {
          el.style.display = f === 'all' || (f === 'qw' ? el.classList.contains('is-qw') : el.dataset.b === f) ? '' : 'none';
        });
      };
    });
  }

  function start() { window.addEventListener('hashchange', dispatch); dispatch(); }

  return { $app, esc, fmt, date, toast, api, route, modal, formData, copy, gauge, radar, trend, bar, tierPill, statusPill,
    recList, bindRecTabs, scoreColor, heatBg, C, SHIELD, start };
})();
