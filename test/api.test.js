const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

let server; let base;
const jar = { admin: '', head: '' };

async function api(who, method, url, body) {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', cookie: jar[who] },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie();
  if (set.length) jar[who] = set.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  server = createApp({ dbFile: ':memory:', secret: 'test', demo: false }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

let companyId; let itDept; let finDept;

test('المدير: الحماية وتسجيل الدخول بالحساب الافتراضي', async () => {
  assert.strictEqual((await api('admin', 'GET', '/api/admin/overview')).status, 401);
  assert.strictEqual((await api('admin', 'POST', '/api/admin/login', { username: 'admin', password: 'wrong' })).status, 401);
  const r = await api('admin', 'POST', '/api/admin/login', { username: 'admin', password: 'Admin@12345' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await api('admin', 'GET', '/api/admin/overview')).status, 200);
});

test('المدير: إضافة شركة متوسطة وأقسامها ومسؤوليها', async () => {
  const fw = (await api('admin', 'GET', '/api/admin/framework')).body;
  const t = (code) => fw.types.find((x) => x.code === code).id;
  let r = await api('admin', 'POST', '/api/admin/companies', { name: 'شركة اختبار', sector: 'ecommerce', employees: 80, uses_cloud: true, remote_work: true, card_payments: true, has_website: true });
  companyId = r.body.id;
  r = await api('admin', 'POST', `/api/admin/companies/${companyId}/rounds`, {});
  assert.strictEqual(r.status, 400, 'لا يمكن بدء جولة بدون أقسام');
  r = await api('admin', 'POST', `/api/admin/companies/${companyId}/departments`, { name: 'IT', type_id: t('IT'), head_name: 'علي', head_title: 'مدير IT', access_code: 'TST-1111' });
  itDept = r.body.id;
  r = await api('admin', 'POST', `/api/admin/companies/${companyId}/departments`, { name: 'المالية', type_id: t('FIN'), head_name: 'سارة', head_title: 'محاسبة' });
  finDept = r.body.id;
  const c = (await api('admin', 'GET', `/api/admin/companies/${companyId}`)).body;
  assert.strictEqual(c.size, 'medium');
  assert.strictEqual(c.departmentsList.length, 2);
  assert.match(c.departmentsList[1].access_code, /^[A-Z]{3}-\d{4}$/);
});

test('المدير: إدارة المعايير — إضافة محور وسؤال جديد موجه لقسم المالية مع توصية', async () => {
  let r = await api('admin', 'POST', '/api/admin/functions', { code: 'PDP', name: 'حماية البيانات الشخصية', name_en: 'Privacy' });
  assert.strictEqual(r.status, 200);
  const fw = (await api('admin', 'GET', '/api/admin/framework')).body;
  const fin = fw.types.find((x) => x.code === 'FIN').id;
  r = await api('admin', 'POST', '/api/admin/questions', {
    id: 'PDP-1', fn: 'PDP', ref: 'GV.OC-03', text: 'هل تحصلون على موافقة العملاء قبل جمع بياناتهم؟', weight: 3, targets: [fin],
    options: [
      { value: 'yes', label: 'نعم', score: 1 },
      { value: 'no', label: 'لا', score: 0, rec: { title: 'اطلب موافقة صريحة', action: 'أضف نموذج موافقة.', priority: 'high', effort: 'low', cost: 'free', days: 14 } },
    ],
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await api('admin', 'POST', '/api/admin/questions', { id: 'BAD', fn: 'PDP', text: 'x', weight: 3, options: [{ value: 'a', label: 'a', score: 2 }, { value: 'b', label: 'b', score: 0 }] });
  assert.strictEqual(r.status, 400, 'درجة خارج النطاق مرفوضة');
});

let itLink; let finLink; let finCode; let roundId;
test('جولة تقييم: مسؤول القسم يدخل بالرابط + المعرّف ويجيب على أسئلة قسمه فقط', async () => {
  roundId = (await api('admin', 'POST', `/api/admin/companies/${companyId}/rounds`, { title: 'الجولة 1' })).body.id;
  const c = (await api('admin', 'GET', `/api/admin/companies/${companyId}`)).body;
  const it = c.departmentsList.find((d) => d.id === itDept);
  const fin = c.departmentsList.find((d) => d.id === finDept);
  itLink = it.link_token; finLink = fin.link_token; finCode = fin.access_code;

  let r = await api('head', 'GET', `/api/portal/link/${itLink}`);
  assert.strictEqual(r.body.department, 'IT');
  assert.ok(!('head' in r.body), 'لا تظهر بيانات المسؤول قبل إدخال المعرّف');
  assert.strictEqual((await api('head', 'GET', '/api/portal/me')).status, 401);
  assert.strictEqual((await api('head', 'POST', `/api/portal/link/${itLink}/login`, { code: 'WRONG-0000' })).status, 401);
  assert.strictEqual((await api('head', 'POST', `/api/portal/link/${itLink}/login`, { code: 'tst-1111' })).status, 200);

  let s = (await api('head', 'GET', '/api/portal/me')).body;
  assert.strictEqual(s.head.name, 'علي');
  assert.strictEqual(s.head.title, 'مدير IT');
  // سؤال المالية لا يمكن الإجابة عليه من قسم IT
  assert.strictEqual((await api('head', 'POST', '/api/portal/answers', { questionId: 'PDP-1', value: 'yes' })).status, 400);
  assert.strictEqual((await api('head', 'POST', '/api/portal/submit')).status, 400, 'لا تسليم قبل الإكمال');
  const seen = [];
  while (s.question) {
    seen.push(s.question.id);
    s = (await api('head', 'POST', '/api/portal/answers', { questionId: s.question.id, value: s.question.id === 'PR-1' ? 'no' : s.question.options[0].value })).body;
  }
  assert.ok(seen.includes('PR-1') && seen.includes('PR-16'), 'أسئلة IT وأسئلة الشركات المتوسطة');
  assert.ok(!seen.includes('PR-17') && !seen.includes('PDP-1'), 'لا أسئلة المالية');
  s = (await api('head', 'POST', '/api/portal/submit')).body;
  assert.strictEqual(s.status, 'submitted');
  assert.ok(s.summary.overall > 0);
  assert.strictEqual((await api('head', 'POST', '/api/portal/answers', { questionId: 'PR-1', value: 'mandatory' })).status, 409);
});

test('المالية تجيب على السؤال الجديد الذي أضافه المدير، والتقرير يجمع القسمين', async () => {
  jar.head = '';
  await api('head', 'POST', `/api/portal/link/${finLink}/login`, { code: finCode });
  let s = (await api('head', 'GET', '/api/portal/me')).body;
  const seen = [];
  while (s.question) {
    seen.push(s.question.id);
    s = (await api('head', 'POST', '/api/portal/answers', { questionId: s.question.id, value: s.question.id === 'PDP-1' ? 'no' : s.question.options[0].value })).body;
  }
  assert.ok(seen.includes('PDP-1') && seen.includes('PR-17'));
  await api('head', 'POST', '/api/portal/submit');

  let rep = (await api('admin', 'GET', `/api/admin/rounds/${roundId}/report`)).body;
  assert.strictEqual(rep.participation.submitted, 2);
  assert.strictEqual(rep.departments.length, 2);
  assert.ok(rep.functions.some((f) => f.code === 'PDP' && f.score === 0));
  assert.ok(rep.recommendations.some((r) => r.questionId === 'PR-1' && r.departments.includes('IT')));
  assert.ok(rep.recommendations.some((r) => r.questionId === 'PDP-1'));
  assert.ok(rep.alerts.some((a) => a.id === 'credential-theft'));

  const r = await api('admin', 'POST', `/api/admin/rounds/${roundId}/close`);
  assert.strictEqual(r.status, 200);
  const ov = (await api('admin', 'GET', '/api/admin/overview')).body;
  assert.strictEqual(ov.counts.companies, 1);
  assert.strictEqual(ov.companies[0].lastScore, r.body.overall);
});

test('أمان البوابة: تغيير المعرّف يُبطل الدخول القديم، والتخمين محدود', async () => {
  await api('admin', 'POST', `/api/admin/departments/${finDept}/regenerate`, { what: 'link' });
  assert.strictEqual((await api('head', 'GET', '/api/portal/me')).status, 401);
  for (let i = 0; i < 5; i++) await api('head', 'POST', `/api/portal/link/${itLink}/login`, { code: 'XXX-0000' });
  assert.strictEqual((await api('head', 'POST', `/api/portal/link/${itLink}/login`, { code: 'TST-1111' })).status, 429);
});

test('المدير: تغيير كلمة المرور', async () => {
  let r = await api('admin', 'PUT', '/api/admin/me', { currentPassword: 'bad', newPassword: 'NewPass123' });
  assert.strictEqual(r.status, 400);
  r = await api('admin', 'PUT', '/api/admin/me', { currentPassword: 'Admin@12345', newPassword: 'NewPass123' });
  assert.strictEqual(r.status, 200);
  jar.admin = '';
  assert.strictEqual((await api('admin', 'POST', '/api/admin/login', { username: 'admin', password: 'NewPass123' })).status, 200);
});

test('حذف سؤال مستخدم في إجابات يؤرشفه بدلاً من حذفه', async () => {
  const r = await api('admin', 'DELETE', '/api/admin/questions/PDP-1');
  assert.strictEqual(r.body.archived, true);
});
