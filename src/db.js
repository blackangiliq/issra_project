/**
 * طبقة قاعدة البيانات (SQLite عبر better-sqlite3)
 * ينشئ الجداول ويعبّئ بنك الأسئلة وقاعدة المعرفة عند أول تشغيل.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { FUNCTIONS, QUESTIONS } = require('./data/framework');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL DEFAULT 'other',
  employees     INTEGER NOT NULL DEFAULT 1,
  uses_cloud    INTEGER NOT NULL DEFAULT 0,
  remote_work   INTEGER NOT NULL DEFAULT 0,
  card_payments INTEGER NOT NULL DEFAULT 0,
  has_website   INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- وظائف NIST CSF 2.0
CREATE TABLE IF NOT EXISTS functions (
  code    TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  name_en TEXT NOT NULL,
  goal    TEXT NOT NULL,
  sort    INTEGER NOT NULL
);

-- بنك الأسئلة
CREATE TABLE IF NOT EXISTS questions (
  id             TEXT PRIMARY KEY,
  function_code  TEXT NOT NULL REFERENCES functions(code),
  nist_ref       TEXT NOT NULL,
  text           TEXT NOT NULL,
  help           TEXT,
  weight         INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 5),
  condition_json TEXT,                     -- شرط الظهور (Skip Logic)
  skip_mode      TEXT CHECK (skip_mode IN ('na','zero')),
  sort           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  value       TEXT NOT NULL,
  label       TEXT NOT NULL,
  score       REAL,                        -- NULL = غير منطبق
  sort        INTEGER NOT NULL,
  UNIQUE (question_id, value)
);

-- قاعدة المعرفة: إجابة ضعيفة ← توصية
CREATE TABLE IF NOT EXISTS recommendations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_value TEXT NOT NULL,
  title       TEXT NOT NULL,
  action      TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  effort      TEXT NOT NULL CHECK (effort IN ('low','medium','high')),
  cost        TEXT NOT NULL CHECK (cost IN ('free','low','medium','high')),
  days        INTEGER NOT NULL,
  UNIQUE (question_id, option_value)
);

CREATE TABLE IF NOT EXISTS assessments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  profile_snapshot TEXT NOT NULL,          -- ملف الشركة وقت التقييم (JSON)
  overall_score    REAL,
  tier             INTEGER,
  started_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at     TEXT
);

CREATE TABLE IF NOT EXISTS answers (
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES questions(id),
  option_value  TEXT NOT NULL,
  answered_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS function_scores (
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  function_code TEXT NOT NULL REFERENCES functions(code),
  score         REAL NOT NULL,
  PRIMARY KEY (assessment_id, function_code)
);

CREATE INDEX IF NOT EXISTS idx_assess_company ON assessments(company_id);
`;

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (count > 0) return;

  const insFn = db.prepare('INSERT INTO functions (code,name,name_en,goal,sort) VALUES (?,?,?,?,?)');
  const insQ = db.prepare(`INSERT INTO questions
    (id,function_code,nist_ref,text,help,weight,condition_json,skip_mode,sort) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insO = db.prepare('INSERT INTO options (question_id,value,label,score,sort) VALUES (?,?,?,?,?)');
  const insR = db.prepare(`INSERT INTO recommendations
    (question_id,option_value,title,action,priority,effort,cost,days) VALUES (?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    for (const f of FUNCTIONS) insFn.run(f.code, f.name, f.en, f.goal, f.sort);
    QUESTIONS.forEach((q, i) => {
      insQ.run(q.id, q.fn, q.ref, q.text, q.help || null, q.weight,
        q.when ? JSON.stringify(q.when) : null, q.when ? (q.onSkip || 'na') : null, i + 1);
      q.options.forEach((o, j) => insO.run(q.id, o.value, o.label, o.score, j + 1));
      for (const [val, r] of Object.entries(q.rec || {})) {
        insR.run(q.id, val, r.title, r.action, r.priority, r.effort, r.cost, r.days);
      }
    });
  })();
}

function openDb(file) {
  const dbFile = file || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'cyber.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

/** تحميل بنك الأسئلة كاملاً من قاعدة البيانات (يُستخدم من المحرك) */
function loadBank(db) {
  const functions = db.prepare('SELECT * FROM functions ORDER BY sort').all();
  const questions = db.prepare('SELECT * FROM questions ORDER BY sort').all();
  const options = db.prepare('SELECT * FROM options ORDER BY question_id, sort').all();
  const recs = db.prepare('SELECT * FROM recommendations').all();
  const byQ = {};
  for (const q of questions) {
    byQ[q.id] = {
      id: q.id, fn: q.function_code, ref: q.nist_ref, text: q.text, help: q.help,
      weight: q.weight, when: q.condition_json ? JSON.parse(q.condition_json) : null,
      onSkip: q.skip_mode, options: [], rec: {},
    };
  }
  for (const o of options) byQ[o.question_id].options.push({ value: o.value, label: o.label, score: o.score });
  for (const r of recs) byQ[r.question_id].rec[r.option_value] = r;
  return { functions, questions: questions.map((q) => byQ[q.id]) };
}

module.exports = { openDb, loadBank };
