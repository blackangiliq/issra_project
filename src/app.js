/**
 * تطبيق Express — واجهة برمجة التطبيقات (REST API) + تقديم الواجهة الأمامية
 */
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { openDb, loadBank } = require('./db');
const engine = require('./engine');

const SECTORS = ['retail', 'ecommerce', 'health', 'finance', 'education', 'services', 'manufacturing', 'other'];

function createApp({ dbFile, secret } = {}) {
  const db = openDb(dbFile);
  const bank = loadBank(db);
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieSession({
    name: 'csra_session',
    keys: [secret || process.env.SESSION_SECRET || 'dev-secret-change-me'],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
  }));

  // ---------- أدوات مساعدة ----------
  const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    next();
  };
  const getCompany = (userId) => db.prepare('SELECT * FROM companies WHERE user_id = ?').get(userId);
  const toProfile = (c) => ({
    name: c.name, sector: c.sector, employees: c.employees,
    uses_cloud: !!c.uses_cloud, remote_work: !!c.remote_work,
    card_payments: !!c.card_payments, has_website: !!c.has_website,
  });
  const getAssessment = (req, res) => {
    const a = db.prepare(`SELECT a.* FROM assessments a JOIN companies c ON c.id = a.company_id
      WHERE a.id = ? AND c.user_id = ?`).get(req.params.id, req.session.userId);
    if (!a) { res.status(404).json({ error: 'التقييم غير موجود' }); return null; }
    a.profile = JSON.parse(a.profile_snapshot);
    return a;
  };
  const getAnswers = (id) => Object.fromEntries(
    db.prepare('SELECT question_id, option_value FROM answers WHERE assessment_id = ?')
      .all(id).map((r) => [r.question_id, r.option_value]));
  const publicQuestion = (q, profile) => q && ({
    id: q.id, fn: q.fn, ref: q.ref, text: q.text, help: q.help,
    weight: engine.adjustedWeight(q, profile).weight,
    functionName: bank.functions.find((f) => f.code === q.fn).name,
    options: q.options.map((o) => ({ value: o.value, label: o.label })),
  });
  const statePayload = (a) => {
    const answers = getAnswers(a.id);
    const n = engine.nextQuestion(bank, a.profile, answers);
    // الأسئلة المجابة الظاهرة بالترتيب (للرجوع للخلف)
    const history = engine.visibility(bank, a.profile, answers)
      .filter((s) => s.state === 'visible' && s.answer !== undefined).map((s) => s.q.id);
    return {
      assessmentId: a.id, status: a.status, progress: n.progress, answered: n.answered,
      total: n.total, done: n.done, skipped: n.skipped, history,
      question: publicQuestion(n.question, a.profile),
    };
  };

  // ---------- المصادقة ----------
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    if (String(password).length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'البريد مسجل مسبقاً' });
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)')
      .run(name.trim(), email.toLowerCase(), hash);
    req.session.userId = info.lastInsertRowid;
    res.status(201).json({ id: info.lastInsertRowid, name, email: email.toLowerCase() });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
    if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }
    req.session.userId = u.id;
    res.json({ id: u.id, name: u.name, email: u.email });
  });

  app.post('/api/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const u = db.prepare('SELECT id,name,email FROM users WHERE id = ?').get(req.session.userId);
    if (!u) { req.session = null; return res.status(401).json({ error: 'الجلسة منتهية' }); }
    const c = getCompany(u.id);
    res.json({ ...u, company: c ? { id: c.id, ...toProfile(c) } : null });
  });

  // ---------- ملف الشركة ----------
  app.put('/api/company', requireAuth, (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'اسم الشركة مطلوب' });
    const sector = SECTORS.includes(b.sector) ? b.sector : 'other';
    const employees = Math.max(1, Math.min(100000, parseInt(b.employees, 10) || 1));
    const flags = ['uses_cloud', 'remote_work', 'card_payments', 'has_website'].map((k) => (b[k] ? 1 : 0));
    const existing = getCompany(req.session.userId);
    if (existing) {
      db.prepare(`UPDATE companies SET name=?, sector=?, employees=?, uses_cloud=?, remote_work=?,
        card_payments=?, has_website=?, updated_at=datetime('now') WHERE id=?`)
        .run(String(b.name).trim(), sector, employees, ...flags, existing.id);
    } else {
      db.prepare(`INSERT INTO companies (user_id,name,sector,employees,uses_cloud,remote_work,card_payments,has_website)
        VALUES (?,?,?,?,?,?,?,?)`).run(req.session.userId, String(b.name).trim(), sector, employees, ...flags);
    }
    const c = getCompany(req.session.userId);
    res.json({ id: c.id, ...toProfile(c) });
  });

  // ---------- بيانات الإطار ----------
  app.get('/api/framework', (req, res) => {
    res.json({
      functions: bank.functions,
      tiers: engine.TIERS,
      questionCount: bank.questions.length,
      byFunction: bank.functions.map((f) => ({
        code: f.code, count: bank.questions.filter((q) => q.fn === f.code).length,
      })),
    });
  });

  // ---------- التقييمات ----------
  app.get('/api/assessments', requireAuth, (req, res) => {
    const c = getCompany(req.session.userId);
    if (!c) return res.json([]);
    const rows = db.prepare(`SELECT id,status,overall_score,tier,started_at,completed_at
      FROM assessments WHERE company_id = ? ORDER BY id DESC`).all(c.id);
    const fs = db.prepare('SELECT function_code, score FROM function_scores WHERE assessment_id = ?');
    res.json(rows.map((r) => ({
      ...r, functions: Object.fromEntries(fs.all(r.id).map((x) => [x.function_code, x.score])),
    })));
  });

  app.post('/api/assessments', requireAuth, (req, res) => {
    const c = getCompany(req.session.userId);
    if (!c) return res.status(400).json({ error: 'أكمل ملف الشركة أولاً' });
    const open = db.prepare("SELECT id FROM assessments WHERE company_id=? AND status='in_progress'").get(c.id);
    if (open) return res.json({ id: open.id, resumed: true });
    const info = db.prepare('INSERT INTO assessments (company_id, profile_snapshot) VALUES (?,?)')
      .run(c.id, JSON.stringify(toProfile(c)));
    res.status(201).json({ id: info.lastInsertRowid, resumed: false });
  });

  app.get('/api/assessments/:id/state', requireAuth, (req, res) => {
    const a = getAssessment(req, res); if (!a) return;
    const payload = statePayload(a);
    // إعادة فتح سؤال سابق للتعديل
    if (req.query.question) {
      const q = bank.questions.find((x) => x.id === req.query.question);
      if (q) {
        payload.question = publicQuestion(q, a.profile);
        payload.currentAnswer = getAnswers(a.id)[q.id] || null;
      }
    }
    res.json(payload);
  });

  app.post('/api/assessments/:id/answers', requireAuth, (req, res) => {
    const a = getAssessment(req, res); if (!a) return;
    if (a.status === 'completed') return res.status(409).json({ error: 'التقييم مكتمل ولا يمكن تعديله' });
    const { questionId, value } = req.body || {};
    const q = bank.questions.find((x) => x.id === questionId);
    if (!q) return res.status(400).json({ error: 'سؤال غير معروف' });
    if (!q.options.some((o) => o.value === value)) return res.status(400).json({ error: 'خيار غير صالح' });
    const vis = engine.visibility(bank, a.profile, getAnswers(a.id)).find((s) => s.q.id === questionId);
    if (vis.state !== 'visible') return res.status(400).json({ error: 'هذا السؤال غير منطبق حسب إجاباتك السابقة' });
    db.prepare(`INSERT INTO answers (assessment_id,question_id,option_value) VALUES (?,?,?)
      ON CONFLICT(assessment_id,question_id) DO UPDATE SET option_value=excluded.option_value, answered_at=datetime('now')`)
      .run(a.id, questionId, value);
    res.json(statePayload(a));
  });

  app.post('/api/assessments/:id/complete', requireAuth, (req, res) => {
    const a = getAssessment(req, res); if (!a) return;
    const answers = getAnswers(a.id);
    const n = engine.nextQuestion(bank, a.profile, answers);
    if (!n.done) return res.status(400).json({ error: 'لم تكتمل جميع الأسئلة بعد', next: n.question && n.question.id });
    const s = engine.score(bank, a.profile, answers);
    db.transaction(() => {
      db.prepare(`UPDATE assessments SET status='completed', overall_score=?, tier=?, completed_at=datetime('now')
        WHERE id=?`).run(s.overall, s.tier.tier, a.id);
      const ins = db.prepare('INSERT OR REPLACE INTO function_scores (assessment_id,function_code,score) VALUES (?,?,?)');
      for (const f of s.functions) if (f.score !== null) ins.run(a.id, f.code, f.score);
    })();
    res.json({ ok: true, overall: s.overall, tier: s.tier });
  });

  app.get('/api/assessments/:id/report', requireAuth, (req, res) => {
    const a = getAssessment(req, res); if (!a) return;
    if (a.status !== 'completed') return res.status(400).json({ error: 'التقييم لم يكتمل بعد' });
    const answers = getAnswers(a.id);
    const report = engine.buildReport(bank, a.profile, answers);
    // المقارنة مع التقييم السابق (تتبع التقدم)
    const prev = db.prepare(`SELECT id, overall_score, completed_at FROM assessments
      WHERE company_id=? AND status='completed' AND id < ? ORDER BY id DESC LIMIT 1`).get(a.company_id, a.id);
    let comparison = null;
    if (prev) {
      const pf = Object.fromEntries(db.prepare('SELECT function_code, score FROM function_scores WHERE assessment_id=?')
        .all(prev.id).map((x) => [x.function_code, x.score]));
      comparison = {
        previousId: prev.id, previousDate: prev.completed_at, previousOverall: prev.overall_score,
        delta: Math.round((report.overall - prev.overall_score) * 10) / 10,
        functions: report.functions.map((f) => ({
          code: f.code, previous: pf[f.code] ?? null,
          delta: f.score !== null && pf[f.code] !== undefined ? Math.round((f.score - pf[f.code]) * 10) / 10 : null,
        })),
      };
    }
    const answerList = engine.visibility(bank, a.profile, answers).map((s) => ({
      id: s.q.id, fn: s.q.fn, text: s.q.text, state: s.state,
      answer: s.answer ? s.q.options.find((o) => o.value === s.answer).label : null,
    }));
    res.json({
      id: a.id, completedAt: a.completed_at, profile: a.profile,
      ...report, comparison, answers: answerList,
    });
  });

  app.delete('/api/assessments/:id', requireAuth, (req, res) => {
    const a = getAssessment(req, res); if (!a) return;
    db.prepare('DELETE FROM assessments WHERE id = ?').run(a.id);
    res.json({ ok: true });
  });

  // ---------- الواجهة الأمامية ----------
  app.use('/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
