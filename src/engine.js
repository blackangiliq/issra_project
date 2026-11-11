/**
 * المحرك الذكي للتقييم
 * ------------------------------------------------------------
 * 1) منطق التخطي (Skip Logic)        → visibility()
 * 2) الأوزان المتكيفة مع ملف الشركة   → adjustedWeight()
 * 3) خوارزمية التقييم ومستوى النضج    → score()
 * 4) كاشف الثغرات الحرجة المركّبة     → criticalAlerts()
 * 5) محرك التوصيات وخطة العمل         → recommendations()
 *
 * المحرك "نقي" (Pure): لا يتعامل مع قاعدة البيانات مباشرة، بل يستقبل
 * بنك الأسئلة + ملف الشركة + الإجابات، مما يسهّل اختباره.
 */

const SKIPPED = Symbol('skipped');
const PRIORITY_RANK ={ critical: 4, high: 3, medium: 2, low: 1 };

/** مستويات النضج — مستوحاة من مستويات التطبيق (Tiers) في NIST CSF 2.0 */
const TIERS = [
  { tier: 1, min: 0, name: 'جزئي', en: 'Partial',
    desc: 'الأمن السيبراني يُدار بشكل ارتجالي وردّ فعل، والمخاطر غير معروفة بشكل كافٍ.' },
  { tier: 2, min: 40, name: 'مُدرك للمخاطر', en: 'Risk Informed',
    desc: 'هناك وعي بالمخاطر وبعض الضوابط، لكنها غير مطبقة بشكل منهجي على مستوى الشركة.' },
  { tier: 3, min: 60, name: 'قابل للتكرار', en: 'Repeatable',
    desc: 'الضوابط الأساسية موثقة ومطبقة بانتظام، والمسؤوليات واضحة.' },
  { tier: 4, min: 80, name: 'متكيّف', en: 'Adaptive',
    desc: 'الشركة تراجع وتحسّن وضعها الأمني باستمرار وتتكيف مع التهديدات المتغيرة.' },
];

function tierFor(score) {
  let t = TIERS[0];
  for (const x of TIERS) if (score >= x.min) t = x;
  return t;
}

/**
 * تقييم شرط الظهور. يعيد:
 *   true  = يظهر   | false = يُتخطى   | null = غير معروف بعد (السؤال المرجعي لم يُجب)
 */
function evalCondition(cond, profile, answers) {
  if (!cond) return true;
  if (cond.all) {
    const r = cond.all.map((c) => evalCondition(c, profile, answers));
    if (r.includes(false)) return false;
    return r.includes(null) ? null : true;
  }
  if (cond.any) {
    const r = cond.any.map((c) => evalCondition(c, profile, answers));
    if (r.includes(true)) return true;
    return r.includes(null) ? null : false;
  }
  let v;
  if (cond.profile) v = profile[cond.profile];
  else if (cond.answer) {
    v = answers[cond.answer];
    if (v === undefined) return null;
    if (v === SKIPPED) return false; // السؤال المرجعي نفسه متخطى ← تخطي متسلسل
  }
  if ('eq' in cond) return v === cond.eq;
  if (cond.in) return cond.in.includes(v);
  if (cond.notIn) return !cond.notIn.includes(v);
  return true;
}

/**
 * حالة كل سؤال بالترتيب:
 *  visible | skipped_na | skipped_zero | pending
 * الأسئلة التي تعتمد على سؤال تم تخطيه تُتخطى بدورها (السلسلة).
 */
function visibility(bank, profile, answers) {
  const effective = {}; // الإجابات الفعالة فقط (للأسئلة الظاهرة)
  const states = [];
  for (const q of bank.questions) {
    const c = evalCondition(q.when, profile, effective);
    let state;
    if (c === true) state = 'visible';
    else if (c === null) state = 'pending';
    else state = q.onSkip === 'zero' ? 'skipped_zero' : 'skipped_na';
    if (state === 'visible' && answers[q.id] !== undefined) effective[q.id] = answers[q.id];
    if (state.startsWith('skipped')) effective[q.id] = SKIPPED;
    states.push({ q, state, answer: state === 'visible' ? answers[q.id] : undefined });
  }
  return states;
}

/** السؤال التالي في الاستبيان الديناميكي + نسبة التقدم */
function nextQuestion(bank, profile, answers) {
  const states = visibility(bank, profile, answers);
  const relevant = states.filter((s) => s.state === 'visible' || s.state === 'pending');
  const answered = relevant.filter((s) => s.answer !== undefined).length;
  const next = states.find((s) => s.state === 'visible' && s.answer === undefined);
  const skipped = states.filter((s) => s.state.startsWith('skipped')).map((s) => ({ id: s.q.id, mode: s.state }));
  return {
    question: next ? next.q : null,
    answered,
    total: relevant.length,
    progress: relevant.length ? Math.round((answered / relevant.length) * 100) : 100,
    skipped,
    done: !next && !states.some((s) => s.state === 'pending'),
  };
}

