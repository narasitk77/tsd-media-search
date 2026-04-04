'use strict';

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const dbPath = path.join(__dirname, '../data/activity.db');
const db     = new sqlite3.Database(dbPath);

db.serialize(function () {
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime')),
      user    TEXT    NOT NULL,
      action  TEXT    NOT NULL,
      detail  TEXT
    )
  `);
});

function log(user, action, detail) {
  const val = detail != null
    ? (typeof detail === 'object' ? JSON.stringify(detail) : String(detail))
    : null;
  db.run(
    'INSERT INTO activity_log (user, action, detail) VALUES (?, ?, ?)',
    [user || 'anonymous', action, val],
    function (err) { if (err) console.error('[logModel]', err.message); }
  );
}

function recent(limit, cb) {
  db.all(
    'SELECT * FROM activity_log ORDER BY id DESC LIMIT ?',
    [limit || 1000],
    function (err, rows) { cb(err, rows); }
  );
}

module.exports = { log, recent };
