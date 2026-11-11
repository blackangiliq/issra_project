const test = require('node:test');
const assert = require('node:assert');
const { openDb, loadBank } = require('../src/db');
const engine = require('../src/engine');

const fullBank = loadBank(openDb(':memory:'));
const baseProfile = { sector: 'retail', employees: 10, uses_cloud: false, remote_work: false, card_payments: false, has_website: false };
// بنك "شركة كاملة بقسم واحد عام": كل الأسئلة المناسبة لحجم شركة صغيرة بغض النظر عن التوجيه
const bank = { functions: fullBank.functions, questions: fullBank.questions.filter((q) => !q.sizes.length || q.sizes.includes('small')) };
const typeId = (code) => fullBank.types.find((t) => t.code === code).id;

/** يجيب على كل الأسئلة الظاهرة بالخيار الذي تحدده الدالة pick */
function answerAll(profile, pick) {
  const answers = {};
  for (let i = 0; i < 100; i++) {
    const n = engine.nextQuestion(bank, profile, answers);
    if (!n.question) break;
    answers[n.question.id] = pick(n.question);
  }
  return answers;
}
const best = (q) => q.options[0].value;
const worst = (q) => {
  const scored = q.options.filter((o) => o.score !== null);
  return scored.reduce((m, o) => (o.score < m.score ? o : m)).value;
};

test('بنك الأسئلة يُحمَّل من قاعدة البيانات ويغطي الوظائف الست', () => {
  assert.strictEqual(bank.functions.length, 6);
  assert.ok(fullBank.questions.length >= 35);
  assert.strictEqual(fullBank.types.length, 6);
  for (const f of ['GV', 'ID', 'PR', 'DE', 'RS', 'RC']) {
    assert.ok(bank.questions.some((q) => q.fn === f), `لا توجد أسئلة للوظيفة ${f}`);
  }
});

test('منطق التخطي: لا يُسأل عن السحابة إذا لم تستخدم الشركة السحابة', () => {
  const ans = answerAll(baseProfile, best);
  assert.ok(!('PR-12' in ans));
  const ans2 = answerAll({ ...baseProfile, uses_cloud: true }, best);
  assert.ok('PR-12' in ans2);
});

test('منطق التخطي: "لا يوجد مسؤول" يتخطى أسئلة السياسات التفصيلية', () => {
  const answers = { 'GV-1': 'no' };
  const n = engine.nextQuestion(bank, baseProfile, answers);
  assert.notStrictEqual(n.question.id, 'GV-2');
  const states = engine.visibility(bank, baseProfile, answers);
  for (const id of ['GV-2', 'GV-3', 'GV-4']) {
    assert.strictEqual(states.find((s) => s.q.id === id).state, 'skipped_zero');
  }
});

test('التخطي بسبب متطلب مفقود يُحسب صفراً، والتخطي لعدم الانطباق يُستبعد', () => {
  const all = answerAll(baseProfile, best);
  assert.strictEqual(engine.score(bank, baseProfile, all).overall, 100); // أسئلة السحابة مستبعدة لا تخفض الدرجة
  const noOwner = { ...all, 'GV-1': 'no' };
  const s = engine.score(bank, baseProfile, noOwner);
  assert.strictEqual(s.functions.find((f) => f.code === 'GV').score < 30, true);
});

test('الدرجات: أفضل إجابات = 100 والمستوى 4، أسوأ إجابات = 0 والمستوى 1', () => {
  const b = engine.score(bank, baseProfile, answerAll(baseProfile, best));
  assert.strictEqual(b.overall, 100); assert.strictEqual(b.tier.tier, 4);
  const w = engine.score(bank, baseProfile, answerAll(baseProfile, worst));
  assert.strictEqual(w.overall, 0); assert.strictEqual(w.tier.tier, 1);
});

test('الأوزان: MFA والنسخ الاحتياطي لهما أعلى وزن', () => {
  const max = Math.max(...bank.questions.map((q) => q.weight));
  assert.strictEqual(bank.questions.find((q) => q.id === 'PR-1').weight, max);
  assert.strictEqual(bank.questions.find((q) => q.id === 'PR-5').weight, max);
});

test('الأوزان المتكيفة: قطاع الصحة يرفع وزن حماية البيانات', () => {
  const q = bank.questions.find((x) => x.id === 'PR-14');
  const normal = engine.adjustedWeight(q, baseProfile).weight;
  const health = engine.adjustedWeight(q, { ...baseProfile, sector: 'health' });
  assert.ok(health.weight > normal);
  assert.ok(health.reasons.length > 0);
});

test('مستويات النضج حسب الحدود', () => {
  assert.strictEqual(engine.tierFor(39.9).tier, 1);
  assert.strictEqual(engine.tierFor(40).tier, 2);
  assert.strictEqual(engine.tierFor(60).tier, 3);
  assert.strictEqual(engine.tierFor(80).tier, 4);
});

