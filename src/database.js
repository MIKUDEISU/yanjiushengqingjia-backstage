import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'

const dbDir = path.dirname(config.dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(config.dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','tutor','counselor','college_leader','party_secretary','admin')),
      student_id TEXT UNIQUE,
      department TEXT,
      class_name TEXT,
      phone TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      leave_type TEXT NOT NULL CHECK(leave_type IN ('事假','病假','回家','探亲','其他')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      duration INTEGER NOT NULL,
      reason TEXT NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent','critical')),
      leaving_city INTEGER NOT NULL DEFAULT 0,
      destination_province TEXT,
      destination_city TEXT,
      destination_detail TEXT,
      destinations_json TEXT,
      personal_phone TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','approved','rejected')),
      stage TEXT NOT NULL DEFAULT 'initial' CHECK(stage IN ('initial','return','delay')),
      return_status TEXT CHECK(return_status IN ('processing','approved','rejected')),
      delay_status TEXT CHECK(delay_status IN ('processing','approved','rejected')),
      delay_reason TEXT,
      delay_days INTEGER DEFAULT 0,
      current_approver_id INTEGER REFERENCES users(id),
      current_step INTEGER DEFAULT 0,
      total_steps INTEGER DEFAULT 1,
      reject_reason TEXT,
      approval_config TEXT,
      sms_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_id INTEGER NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
      time TEXT NOT NULL,
      title TEXT NOT NULL,
      desc TEXT,
      status TEXT NOT NULL CHECK(status IN ('done','processing','error')),
      approver_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_id INTEGER NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_leaves_student ON leaves(student_id);
    CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
    CREATE INDEX IF NOT EXISTS idx_leaves_stage ON leaves(stage);
    CREATE INDEX IF NOT EXISTS idx_leaves_urgency ON leaves(urgency);
    CREATE INDEX IF NOT EXISTS idx_timeline_leave ON timeline(leave_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_leave ON attachments(leave_id);
  `)

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)
  `)

  insertSetting.run('max_leave_days', '56', '最长请假天数（超过8周=56天禁止提交）')
  insertSetting.run('return_advance_days', '1', '返校需提前天数')
  insertSetting.run('upload_max_size_mb', '2', '附件上传最大大小(MB)')
  insertSetting.run('approval_mode', 'serial', '审批模式：serial(串行)/parallel(并行)/any_one(任一通过)')

  console.log('[DB] 数据库表初始化完成')
}

export { db }

export function getDb() {
  return db
}

export function closeDatabase() {
  db.close()
}