/**
 * الأوزان المتكيفة: يُعدَّل وزن السؤال حسب ملف الشركة (القطاع، الحجم، العمل عن بعد...)
 * لتعكس المخاطر الفعلية التي تواجهها هذه الشركة تحديداً.
 */
function adjustedWeight(q, profile) {
  let w = q.weight;
  const reasons = [];
  const sensitive = ['health', 'finance', 'ecommerce'].includes(profile.sector);
  if (sensitive && (q.ref.startsWith('PR.DS') || q.ref === 'ID.AM-07')) {
    w *= 1.5; reasons.push('القطاع يتعامل مع بيانات حساسة');
  }
  if (profile.remote_work && q.ref.startsWith('PR.AA')) {
    w *= 1.25; reasons.push('وجود عمل عن بعد يرفع خطر سرقة الهوية');
  }
  if (profile.employees >= 50 && q.fn === 'GV') {
    w *= 1.25; reasons.push('حجم الشركة يتطلب حوكمة أقوى');
  }
  if (profile.card_payments && q.fn === 'DE') {
    w *= 1.2; reasons.push('المدفوعات الإلكترونية تتطلب مراقبة أعلى');
  }
  return { weight: Math.round(w * 100) / 100, reasons };
}

function optionScore(q, value) {
  const o = q.options.find((x) => x.value === value);
  return o ? o.score : undefined;
}

/** خوارزمية التقييم: درجة موزونة لكل وظيفة + درجة كلية + مستوى النضج */
function score(bank, profile, answers) {
  const states = visibility(bank, profile, answers);
  const per = {};
  for (const f of bank.functions) per[f.code] = { num: 0, den: 0, answered: 0, total: 0 };
  let num = 0; let den = 0;
  const items = [];

  for (const { q, state, answer } of states) {
    let s;
    if (state === 'skipped_zero') s = 0;
    else if (state === 'visible' && answer !== undefined) s = optionScore(q, answer);
    else continue; // غير منطبق أو لم يُجب
    if (s === null || s === undefined) continue; // خيار "غير منطبق"
    const { weight } = adjustedWeight(q, profile);
    per[q.fn].num += weight * s; per[q.fn].den += weight;
    per[q.fn].total += 1; if (state === 'visible') per[q.fn].answered += 1;
    num += weight * s; den += weight;
    items.push({ id: q.id, fn: q.fn, weight, score: s, state });
  }

  const functions = bank.functions.map((f) => ({
    code: f.code, name: f.name, en: f.en,
    score: per[f.code].den ? Math.round((per[f.code].num / per[f.code].den) * 1000) / 10 : null,
    questions: per[f.code].total,
  }));
  const overall = den ? Math.round((num / den) * 1000) / 10 : 0;
  return { overall, tier: tierFor(overall), functions, items, _num: num, _den: den };
}

/** قواعد الثغرات الحرجة المركّبة: تجمع أكثر من إجابة لاكتشاف سيناريو هجوم محدد */
const ALERT_RULES = [
  {
    id: 'credential-theft',
    test: (a, p) => a['PR-1'] && a['PR-1'] !== 'mandatory' && (p.remote_work || p.uses_cloud),
    title: 'حساباتك مكشوفة لسرقة كلمات المرور',
    detail: 'تستخدم خدمات سحابية أو عملاً عن بعد بدون MFA إلزامية. كلمة مرور واحدة مسربة تكفي للدخول إلى البريد والملفات.',
  },
  {
    id: 'ransomware',
    test: (a) => a['PR-5'] === 'none' || (a['PR-5'] && ['no', 'unsure'].includes(a['PR-6'])),
    title: 'خطر برامج الفدية بلا قدرة مضمونة على التعافي',
    detail: 'لا توجد نسخة احتياطية معزولة. في هجوم الفدية ستُشفَّر البيانات والنسخ معاً، وقد تضطر للدفع أو خسارة البيانات.',
  },
  {
    id: 'exposed-rdp',
    test: (a) => a['PR-13'] === 'no',
    title: 'وصول مباشر عن بعد مكشوف على الإنترنت',
    detail: 'الوصول المباشر (مثل RDP) بدون VPN هو أحد أشهر مداخل برامج الفدية للشركات الصغيرة.',
  },
  {
    id: 'orphan-accounts',
    test: (a) => a['PR-2'] === 'no' && a['ID-1'] === 'no',
    title: 'حسابات وأجهزة "يتيمة" غير مُدارة',
    detail: 'لا يوجد جرد للأجهزة ولا يُقطع وصول المغادرين؛ موظف سابق أو جهاز مفقود قد يبقى باباً خلفياً مفتوحاً.',
  },
  {
    id: 'card-data',
    test: (a) => a['PR-14'] === 'no',
    title: 'تخزين بيانات بطاقات الدفع',
    detail: 'تخزين بيانات البطاقات بدون امتثال PCI DSS يعرّضك لغرامات وفقدان القدرة على قبول الدفع الإلكتروني.',
  },
  {
    id: 'blind',
    test: (a) => a['DE-1'] === 'no' && ['no', undefined].includes(a['DE-2']),
    title: 'لا توجد رؤية لما يحدث في أنظمتك',
    detail: 'لا مراقبة للتنبيهات ولا سجلات محفوظة. قد يكون هناك اختراق قائم الآن دون أن تعلم.',
  },
];

