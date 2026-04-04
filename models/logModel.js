'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../data/activity.log');

// Ensure data dir exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function log(user, action, detail) {
  try {
    const entry = JSON.stringify({
      ts:     new Date().toISOString(),
      user:   user || 'anonymous',
      action,
      detail: detail != null
        ? (typeof detail === 'object' ? detail : String(detail))
        : null,
    });
    fs.appendFileSync(LOG_FILE, entry + '\n', 'utf8');
  } catch (e) {
    console.error('[logModel]', e.message);
  }
}

function recent(limit) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
    return lines.slice(-(limit || 1000)).reverse();
  } catch (_) {
    return [];
  }
}

module.exports = { log, recent };
