/**
 * خدمات مشتركة بين واجهة الإدارة وبوابة الأقسام والبيانات التجريبية
 */
const engine = require('./engine');

function profileOf(c) {
  return {
    name: c.name, sector: c.sector, employees: c.employees, size: engine.sizeOf(c.employees),
    uses_cloud: !!c.uses_cloud, remote_work: !!c.remote_work,
    card_payments: !!c.card_payments, has_website: !!c.has_website,
  };
}

function answersOf(db, rdId) {
  return Object.fromEntries(db.prepare('SELECT question_id, option_value FROM answers WHERE round_department_id = ?')
    .all(rdId).map((r) => [r.question_id, r.option_value]));
}

/** حالة أقسام الجولة مع إجاباتها */
function roundDepartments(db, roundId) {
  return db.prepare(`SELECT rd.*, d.name, d.type_id, d.head_name, d.head_title, d.employees,
      t.name AS type_name
    FROM round_departments rd JOIN departments d ON d.id = rd.department_id
    LEFT JOIN department_types t ON t.id = d.type_id
    WHERE rd.round_id = ? ORDER BY d.id`).all(roundId)
    .map((r) => ({ ...r, answers: answersOf(db, r.id) }));
}

/** تقرير الجولة: يُحسب من الأقسام التي سلّمت إجاباتها فقط */
function roundReport(db, bank, roundId) {
  const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
  if (!round) return null;
  const profile = JSON.parse(round.profile_snapshot);
  const rds = roundDepartments(db, roundId);
  const submitted = rds.filter((r) => r.status === 'submitted')
    .map((r) => ({ id: r.department_id, name: r.name, typeId: r.type_id, status: r.status, answers: r.answers }));
  const agg = engine.aggregate(bank, profile, submitted);
  const prev = db.prepare(`SELECT id, title, overall_score, closed_at FROM rounds
    WHERE company_id = ? AND status = 'closed' AND id < ? ORDER BY id DESC LIMIT 1`).get(round.company_id, roundId);
  let comparison = null;
  if (prev) {
    const pf = Object.fromEntries(db.prepare('SELECT function_code, score FROM function_scores WHERE round_id = ?')
      .all(prev.id).map((x) => [x.function_code, x.score]));
    comparison = {
      previousId: prev.id, previousTitle: prev.title, previousOverall: prev.overall_score,
      delta: Math.round((agg.overall - prev.overall_score) * 10) / 10,
      functions: agg.functions.map((f) => ({
        code: f.code, previous: pf[f.code] ?? null,
        delta: f.score !== null && pf[f.code] !== undefined ? Math.round((f.score - pf[f.code]) * 10) / 10 : null,
      })),
    };
  }
  return {
    round: { id: round.id, title: round.title, status: round.status, createdAt: round.created_at, closedAt: round.closed_at, companyId: round.company_id },
    profile,
    participation: {
      total: rds.length,
      submitted: rds.filter((r) => r.status === 'submitted').length,
      inProgress: rds.filter((r) => r.status === 'in_progress').length,
      pending: rds.filter((r) => r.status === 'pending').length,
      departments: rds.map((r) => ({
        id: r.department_id, rdId: r.id, name: r.name, typeName: r.type_name, head: r.head_name, title: r.head_title,
        status: r.status, startedAt: r.started_at, submittedAt: r.submitted_at,
        total: engine.bankFor(bank, profile, r.type_id).questions.length, answered: Object.keys(r.answers).length,
      })),
    },
    ...agg, comparison,
  };
}

function closeRound(db, bank, roundId, closedAt) {
  const rep = roundReport(db, bank, roundId);
  db.transaction(() => {
    db.prepare(`UPDATE rounds SET status='closed', overall_score=?, tier=?, closed_at=COALESCE(?, datetime('now')) WHERE id=?`)
      .run(rep.overall, rep.tier.tier, closedAt || null, roundId);
    db.prepare('DELETE FROM function_scores WHERE round_id = ?').run(roundId);
    const ins = db.prepare('INSERT INTO function_scores (round_id,function_code,score) VALUES (?,?,?)');
    for (const f of rep.functions) if (f.score !== null) ins.run(roundId, f.code, f.score);
    const up = db.prepare('UPDATE round_departments SET score=? WHERE round_id=? AND department_id=?');
    for (const d of rep.departments) up.run(d.overall, roundId, d.id);
  })();
  return rep;
}

/** إنشاء جولة جديدة لكل أقسام الشركة */
function createRound(db, companyId, title, createdAt) {
  const c = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  const info = db.prepare('INSERT INTO rounds (company_id,title,profile_snapshot,created_at) VALUES (?,?,?,COALESCE(?, datetime(\'now\')))')
    .run(companyId, title, JSON.stringify(profileOf(c)), createdAt || null);
  const ins = db.prepare('INSERT INTO round_departments (round_id, department_id) VALUES (?,?)');
  for (const d of db.prepare('SELECT id FROM departments WHERE company_id = ?').all(companyId)) ins.run(info.lastInsertRowid, d.id);
  return info.lastInsertRowid;
}

module.exports = { profileOf, answersOf, roundDepartments, roundReport, closeRound, createRound };
