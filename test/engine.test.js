const test = require('node:test');
const assert = require('node:assert');
const { openDb, loadBank } = require('../src/db');
const engine = require('../src/engine');

const bank = loadBank(openDb(':memory:'));
const baseProfile = { sector: 'retail', employees: 10, uses_cloud: false, remote_work: false, card_payments: false, has_website: false };

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
  assert.ok(bank.questions.length >= 30);
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
