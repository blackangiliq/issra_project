const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

let server; let base; let cookie = '';

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  server = createApp({ dbFile: ':memory:', secret: 'test' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('الحماية: الوصول بدون تسجيل دخول مرفوض', async () => {
  const r = await api('GET', '/api/assessments');
  assert.strictEqual(r.status, 401);
});

test('التسجيل: يرفض كلمة مرور قصيرة', async () => {
  const r = await api('POST', '/api/auth/register', { name: 'x', email: 'x@x.com', password: '123' });
  assert.strictEqual(r.status, 400);
});

test('سيناريو كامل: تسجيل ← ملف شركة ← استبيان ديناميكي ← تقرير', async () => {
  let r = await api('POST', '/api/auth/register', { name: 'أحمد', email: 'ahmed@test.com', password: 'password123' });
  assert.strictEqual(r.status, 201);

  r = await api('POST', '/api/assessments');
  assert.strictEqual(r.status, 400, 'يجب رفض بدء التقييم قبل ملف الشركة');

  r = await api('PUT', '/api/company', { name: 'متجر النور', sector: 'ecommerce', employees: 12, uses_cloud: true, remote_work: true, card_payments: false, has_website: true });
  assert.strictEqual(r.status, 200);

  r = await api('POST', '/api/assessments');
  assert.strictEqual(r.status, 201);
  const id = r.body.id;

  r = await api('GET', `/api/assessments/${id}/state`);
  assert.strictEqual(r.body.question.id, 'GV-1');

  // إجابة غير صالحة
  const bad = await api('POST', `/api/assessments/${id}/answers`, { questionId: 'GV-1', value: 'zzz' });
  assert.strictEqual(bad.status, 400);

  // سؤال غير منطبق (لا يوجد دفع إلكتروني)
  const na = await api('POST', `/api/assessments/${id}/answers`, { questionId: 'PR-14', value: 'yes' });
  assert.strictEqual(na.status, 400);

  // الإكمال قبل الانتهاء مرفوض
  assert.strictEqual((await api('POST', `/api/assessments/${id}/complete`)).status, 400);

  // الإجابة على كل شيء بالخيار الأول، ما عدا MFA = لا
  let state = r.body; let guard = 0;
  while (state.question && guard++ < 60) {
    const q = state.question;
    const value = q.id === 'PR-1' ? 'no' : q.options[0].value;
    state = (await api('POST', `/api/assessments/${id}/answers`, { questionId: q.id, value })).body;
  }
  assert.strictEqual(state.done, true);
  assert.ok(state.history.includes('PR-12'), 'سؤال السحابة يجب أن يظهر');
  assert.ok(!state.history.includes('PR-14'), 'سؤال الدفع يجب ألا يظهر');

  r = await api('POST', `/api/assessments/${id}/complete`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.overall > 70 && r.body.overall < 100);

  r = await api('GET', `/api/assessments/${id}/report`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.recommendations[0].questionId, 'PR-1');
  assert.ok(r.body.alerts.some((a) => a.id === 'credential-theft'));
  assert.strictEqual(r.body.functions.length, 6);

  // تقييم ثانٍ للمقارنة
  r = await api('POST', '/api/assessments');
  const id2 = r.body.id;
  state = (await api('GET', `/api/assessments/${id2}/state`)).body;
  while (state.question) {
    state = (await api('POST', `/api/assessments/${id2}/answers`, { questionId: state.question.id, value: state.question.options[0].value })).body;
  }
  await api('POST', `/api/assessments/${id2}/complete`);
  r = await api('GET', `/api/assessments/${id2}/report`);
  assert.strictEqual(r.body.overall, 100);
  assert.ok(r.body.comparison.delta > 0, 'يجب إظهار التحسن مقارنة بالتقييم السابق');

  r = await api('GET', '/api/assessments');
  assert.strictEqual(r.body.length, 2);
});

test('العزل: مستخدم آخر لا يرى تقييمات غيره', async () => {
  cookie = '';
  await api('POST', '/api/auth/register', { name: 'سارة', email: 'sara@test.com', password: 'password123' });
  const r = await api('GET', '/api/assessments/1/report');
  assert.strictEqual(r.status, 404);
});
