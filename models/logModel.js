'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, '../data/activity.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
    user    TEXT    NOT NULL,
    action  TEXT    NOT NULL,
    detail  TEXT
  )
`);

const _insert = db.prepare('INSERT INTO activity_log (user, action, detail) VALUES (?, ?, ?)');

function log(user, action, detail) {
  try {
    _insert.run(
      user || 'anonymous',
      action,
      detail != null ? (typeof detail === 'object' ? JSON.stringify(detail) : String(detail)) : null
    );
  } catch (e) {
    console.error('[logModel]', e.message);
  }
}

function recent(limit) {
  return db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit || 1000);
}

module.exports = { log, recent };
