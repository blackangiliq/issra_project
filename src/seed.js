/**
 * تعبئة البيانات التجريبية (مرة واحدة فقط عند أول تشغيل)
 * يمكن تعطيلها بـ SEED_DEMO=0
 */
const engine = require('./engine');
const { loadBank, token } = require('./db');
const { createRound, closeRound } = require('./services');
const { COMPANIES, CASE } = require('./data/demo');

// مولد أرقام عشوائية ثابت البذرة — لتكون البيانات التجريبية نفسها في كل مرة
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function pickAnswer(q, maturity, rand) {
  const target = Math.max(0, Math.min(1, maturity + (rand() - 0.5) * 0.7));
  const scored = q.options.filter((o) => o.score !== null);
  return scored.reduce((best, o) => (Math.abs(o.score - target) < Math.abs(best.score - target) ? o : best)).value;
}

function seedDemo(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key='demo_seeded'").get();
  if (done || process.env.SEED_DEMO === '0') return;
  const bank = loadBank(db);
  const typeId = Object.fromEntries(bank.types.map((t) => [t.code, t.id]));
  const rand = rng(2026);

  db.transaction(() => {
    for (const c of COMPANIES) {
      const cid = db.prepare(`INSERT INTO companies (name,sector,employees,city,address,phone,email,website,description,
        uses_cloud,remote_work,card_payments,has_website,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(c.name, c.sector, c.employees, c.city, c.address, c.phone, c.email, c.website, c.description,
          c.uses_cloud, c.remote_work, c.card_payments, c.has_website, `${c.rounds[0].date} 09:00:00`).lastInsertRowid;
      const depts = c.departments.map((d) => ({
        ...d, typeId: typeId[d.type],
        id: db.prepare(`INSERT INTO departments (company_id,type_id,name,description,employees,head_name,head_title,
          head_email,head_phone,access_code,link_token,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(cid, typeId[d.type], d.name, d.description, d.employees, d.head.name, d.head.title, d.head.email,
            d.head.phone, d.code, token(), `${c.rounds[0].date} 09:00:00`).lastInsertRowid,
      }));
      const profile = { ...c, size: engine.sizeOf(c.employees) };
      profile.uses_cloud = !!c.uses_cloud; profile.remote_work = !!c.remote_work;
      profile.card_payments = !!c.card_payments; profile.has_website = !!c.has_website;

      for (const r of c.rounds) {
        const rid = createRound(db, cid, r.title, `${r.date} 09:00:00`);
        for (const d of depts) {
          const rd = db.prepare('SELECT id FROM round_departments WHERE round_id=? AND department_id=?').get(rid, d.id);
          const status = (r.progress && r.progress[d.type]) || 'submitted';
          if (status === 'pending') continue;
          const sub = engine.bankFor(bank, profile, d.typeId);
          const preset = r.answers ? CASE[r.answers] : {};
          const maturity = r.answers === 'after' ? 0.85 : d.maturity + (r.boost || 0);
          const answers = {};
          const limit = status === 'in_progress' ? 3 : 999;
          for (let i = 0; i < limit; i++) {
            const n = engine.nextQuestion(sub, profile, answers);
            if (!n.question) break;
            answers[n.question.id] = preset[n.question.id] || pickAnswer(n.question, maturity, rand);
          }
          const ins = db.prepare('INSERT INTO answers (round_department_id,question_id,option_value,answered_at) VALUES (?,?,?,?)');
          for (const [q, v] of Object.entries(answers)) ins.run(rd.id, q, v, `${r.date} 11:00:00`);
          db.prepare(`UPDATE round_departments SET status=?, respondent_name=?, respondent_title=?, started_at=?, submitted_at=? WHERE id=?`)
            .run(status, d.head.name, d.head.title, `${r.date} 10:00:00`, status === 'submitted' ? `${r.date} 12:00:00` : null, rd.id);
        }
        if (r.status === 'closed') closeRound(db, bank, rid, `${r.date} 18:00:00`);
      }
    }
    db.prepare("INSERT INTO settings (key,value) VALUES ('demo_seeded','1')").run();
  })();
}

module.exports = { seedDemo };
