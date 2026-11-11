/**
 * طبقة قاعدة البيانات (SQLite عبر better-sqlite3) — الإصدار 2
 * ------------------------------------------------------------
 * كل شيء قابل للتعديل من لوحة الإدارة: المحاور (الوظائف)، الأسئلة وخياراتها
 * وتوصياتها، أنواع الأقسام، الشركات، الأقسام ومسؤولوها، وجولات التقييم.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { FUNCTIONS, QUESTIONS, DEPARTMENT_TYPES } = require('./data/framework');

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== الإطار (قابل للتعديل) =====
CREATE TABLE IF NOT EXISTS functions (          -- المحاور / وظائف NIST CSF 2.0
  code    TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  goal    TEXT NOT NULL DEFAULT '',
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS department_types (   -- أنواع الأقسام
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (          -- المعايير / الأسئلة
  id             TEXT PRIMARY KEY,
  function_code  TEXT NOT NULL REFERENCES functions(code),
  nist_ref       TEXT NOT NULL DEFAULT '',
  text           TEXT NOT NULL,
  help           TEXT,
  weight         REAL NOT NULL CHECK (weight > 0 AND weight <= 10),
  condition_json TEXT,                          -- شرط الظهور (Skip Logic)
  skip_mode      TEXT CHECK (skip_mode IN ('na','zero')),
  sizes_json     TEXT,                          -- أحجام الشركات المستهدفة (فارغ = الكل)
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS question_targets (   -- السؤال ← أنواع الأقسام (فارغ = كل الأقسام)
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type_id     INTEGER NOT NULL REFERENCES department_types(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, type_id)
);

CREATE TABLE IF NOT EXISTS options (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  value       TEXT NOT NULL,
  label       TEXT NOT NULL,
  score       REAL,                             -- NULL = غير منطبق
  sort        INTEGER NOT NULL,
  UNIQUE (question_id, value)
);

CREATE TABLE IF NOT EXISTS recommendations (    -- قاعدة المعرفة
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  option_value TEXT NOT NULL,
  title        TEXT NOT NULL,
  action       TEXT NOT NULL,
  priority     TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
  effort       TEXT NOT NULL CHECK (effort IN ('low','medium','high')),
  cost         TEXT NOT NULL CHECK (cost IN ('free','low','medium','high')),
  days         INTEGER NOT NULL,
  UNIQUE (question_id, option_value)
);

-- ===== الشركات والأقسام =====
CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  sector        TEXT NOT NULL DEFAULT 'other',
  employees     INTEGER NOT NULL DEFAULT 1,
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  uses_cloud    INTEGER NOT NULL DEFAULT 0,
  remote_work   INTEGER NOT NULL DEFAULT 0,
  card_payments INTEGER NOT NULL DEFAULT 0,
  has_website   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type_id     INTEGER REFERENCES department_types(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  employees   INTEGER NOT NULL DEFAULT 0,
  head_name   TEXT NOT NULL,                    -- المسؤول عن القسم
  head_title  TEXT NOT NULL DEFAULT '',         -- الدور الوظيفي
  head_email  TEXT NOT NULL DEFAULT '',
  head_phone  TEXT NOT NULL DEFAULT '',
  access_code TEXT NOT NULL,                    -- المعرّف (ID) الخاص بالمسؤول
  link_token  TEXT NOT NULL UNIQUE,             -- رمز الرابط المرسل للمسؤول
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== جولات التقييم =====
CREATE TABLE IF NOT EXISTS rounds (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  profile_snapshot TEXT NOT NULL,
  overall_score    REAL,
  tier             INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at        TEXT
);

CREATE TABLE IF NOT EXISTS round_departments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  department_id    INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','submitted')),
  respondent_name  TEXT,
  respondent_title TEXT,
  score            REAL,
  started_at       TEXT,
  submitted_at     TEXT,
  UNIQUE (round_id, department_id)
);

CREATE TABLE IF NOT EXISTS answers (
  round_department_id INTEGER NOT NULL REFERENCES round_departments(id) ON DELETE CASCADE,
  question_id         TEXT NOT NULL REFERENCES questions(id) ON UPDATE CASCADE,
  option_value        TEXT NOT NULL,
  answered_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (round_department_id, question_id)
);

CREATE TABLE IF NOT EXISTS function_scores (
  round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  function_code TEXT NOT NULL,
  score         REAL NOT NULL,
  PRIMARY KEY (round_id, function_code)
);

CREATE INDEX IF NOT EXISTS idx_dept_company ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_round_company ON rounds(company_id);
CREATE INDEX IF NOT EXISTS idx_rd_round ON round_departments(round_id);
`;

const token = () => crypto.randomBytes(12).toString('base64url');
function accessCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let p = '';
  for (let i = 0; i < 3; i++) p += L[crypto.randomInt(L.length)];
  return `${p}-${crypto.randomInt(1000, 10000)}`;
}

function seedFramework(db) {
  if (db.prepare('SELECT COUNT(*) n FROM functions').get().n > 0) return;
  const insFn = db.prepare('INSERT INTO functions (code,name,name_en,goal,sort) VALUES (?,?,?,?,?)');
  const insT = db.prepare('INSERT INTO department_types (code,name,description,sort) VALUES (?,?,?,?)');
  const insQ = db.prepare(`INSERT INTO questions
    (id,function_code,nist_ref,text,help,weight,condition_json,skip_mode,sizes_json,sort) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insO = db.prepare('INSERT INTO options (question_id,value,label,score,sort) VALUES (?,?,?,?,?)');
  const insR = db.prepare(`INSERT INTO recommendations
    (question_id,option_value,title,action,priority,effort,cost,days) VALUES (?,?,?,?,?,?,?,?)`);
  const insQT = db.prepare('INSERT INTO question_targets (question_id,type_id) VALUES (?,?)');
  db.transaction(() => {
    for (const f of FUNCTIONS) insFn.run(f.code, f.name, f.en, f.goal, f.sort);
    const typeIds = {};
    DEPARTMENT_TYPES.forEach((t, i) => { typeIds[t.code] = insT.run(t.code, t.name, t.description, i + 1).lastInsertRowid; });
    QUESTIONS.forEach((q, i) => {
      insQ.run(q.id, q.fn, q.ref, q.text, q.help || null, q.weight,
        q.when ? JSON.stringify(q.when) : null, q.when ? (q.onSkip || 'na') : null,
        q.sizes ? JSON.stringify(q.sizes) : null, i + 1);
      q.options.forEach((o, j) => insO.run(q.id, o.value, o.label, o.score, j + 1));
      for (const [val, r] of Object.entries(q.rec || {})) insR.run(q.id, val, r.title, r.action, r.priority, r.effort, r.cost, r.days);
      for (const code of q.targets || []) insQT.run(q.id, typeIds[code]);
    });
  })();
}

function seedAdmin(db) {
  if (db.prepare('SELECT COUNT(*) n FROM admins').get().n > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  db.prepare('INSERT INTO admins (username,name,password_hash) VALUES (?,?,?)')
    .run(username, 'مدير المنصة', bcrypt.hashSync(password, 10));
}

function openDb(file) {
  const dbFile = file || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'cyber.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  // ترقية من الإصدار التجريبي الأول (مخطط مختلف): إعادة إنشاء القاعدة
  if (db.pragma('user_version', { simple: true }) < SCHEMA_VERSION) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    db.pragma('foreign_keys = OFF');
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seedFramework(db);
  seedAdmin(db);
  return db;
}

/** تحميل الإطار كاملاً (المحاور + الأسئلة + الخيارات + التوصيات + التوجيه للأقسام) */
function loadBank(db) {
  const functions = db.prepare('SELECT * FROM functions ORDER BY sort, code').all();
  const types = db.prepare('SELECT * FROM department_types ORDER BY sort, id').all();
  const rows = db.prepare('SELECT * FROM questions ORDER BY sort, id').all();
  const byQ = {};
  for (const q of rows) {
    byQ[q.id] = {
      id: q.id, fn: q.function_code, ref: q.nist_ref, text: q.text, help: q.help,
      weight: q.weight, when: q.condition_json ? JSON.parse(q.condition_json) : null,
      onSkip: q.skip_mode, sizes: q.sizes_json ? JSON.parse(q.sizes_json) : [],
      active: !!q.active, sort: q.sort, options: [], rec: {}, targets: [],
    };
  }
  for (const o of db.prepare('SELECT * FROM options ORDER BY question_id, sort').all()) {
    if (byQ[o.question_id]) byQ[o.question_id].options.push({ value: o.value, label: o.label, score: o.score });
  }
  for (const r of db.prepare('SELECT * FROM recommendations').all()) {
    if (byQ[r.question_id]) byQ[r.question_id].rec[r.option_value] = r;
  }
  for (const t of db.prepare('SELECT * FROM question_targets').all()) {
    if (byQ[t.question_id]) byQ[t.question_id].targets.push(t.type_id);
  }
  return { functions, types, questions: rows.map((q) => byQ[q.id]) };
}

module.exports = { openDb, loadBank, token, accessCode };
