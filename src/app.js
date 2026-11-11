/**
 * تطبيق Express
 *  /api/admin/*   لوحة الإدارة (تتطلب تسجيل دخول المدير)
 *  /api/portal/*  بوابة مسؤولي الأقسام (رابط خاص + معرّف ID)
 */
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const { openDb, loadBank, token, accessCode } = require('./db');
const { seedDemo } = require('./seed');
const engine = require('./engine');
const svc = require('./services');

const SECTORS = ['retail', 'ecommerce', 'health', 'finance', 'education', 'services', 'manufacturing', 'other'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const LEVELS = ['low', 'medium', 'high'];
const COSTS = ['free', 'low', 'medium', 'high'];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => new HttpError(400, msg);
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const int = (v, d = 0, min = 0, max = 1e6) => Math.max(min, Math.min(max, parseInt(v, 10) || d));

function createApp({ dbFile, secret, demo = true } = {}) {
  const db = openDb(dbFile);
  if (demo) seedDemo(db);
  let bank = loadBank(db);
  const reloadBank = () => { bank = loadBank(db); };

  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieSession({
    name: 'dir3_session', keys: [secret || process.env.SESSION_SECRET || 'dev-secret-change-me'],
    maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax',
  }));

  // تغليف المعالجات لالتقاط الأخطاء
  const h = (fn) => (req, res) => {
    try {
      const out = fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      if (String(e.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'تعارض في البيانات: ' + e.message });
      console.error(e);
      res.status(500).json({ error: 'خطأ داخلي في الخادم' });
    }
  };
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const must = (row, what = 'العنصر') => { if (!row) throw new HttpError(404, `${what} غير موجود`); return row; };

  // =====================================================================
  //  المصادقة — المدير
  // =====================================================================
  const admin = express.Router();
  app.post('/api/admin/login', h((req) => {
    const { username, password } = req.body || {};
    const a = one('SELECT * FROM admins WHERE username = ?', str(username, 100));
    if (!a || !bcrypt.compareSync(String(password || ''), a.password_hash)) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    req.session.adminId = a.id;
    return { id: a.id, name: a.name, username: a.username };
  }));
  app.post('/api/admin/logout', h((req) => { delete req.session.adminId; return { ok: true }; }));
  app.use('/api/admin', (req, res, next) => {
    if (!req.session.adminId || !one('SELECT id FROM admins WHERE id = ?', req.session.adminId)) {
      return res.status(401).json({ error: 'يجب تسجيل دخول المدير' });
    }
    next();
  }, admin);

  admin.get('/me', h((req) => one('SELECT id,name,username,created_at FROM admins WHERE id = ?', req.session.adminId)));
  admin.put('/me', h((req) => {
    const b = req.body || {};
    const a = one('SELECT * FROM admins WHERE id = ?', req.session.adminId);
    if (!bcrypt.compareSync(String(b.currentPassword || ''), a.password_hash)) throw bad('كلمة المرور الحالية غير صحيحة');
    const name = str(b.name, 100) || a.name;
    const username = str(b.username, 100) || a.username;
    let hash = a.password_hash;
    if (b.newPassword) {
      if (String(b.newPassword).length < 8) throw bad('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
      hash = bcrypt.hashSync(String(b.newPassword), 10);
    }
    run('UPDATE admins SET name=?, username=?, password_hash=? WHERE id=?', name, username, hash, a.id);
    return { ok: true };
  }));
  admin.get('/admins', h(() => all('SELECT id,name,username,created_at FROM admins ORDER BY id')));
  admin.post('/admins', h((req) => {
    const b = req.body || {};
    if (!str(b.username) || !str(b.name)) throw bad('الاسم واسم المستخدم مطلوبان');
    if (String(b.password || '').length < 8) throw bad('كلمة المرور 8 أحرف على الأقل');
    const id = run('INSERT INTO admins (username,name,password_hash) VALUES (?,?,?)', str(b.username, 100), str(b.name, 100),
      bcrypt.hashSync(String(b.password), 10)).lastInsertRowid;
    return { id };
  }));
  admin.delete('/admins/:id', h((req) => {
    if (+req.params.id === req.session.adminId) throw bad('لا يمكنك حذف حسابك الحالي');
    if (one('SELECT COUNT(*) n FROM admins').n <= 1) throw bad('يجب أن يبقى مدير واحد على الأقل');
    run('DELETE FROM admins WHERE id = ?', req.params.id);
    return { ok: true };
  }));

  // =====================================================================
  //  نظرة عامة وإحصائيات
  // =====================================================================
  const latestClosed = (cid) => one(`SELECT * FROM rounds WHERE company_id=? AND status='closed' ORDER BY id DESC LIMIT 1`, cid);
  const openRound = (cid) => one(`SELECT * FROM rounds WHERE company_id=? AND status='open' ORDER BY id DESC LIMIT 1`, cid);
  const roundProgress = (rid) => one(`SELECT COUNT(*) total, SUM(status='submitted') submitted, SUM(status='in_progress') in_progress
    FROM round_departments WHERE round_id=?`, rid);

  function companySummary(c) {
    const last = latestClosed(c.id);
    const open = openRound(c.id);
    const history = all(`SELECT id,title,overall_score,tier,closed_at FROM rounds WHERE company_id=? AND status='closed' ORDER BY id`, c.id);
    return {
      ...c, size: engine.sizeOf(c.employees),
      departments: one('SELECT COUNT(*) n FROM departments WHERE company_id=?', c.id).n,
      lastScore: last ? last.overall_score : null, lastTier: last ? last.tier : null, lastRoundId: last ? last.id : null,
      lastFunctions: last ? Object.fromEntries(all('SELECT function_code,score FROM function_scores WHERE round_id=?', last.id).map((x) => [x.function_code, x.score])) : {},
      openRound: open ? { id: open.id, title: open.title, ...roundProgress(open.id) } : null,
      history,
    };
  }

  admin.get('/overview', h(() => {
    const companies = all('SELECT * FROM companies ORDER BY id').map(companySummary);
    const fnAvg = bank.functions.map((f) => {
      const vals = companies.map((c) => c.lastFunctions[f.code]).filter((v) => v !== undefined);
      return { code: f.code, name: f.name, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null };
    });
    const scored = companies.filter((c) => c.lastScore !== null);
    return {
      counts: {
        companies: companies.length,
        departments: one('SELECT COUNT(*) n FROM departments').n,
        heads: one("SELECT COUNT(*) n FROM departments WHERE head_name <> ''").n,
        questions: bank.questions.filter((q) => q.active).length,
        functions: bank.functions.length,
        types: bank.types.length,
        rounds: one('SELECT COUNT(*) n FROM rounds').n,
        openRounds: one("SELECT COUNT(*) n FROM rounds WHERE status='open'").n,
        submissions: one("SELECT COUNT(*) n FROM round_departments WHERE status='submitted'").n,
        pending: one(`SELECT COUNT(*) n FROM round_departments rd JOIN rounds r ON r.id=rd.round_id
          WHERE r.status='open' AND rd.status <> 'submitted'`).n,
        recommendations: one('SELECT COUNT(*) n FROM recommendations').n,
      },
      avgScore: scored.length ? Math.round(scored.reduce((a, c) => a + c.lastScore, 0) / scored.length * 10) / 10 : null,
      bySize: engine.SIZES.map((s) => ({ ...s, count: companies.filter((c) => c.size === s.code).length })),
      byTier: engine.TIERS.map((t) => ({ tier: t.tier, name: t.name, count: scored.filter((c) => c.lastTier === t.tier).length })),
      functions: fnAvg,
      companies,
      activity: all(`SELECT rd.status, rd.submitted_at, rd.started_at, rd.respondent_name, d.name dept, c.name company, r.title round, r.id round_id
        FROM round_departments rd JOIN departments d ON d.id=rd.department_id JOIN rounds r ON r.id=rd.round_id
        JOIN companies c ON c.id=r.company_id WHERE rd.status <> 'pending'
        ORDER BY COALESCE(rd.submitted_at, rd.started_at) DESC LIMIT 8`),
      pendingList: all(`SELECT d.name dept, d.head_name, c.name company, rd.status, r.id round_id, c.id company_id
        FROM round_departments rd JOIN departments d ON d.id=rd.department_id JOIN rounds r ON r.id=rd.round_id
        JOIN companies c ON c.id=r.company_id WHERE r.status='open' AND rd.status <> 'submitted'`),
    };
  }));

  // =====================================================================
  //  الشركات
  // =====================================================================
  function companyFields(b) {
    if (!str(b.name)) throw bad('اسم الشركة مطلوب');
    return [str(b.name, 200), SECTORS.includes(b.sector) ? b.sector : 'other', int(b.employees, 1, 1, 249),
      str(b.city, 100), str(b.address, 300), str(b.phone, 50), str(b.email, 200), str(b.website, 300), str(b.description, 2000),
      b.uses_cloud ? 1 : 0, b.remote_work ? 1 : 0, b.card_payments ? 1 : 0, b.has_website ? 1 : 0];
  }
  admin.get('/companies', h(() => all('SELECT * FROM companies ORDER BY id').map(companySummary)));
  admin.post('/companies', h((req) => {
    const id = run(`INSERT INTO companies (name,sector,employees,city,address,phone,email,website,description,
      uses_cloud,remote_work,card_payments,has_website) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...companyFields(req.body || {})).lastInsertRowid;
    return { id };
  }));
  admin.get('/companies/:id', h((req) => {
    const c = must(one('SELECT * FROM companies WHERE id=?', req.params.id), 'الشركة');
    const departments = all(`SELECT d.*, t.name type_name FROM departments d LEFT JOIN department_types t ON t.id=d.type_id
      WHERE d.company_id=? ORDER BY d.id`, c.id).map((d) => ({
      ...d, questions: engine.bankFor(bank, svc.profileOf(c), d.type_id).questions.length,
    }));
    const rounds = all('SELECT * FROM rounds WHERE company_id=? ORDER BY id DESC', c.id).map((r) => ({ ...r, ...roundProgress(r.id) }));
    return { ...companySummary(c), departmentsList: departments, rounds, profile: svc.profileOf(c) };
  }));
  admin.put('/companies/:id', h((req) => {
    must(one('SELECT id FROM companies WHERE id=?', req.params.id), 'الشركة');
    run(`UPDATE companies SET name=?,sector=?,employees=?,city=?,address=?,phone=?,email=?,website=?,description=?,
      uses_cloud=?,remote_work=?,card_payments=?,has_website=? WHERE id=?`, ...companyFields(req.body || {}), req.params.id);
    return { ok: true };
  }));
  admin.delete('/companies/:id', h((req) => { run('DELETE FROM companies WHERE id=?', req.params.id); return { ok: true }; }));

  // =====================================================================
  //  الأقسام ومسؤولوها
  // =====================================================================
  function deptFields(b) {
    if (!str(b.name)) throw bad('اسم القسم مطلوب');
    if (!str(b.head_name)) throw bad('اسم المسؤول عن القسم مطلوب');
    const typeId = b.type_id ? int(b.type_id) : null;
    if (typeId && !bank.types.some((t) => t.id === typeId)) throw bad('نوع القسم غير موجود');
    return [typeId, str(b.name, 200), str(b.description, 1000), int(b.employees, 0, 0, 100000),
      str(b.head_name, 200), str(b.head_title, 200), str(b.head_email, 200), str(b.head_phone, 50)];
  }
  admin.post('/companies/:id/departments', h((req) => {
    const c = must(one('SELECT id FROM companies WHERE id=?', req.params.id), 'الشركة');
    const b = req.body || {};
    const code = str(b.access_code, 30) || accessCode();
    const id = run(`INSERT INTO departments (company_id,type_id,name,description,employees,head_name,head_title,head_email,head_phone,
      access_code,link_token) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, c.id, ...deptFields(b), code, token()).lastInsertRowid;
    // إضافة القسم الجديد إلى الجولة المفتوحة إن وجدت
    const open = openRound(c.id);
    if (open) run('INSERT OR IGNORE INTO round_departments (round_id, department_id) VALUES (?,?)', open.id, id);
    return { id };
  }));
  admin.put('/departments/:id', h((req) => {
    const d = must(one('SELECT * FROM departments WHERE id=?', req.params.id), 'القسم');
    const b = req.body || {};
    const code = str(b.access_code, 30) || d.access_code;
    run(`UPDATE departments SET type_id=?,name=?,description=?,employees=?,head_name=?,head_title=?,head_email=?,head_phone=?,access_code=?
      WHERE id=?`, ...deptFields(b), code, d.id);
    return { ok: true };
  }));
  admin.post('/departments/:id/regenerate', h((req) => {
    const d = must(one('SELECT * FROM departments WHERE id=?', req.params.id), 'القسم');
    const what = (req.body || {}).what || 'both';
    const code = ['code', 'both'].includes(what) ? accessCode() : d.access_code;
    const link = ['link', 'both'].includes(what) ? token() : d.link_token;
    run('UPDATE departments SET access_code=?, link_token=? WHERE id=?', code, link, d.id);
    return { access_code: code, link_token: link };
  }));
  admin.delete('/departments/:id', h((req) => { run('DELETE FROM departments WHERE id=?', req.params.id); return { ok: true }; }));

  // =====================================================================
  //  جولات التقييم والتقارير
  // =====================================================================
  admin.post('/companies/:id/rounds', h((req) => {
    const c = must(one('SELECT id FROM companies WHERE id=?', req.params.id), 'الشركة');
    if (openRound(c.id)) throw bad('توجد جولة مفتوحة لهذه الشركة؛ أغلقها أولاً');
    if (!one('SELECT COUNT(*) n FROM departments WHERE company_id=?', c.id).n) throw bad('أضف قسماً واحداً على الأقل قبل بدء الجولة');
    const title = str((req.body || {}).title, 200) || `جولة تقييم ${new Date().toISOString().slice(0, 10)}`;
    return { id: svc.createRound(db, c.id, title) };
  }));
  admin.get('/rounds/:id/report', h((req) => {
    const rep = must(svc.roundReport(db, bank, req.params.id), 'الجولة');
    const c = one('SELECT id,name FROM companies WHERE id=?', rep.round.companyId);
    return { ...rep, company: c };
  }));
  admin.get('/rounds/:id/departments/:deptId', h((req) => {
    const r = must(one('SELECT * FROM rounds WHERE id=?', req.params.id), 'الجولة');
    const rd = must(one(`SELECT rd.*, d.name, d.type_id, d.head_name, d.head_title FROM round_departments rd
      JOIN departments d ON d.id=rd.department_id WHERE rd.round_id=? AND rd.department_id=?`, r.id, req.params.deptId), 'القسم');
    const profile = JSON.parse(r.profile_snapshot);
    const sub = engine.bankFor(bank, profile, rd.type_id);
    const answers = svc.answersOf(db, rd.id);
    const sc = engine.score(sub, profile, answers);
    const recs = engine.recommendations(sub, profile, answers);
    return {
      department: { id: rd.department_id, name: rd.name, head: rd.head_name, title: rd.head_title, status: rd.status,
        respondent: rd.respondent_name, submittedAt: rd.submitted_at },
      overall: sc.overall, tier: sc.tier, functions: sc.functions, recommendations: recs.recommendations,
      answers: engine.visibility(sub, profile, answers).map((s) => ({
        id: s.q.id, fn: s.q.fn, text: s.q.text, state: s.state,
        answer: s.answer ? (s.q.options.find((o) => o.value === s.answer) || {}).label : null,
      })),
    };
  }));
  admin.post('/rounds/:id/close', h((req) => {
    const r = must(one('SELECT * FROM rounds WHERE id=?', req.params.id), 'الجولة');
    if (!one("SELECT COUNT(*) n FROM round_departments WHERE round_id=? AND status='submitted'", r.id).n) throw bad('لا يوجد أي قسم سلّم إجاباته بعد');
    const rep = svc.closeRound(db, bank, r.id);
    return { ok: true, overall: rep.overall, tier: rep.tier };
  }));
  admin.post('/rounds/:id/reopen', h((req) => {
    const r = must(one('SELECT * FROM rounds WHERE id=?', req.params.id), 'الجولة');
    if (openRound(r.company_id)) throw bad('توجد جولة مفتوحة أخرى لهذه الشركة');
    run("UPDATE rounds SET status='open', closed_at=NULL WHERE id=?", r.id);
    return { ok: true };
  }));
  admin.delete('/rounds/:id', h((req) => { run('DELETE FROM rounds WHERE id=?', req.params.id); return { ok: true }; }));
  admin.post('/round-departments/:id/reopen', h((req) => {
    const rd = must(one('SELECT rd.*, r.status rstatus FROM round_departments rd JOIN rounds r ON r.id=rd.round_id WHERE rd.id=?', req.params.id));
    if (rd.rstatus !== 'open') throw bad('الجولة مغلقة؛ أعد فتحها أولاً');
    run("UPDATE round_departments SET status='in_progress', submitted_at=NULL WHERE id=?", rd.id);
    return { ok: true };
  }));

  // =====================================================================
  //  الإطار: المحاور، أنواع الأقسام، المعايير (الأسئلة)
  // =====================================================================
  admin.get('/framework', h(() => {
    const usage = Object.fromEntries(all('SELECT question_id, COUNT(*) n FROM answers GROUP BY question_id').map((x) => [x.question_id, x.n]));
    return {
      functions: bank.functions.map((f) => ({ ...f, questions: bank.questions.filter((q) => q.fn === f.code).length })),
      types: bank.types.map((t) => ({
        ...t, departments: one('SELECT COUNT(*) n FROM departments WHERE type_id=?', t.id).n,
        questions: bank.questions.filter((q) => q.active && (!q.targets.length || q.targets.includes(t.id))).length,
      })),
      sizes: engine.SIZES,
      questions: bank.questions.map((q) => ({ ...q, usage: usage[q.id] || 0 })),
    };
  }));

  admin.post('/functions', h((req) => {
    const b = req.body || {};
    const code = str(b.code, 10).toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(code)) throw bad('رمز المحور: 2–6 أحرف إنجليزية كبيرة');
    if (!str(b.name)) throw bad('اسم المحور مطلوب');
    run('INSERT INTO functions (code,name,name_en,goal,sort) VALUES (?,?,?,?,?)', code, str(b.name, 100), str(b.name_en, 100),
      str(b.goal, 500), int(b.sort, bank.functions.length + 1));
    reloadBank(); return { code };
  }));
  admin.put('/functions/:code', h((req) => {
    const b = req.body || {};
    must(one('SELECT code FROM functions WHERE code=?', req.params.code), 'المحور');
    if (!str(b.name)) throw bad('اسم المحور مطلوب');
    run('UPDATE functions SET name=?, name_en=?, goal=?, sort=? WHERE code=?', str(b.name, 100), str(b.name_en, 100), str(b.goal, 500), int(b.sort), req.params.code);
    reloadBank(); return { ok: true };
  }));
  admin.delete('/functions/:code', h((req) => {
    if (one('SELECT COUNT(*) n FROM questions WHERE function_code=?', req.params.code).n) throw bad('لا يمكن حذف محور يحتوي أسئلة؛ انقل الأسئلة أو احذفها أولاً');
    run('DELETE FROM functions WHERE code=?', req.params.code);
    reloadBank(); return { ok: true };
  }));

  admin.post('/types', h((req) => {
    const b = req.body || {};
    if (!str(b.name)) throw bad('اسم نوع القسم مطلوب');
    const id = run('INSERT INTO department_types (name,description,sort) VALUES (?,?,?)', str(b.name, 100), str(b.description, 500), bank.types.length + 1).lastInsertRowid;
    // الأسئلة المختارة لهذا النوع الجديد
    for (const qid of b.questions || []) {
      const q = bank.questions.find((x) => x.id === qid);
      if (q && q.targets.length) run('INSERT OR IGNORE INTO question_targets (question_id,type_id) VALUES (?,?)', qid, id);
    }
    reloadBank(); return { id };
  }));
  admin.put('/types/:id', h((req) => {
    const b = req.body || {};
    must(one('SELECT id FROM department_types WHERE id=?', req.params.id), 'نوع القسم');
    if (!str(b.name)) throw bad('اسم نوع القسم مطلوب');
    run('UPDATE department_types SET name=?, description=? WHERE id=?', str(b.name, 100), str(b.description, 500), req.params.id);
    if (Array.isArray(b.questions)) {
      // تحديث الأسئلة الموجهة لهذا النوع (الأسئلة العامة تبقى عامة لكل الأقسام)
      const tid = +req.params.id;
      const wanted = new Set(b.questions);
      const orphans = bank.questions.filter((q) => q.targets.length === 1 && q.targets[0] === tid && !wanted.has(q.id));
      if (orphans.length) throw bad(`هذه الأسئلة موجهة لهذا النوع فقط وستصبح بلا قسم: ${orphans.map((q) => q.id).join('، ')} — عدّلها من محرر المعايير`);
      db.transaction(() => {
        run('DELETE FROM question_targets WHERE type_id=?', tid);
        for (const qid of wanted) {
          const q = bank.questions.find((x) => x.id === qid);
          if (q && q.targets.length) run('INSERT OR IGNORE INTO question_targets (question_id,type_id) VALUES (?,?)', qid, tid);
        }
      })();
    }
    reloadBank(); return { ok: true };
  }));
  admin.delete('/types/:id', h((req) => {
    if (one('SELECT COUNT(*) n FROM departments WHERE type_id=?', req.params.id).n) throw bad('يوجد أقسام من هذا النوع؛ غيّر نوعها أولاً');
    run('DELETE FROM department_types WHERE id=?', req.params.id);
    reloadBank(); return { ok: true };
  }));

  function questionPayload(b, isNew) {
    const id = str(b.id, 20).toUpperCase();
    if (isNew && !/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(id)) throw bad('رمز السؤال: أحرف إنجليزية وأرقام وشرطة (مثل PR-20)');
    if (!bank.functions.some((f) => f.code === b.fn)) throw bad('اختر المحور');
    if (!str(b.text)) throw bad('نص السؤال مطلوب');
    const weight = Number(b.weight);
    if (!(weight > 0 && weight <= 10)) throw bad('الوزن بين 0.5 و 10');
    const opts = Array.isArray(b.options) ? b.options : [];
    if (opts.length < 2) throw bad('أضف خيارين على الأقل');
    const seen = new Set();
    opts.forEach((o, i) => {
      o.value = str(o.value, 40) || `opt${i + 1}`;
      if (seen.has(o.value)) throw bad(`قيمة الخيار مكررة: ${o.value}`);
      seen.add(o.value);
      if (!str(o.label)) throw bad('نص كل خيار مطلوب');
      o.score = o.score === null || o.score === '' || o.score === undefined ? null : Number(o.score);
      if (o.score !== null && !(o.score >= 0 && o.score <= 1)) throw bad('درجة الخيار بين 0 و 1 (أو فارغة = غير منطبق)');
      if (o.rec && str(o.rec.title)) {
        if (!str(o.rec.action)) throw bad(`نص التوصية للخيار "${o.label}" مطلوب`);
        o.rec = {
          title: str(o.rec.title, 200), action: str(o.rec.action, 2000),
          priority: PRIORITIES.includes(o.rec.priority) ? o.rec.priority : 'medium',
          effort: LEVELS.includes(o.rec.effort) ? o.rec.effort : 'low',
          cost: COSTS.includes(o.rec.cost) ? o.rec.cost : 'free', days: int(o.rec.days, 30, 1, 365),
        };
      } else o.rec = null;
    });
    let when = null;
    if (b.when && b.when.answer) {
      const ref = bank.questions.find((q) => q.id === b.when.answer);
      if (!ref) throw bad('السؤال المرجعي للشرط غير موجود');
      if (ref.id === id) throw bad('لا يمكن أن يعتمد السؤال على نفسه');
      const values = (b.when.values || []).filter((v) => ref.options.some((o) => o.value === v));
      if (!values.length) throw bad('اختر قيمة واحدة على الأقل للشرط');
      when = { answer: ref.id, [b.when.op === 'notIn' ? 'notIn' : 'in']: values };
    } else if (b.when && b.when.profile) {
      if (!['uses_cloud', 'remote_work', 'card_payments', 'has_website'].includes(b.when.profile)) throw bad('شرط ملف الشركة غير صالح');
      when = { profile: b.when.profile, eq: true };
    }
    const sizes = (b.sizes || []).filter((s) => engine.SIZES.some((x) => x.code === s));
    const targets = (b.targets || []).map(Number).filter((t) => bank.types.some((x) => x.id === t));
    return {
      id, fn: b.fn, ref: str(b.ref, 30), text: str(b.text, 1000), help: str(b.help, 1000) || null, weight,
      when, onSkip: when ? (b.onSkip === 'zero' ? 'zero' : 'na') : null,
      sizes: sizes.length === engine.SIZES.length ? [] : sizes, targets, active: b.active === false ? 0 : 1, options: opts,
    };
  }
  function writeQuestionChildren(q) {
    run('DELETE FROM options WHERE question_id=?', q.id);
    run('DELETE FROM recommendations WHERE question_id=?', q.id);
    run('DELETE FROM question_targets WHERE question_id=?', q.id);
    q.options.forEach((o, i) => {
      run('INSERT INTO options (question_id,value,label,score,sort) VALUES (?,?,?,?,?)', q.id, o.value, str(o.label, 300), o.score, i + 1);
      if (o.rec) run(`INSERT INTO recommendations (question_id,option_value,title,action,priority,effort,cost,days)
        VALUES (?,?,?,?,?,?,?,?)`, q.id, o.value, o.rec.title, o.rec.action, o.rec.priority, o.rec.effort, o.rec.cost, o.rec.days);
    });
    for (const t of q.targets) run('INSERT INTO question_targets (question_id,type_id) VALUES (?,?)', q.id, t);
  }
  admin.post('/questions', h((req) => {
    const q = questionPayload(req.body || {}, true);
    if (one('SELECT id FROM questions WHERE id=?', q.id)) throw bad('رمز السؤال مستخدم مسبقاً');
    const sort = (one('SELECT MAX(sort) m FROM questions WHERE function_code=?', q.fn).m || one('SELECT MAX(sort) m FROM questions').m || 0) + 0.5;
    db.transaction(() => {
      run(`INSERT INTO questions (id,function_code,nist_ref,text,help,weight,condition_json,skip_mode,sizes_json,active,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, q.id, q.fn, q.ref, q.text, q.help, q.weight, q.when ? JSON.stringify(q.when) : null,
      q.onSkip, q.sizes.length ? JSON.stringify(q.sizes) : null, q.active, sort);
      writeQuestionChildren(q);
    })();
    reloadBank(); return { id: q.id };
  }));
  admin.put('/questions/:id', h((req) => {
    must(one('SELECT id FROM questions WHERE id=?', req.params.id), 'السؤال');
    const q = questionPayload({ ...(req.body || {}), id: req.params.id }, false);
    db.transaction(() => {
      run(`UPDATE questions SET function_code=?,nist_ref=?,text=?,help=?,weight=?,condition_json=?,skip_mode=?,sizes_json=?,active=?
        WHERE id=?`, q.fn, q.ref, q.text, q.help, q.weight, q.when ? JSON.stringify(q.when) : null, q.onSkip,
      q.sizes.length ? JSON.stringify(q.sizes) : null, q.active, q.id);
      writeQuestionChildren(q);
    })();
    reloadBank(); return { ok: true };
  }));
  admin.delete('/questions/:id', h((req) => {
    must(one('SELECT id FROM questions WHERE id=?', req.params.id), 'السؤال');
    const used = one('SELECT COUNT(*) n FROM answers WHERE question_id=?', req.params.id).n;
    const dependents = bank.questions.filter((q) => q.when && q.when.answer === req.params.id).map((q) => q.id);
    if (dependents.length) throw bad(`أسئلة أخرى تعتمد على هذا السؤال: ${dependents.join('، ')}`);
    if (used) { run('UPDATE questions SET active=0 WHERE id=?', req.params.id); reloadBank(); return { ok: true, archived: true }; }
    run('DELETE FROM questions WHERE id=?', req.params.id);
    reloadBank(); return { ok: true, archived: false };
  }));

  // =====================================================================
  //  بوابة مسؤول القسم: رابط خاص + معرّف (ID)
  // =====================================================================
  const failures = new Map(); // حماية بسيطة من التخمين: 5 محاولات خاطئة كل 10 دقائق لكل رابط
  const deptByToken = (t) => one(`SELECT d.*, c.name company_name, t.name type_name FROM departments d
    JOIN companies c ON c.id=d.company_id LEFT JOIN department_types t ON t.id=d.type_id WHERE d.link_token=?`, t);

  app.get('/api/portal/link/:token', h((req) => {
    const d = must(deptByToken(req.params.token), 'الرابط');
    return { company: d.company_name, department: d.name };
  }));
  app.post('/api/portal/link/:token/login', h((req) => {
    const d = must(deptByToken(req.params.token), 'الرابط');
    const f = failures.get(d.id) || { n: 0, t: Date.now() };
    if (Date.now() - f.t > 10 * 60 * 1000) { f.n = 0; f.t = Date.now(); }
    if (f.n >= 5) throw new HttpError(429, 'محاولات كثيرة خاطئة؛ حاول بعد 10 دقائق');
    const code = str((req.body || {}).code, 30).toUpperCase();
    if (code !== d.access_code.toUpperCase()) { f.n += 1; failures.set(d.id, f); throw new HttpError(401, 'المعرّف غير صحيح'); }
    failures.delete(d.id);
    req.session.deptId = d.id; req.session.deptToken = d.link_token;
    return { ok: true };
  }));
  app.post('/api/portal/logout', h((req) => { delete req.session.deptId; delete req.session.deptToken; return { ok: true }; }));

  function portalContext(req) {
    const d = req.session.deptId && one(`SELECT d.*, c.name company_name, c.id cid, t.name type_name FROM departments d
      JOIN companies c ON c.id=d.company_id LEFT JOIN department_types t ON t.id=d.type_id WHERE d.id=?`, req.session.deptId);
    if (!d || d.link_token !== req.session.deptToken) throw new HttpError(401, 'انتهت الجلسة؛ افتح الرابط وأدخل المعرّف');
    const r = openRound(d.cid);
    const rd = r && one('SELECT * FROM round_departments WHERE round_id=? AND department_id=?', r.id, d.id);
    const profile = r ? JSON.parse(r.profile_snapshot) : null;
    const sub = r ? engine.bankFor(bank, profile, d.type_id) : null;
    return { d, r, rd, profile, sub };
  }
  function portalState(ctx, focus) {
    const { d, r, rd, profile, sub } = ctx;
    const base = {
      head: { name: d.head_name, title: d.head_title }, department: d.name, type: d.type_name, company: d.company_name,
      round: r ? { id: r.id, title: r.title } : null, status: rd ? rd.status : null,
    };
    if (!r || !rd) return base;
    const answers = svc.answersOf(db, rd.id);
    const n = engine.nextQuestion(sub, profile, answers);
    const history = engine.visibility(sub, profile, answers).filter((s) => s.state === 'visible' && s.answer !== undefined).map((s) => s.q.id);
    let q = n.question; let current = null;
    if (focus) { const f = sub.questions.find((x) => x.id === focus); if (f) { q = f; current = answers[f.id] || null; } }
    const out = { ...base, progress: n.progress, answered: n.answered, total: n.total, done: n.done, skipped: n.skipped.length, history, currentAnswer: current };
    if (q) {
      out.question = {
        id: q.id, fn: q.fn, ref: q.ref, text: q.text, help: q.help, weight: engine.adjustedWeight(q, profile).weight,
        functionName: (bank.functions.find((f) => f.code === q.fn) || {}).name,
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      };
    }
    out.functions = bank.functions.filter((f) => sub.questions.some((x) => x.fn === f.code)).map((f) => ({ code: f.code, name: f.name }));
    if (rd.status === 'submitted') {
      const sc = engine.score(sub, profile, answers);
      out.summary = { overall: sc.overall, tier: sc.tier, functions: sc.functions.filter((f) => f.score !== null),
        top: engine.recommendations(sub, profile, answers).recommendations.slice(0, 3) };
    }
    return out;
  }
  app.get('/api/portal/me', h((req) => portalState(portalContext(req), req.query.question)));
  app.post('/api/portal/answers', h((req) => {
    const ctx = portalContext(req);
    if (!ctx.rd) throw bad('لا توجد جولة تقييم مفتوحة');
    if (ctx.rd.status === 'submitted') throw new HttpError(409, 'تم تسليم الإجابات مسبقاً');
    const { questionId, value } = req.body || {};
    const q = ctx.sub.questions.find((x) => x.id === questionId);
    if (!q) throw bad('هذا السؤال غير مخصص لقسمك');
    if (!q.options.some((o) => o.value === value)) throw bad('خيار غير صالح');
    const vis = engine.visibility(ctx.sub, ctx.profile, svc.answersOf(db, ctx.rd.id)).find((s) => s.q.id === questionId);
    if (vis.state !== 'visible') throw bad('هذا السؤال غير منطبق حسب إجاباتك السابقة');
    db.transaction(() => {
      run(`INSERT INTO answers (round_department_id,question_id,option_value) VALUES (?,?,?)
        ON CONFLICT(round_department_id,question_id) DO UPDATE SET option_value=excluded.option_value, answered_at=datetime('now')`, ctx.rd.id, questionId, value);
      if (ctx.rd.status === 'pending') {
        run(`UPDATE round_departments SET status='in_progress', started_at=datetime('now'), respondent_name=?, respondent_title=? WHERE id=?`,
          ctx.d.head_name, ctx.d.head_title, ctx.rd.id);
      }
    })();
    return portalState(portalContext(req));
  }));
  app.post('/api/portal/submit', h((req) => {
    const ctx = portalContext(req);
    if (!ctx.rd) throw bad('لا توجد جولة تقييم مفتوحة');
    const n = engine.nextQuestion(ctx.sub, ctx.profile, svc.answersOf(db, ctx.rd.id));
    if (!n.done) throw bad('لم تكتمل جميع الأسئلة بعد');
    run(`UPDATE round_departments SET status='submitted', submitted_at=datetime('now'), respondent_name=?, respondent_title=? WHERE id=?`,
      ctx.d.head_name, ctx.d.head_title, ctx.rd.id);
    return portalState(portalContext(req));
  }));

  // =====================================================================
  //  الواجهة الأمامية
  // =====================================================================
  app.use('/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