test('محرك التوصيات: كل إجابة سلبية لها توصية، و MFA تأتي حرجة في المقدمة', () => {
  const answers = answerAll(baseProfile, worst);
  const r = engine.recommendations(bank, baseProfile, answers);
  for (const [qid, val] of Object.entries(answers)) {
    const q = bank.questions.find((x) => x.id === qid);
    const opt = q.options.find((o) => o.value === val);
    if (opt.score !== null && opt.score < 1) {
      assert.ok(r.recommendations.some((x) => x.questionId === qid), `لا توجد توصية للسؤال ${qid}`);
    }
  }
  assert.strictEqual(r.recommendations[0].priority, 'critical');
  assert.ok(r.recommendations.find((x) => x.questionId === 'PR-1').action.includes('MFA'));
  assert.ok(r.projected.afterMonth > 0);
});

test('التوصية بتعيين مسؤول تشير إلى الأسئلة التي ستفتحها', () => {
  const r = engine.recommendations(bank, baseProfile, { ...answerAll(baseProfile, best), 'GV-1': 'no' });
  const rec = r.recommendations.find((x) => x.questionId === 'GV-1');
  assert.deepStrictEqual(rec.unlocks.sort(), ['GV-2', 'GV-4']);
});

test('الثغرات الحرجة المركبة: عمل عن بعد بدون MFA + لا نسخ احتياطي', () => {
  const p = { ...baseProfile, remote_work: true };
  const answers = { ...answerAll(p, best), 'PR-1': 'no', 'PR-5': 'none' };
  const ids = engine.criticalAlerts(bank, p, answers).map((a) => a.id);
  assert.ok(ids.includes('credential-theft'));
  assert.ok(ids.includes('ransomware'));
});

test('تصنيف حجم الشركة', () => {
  assert.strictEqual(engine.sizeOf(6), 'micro');
  assert.strictEqual(engine.sizeOf(18), 'small');
  assert.strictEqual(engine.sizeOf(120), 'medium');
});

test('أسئلة الشركات المتوسطة لا تظهر للشركات الصغيرة', () => {
  const small = engine.bankFor(fullBank, { ...baseProfile, employees: 20 }, typeId('IT')).questions.map((q) => q.id);
  const medium = engine.bankFor(fullBank, { ...baseProfile, employees: 120 }, typeId('IT')).questions.map((q) => q.id);
  assert.ok(!small.includes('PR-16') && medium.includes('PR-16'));
});

test('توجيه الأسئلة للأقسام: المالية تُسأل عن التحويلات، وتقنية المعلومات عن MFA، والأسئلة العامة للجميع', () => {
  const fin = engine.bankFor(fullBank, baseProfile, typeId('FIN')).questions.map((q) => q.id);
  const it = engine.bankFor(fullBank, baseProfile, typeId('IT')).questions.map((q) => q.id);
  assert.ok(fin.includes('PR-17') && !fin.includes('PR-1'));
  assert.ok(it.includes('PR-1') && !it.includes('PR-17'));
  for (const general of ['ID-3', 'PR-4', 'PR-9', 'DE-3']) assert.ok(fin.includes(general) && it.includes(general));
  // نوع قسم جديد بلا توجيه يحصل على الأسئلة العامة فقط
  const custom = engine.bankFor(fullBank, baseProfile, 9999).questions.map((q) => q.id);
  assert.deepStrictEqual(custom.sort(), ['DE-3', 'ID-3', 'PR-4', 'PR-9']);
});

test('شرط يعتمد على سؤال في قسم آخر لا يعلّق السؤال', () => {
  const hr = engine.bankFor(fullBank, baseProfile, typeId('HR'));
  const n = engine.nextQuestion(hr, baseProfile, {});
  assert.ok(n.question); // GV-3 يعتمد على GV-2 (الإدارة) لكنه يُطرح على الموارد البشرية
  assert.ok(hr.questions.some((q) => q.id === 'GV-3'));
});

test('تجميع نتائج الشركة من الأقسام: متوسط الأسئلة المشتركة وتوصيات تذكر الأقسام', () => {
  const answerAllSub = (code, pick) => {
    const sub = engine.bankFor(fullBank, baseProfile, typeId(code));
    const a = {};
    for (let i = 0; i < 100; i++) { const n = engine.nextQuestion(sub, baseProfile, a); if (!n.question) break; a[n.question.id] = pick(n.question); }
    return a;
  };
  const depts = [
    { id: 1, name: 'تقنية المعلومات', typeId: typeId('IT'), answers: answerAllSub('IT', best) },
    { id: 2, name: 'المالية', typeId: typeId('FIN'), answers: answerAllSub('FIN', worst) },
  ];
  const agg = engine.aggregate(fullBank, baseProfile, depts);
  assert.strictEqual(agg.departments.find((d) => d.id === 1).overall, 100);
  assert.strictEqual(agg.departments.find((d) => d.id === 2).overall, 0);
  const pr4 = agg.questionStats.find((q) => q.id === 'PR-4');
  assert.strictEqual(pr4.avg, 50); // مشترك: 100 لتقنية المعلومات و0 للمالية
  const rec = agg.recommendations.find((r) => r.questionId === 'PR-4');
  assert.deepStrictEqual(rec.departments, ['المالية']);
  assert.ok(agg.overall > 0 && agg.overall < 100);
});