function criticalAlerts(bank, profile, answers) {
  const eff = {};
  for (const s of visibility(bank, profile, answers)) if (s.answer !== undefined) eff[s.q.id] = s.answer;
  return ALERT_RULES.filter((r) => r.test(eff, profile)).map(({ id, title, detail }) => ({ id, title, detail }));
}

/**
 * محرك التوصيات:
 *  - لكل إجابة ضعيفة توصية عملية من قاعدة المعرفة
 *  - ترتيب حسب: الأولوية ثم الأثر (الوزن × الفجوة)
 *  - حساب "مكسب الدرجة المتوقع" إذا نُفذت التوصية
 *  - تصنيف إلى مكاسب سريعة وخطة 7 / 30 / 90 يوماً
 */
function recommendations(bank, profile, answers) {
  const base = score(bank, profile, answers);
  const states = visibility(bank, profile, answers);
  const unlocks = {}; // الأسئلة المتخطاة صفراً بسبب متطلب ← تُنسب للمتطلب
  for (const s of states) {
    if (s.state === 'skipped_zero' && s.q.when && s.q.when.answer) {
      (unlocks[s.q.when.answer] = unlocks[s.q.when.answer] || []).push(s.q.id);
    }
  }

  const recs = [];
  for (const { q, state, answer } of states) {
    if (state !== 'visible' || answer === undefined) continue;
    const r = q.rec[answer];
    if (!r) continue;
    const s = optionScore(q, answer) ?? 0;
    const { weight, reasons } = adjustedWeight(q, profile);
    // المكسب المتوقع: الدرجة الكلية إذا أصبح هذا السؤال كاملاً (1)
    const gain = base._den ? Math.round(((weight * (1 - s)) / base._den) * 1000) / 10 : 0;
    recs.push({
      questionId: q.id, fn: q.fn, ref: q.ref, question: q.text,
      title: r.title, action: r.action, priority: r.priority, effort: r.effort,
      cost: r.cost, days: r.days, impact: Math.round(weight * (1 - s) * 100) / 100,
      gain, weightReasons: reasons, unlocks: unlocks[q.id] || [],
    });
  }

  recs.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.impact - a.impact);
  recs.forEach((r, i) => { r.rank = i + 1; });

  const quickWins = recs.filter((r) => r.effort === 'low' && ['free', 'low'].includes(r.cost)
    && ['critical', 'high'].includes(r.priority));
  const plan = {
    week: recs.filter((r) => r.days <= 7),
    month: recs.filter((r) => r.days > 7 && r.days <= 30),
    quarter: recs.filter((r) => r.days > 30),
  };
  const sum = (arr) => Math.round(arr.reduce((t, r) => t + r.gain, 0) * 10) / 10;
  const projected = {
    afterQuickWins: Math.min(100, Math.round((base.overall + sum(quickWins)) * 10) / 10),
    afterWeek: Math.min(100, Math.round((base.overall + sum(plan.week)) * 10) / 10),
    afterMonth: Math.min(100, Math.round((base.overall + sum(plan.week) + sum(plan.month)) * 10) / 10),
  };
  return { recommendations: recs, quickWins: quickWins.map((r) => r.questionId), plan, projected };
}

/** التقرير الكامل */
function buildReport(bank, profile, answers) {
  const s = score(bank, profile, answers);
  const r = recommendations(bank, profile, answers);
  const alerts = criticalAlerts(bank, profile, answers);
  const weakest = s.functions.filter((f) => f.score !== null).sort((a, b) => a.score - b.score)[0];
  const strongest = s.functions.filter((f) => f.score !== null).sort((a, b) => b.score - a.score)[0];
  return {
    overall: s.overall, tier: s.tier, functions: s.functions,
    weakest, strongest, alerts, ...r,
  };
}

module.exports = {
  TIERS, tierFor, evalCondition, visibility, nextQuestion,
  adjustedWeight, score, criticalAlerts, recommendations, buildReport,
};
