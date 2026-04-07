'use strict';

const path = require('path');
const fs   = require('fs');

const CHANGELOG_PATH = path.join(__dirname, '../changelog.json');

function index(req, res) {
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
    // Sort newest first
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  } catch (e) {
    console.error('[changelog] failed to read changelog:', e.message);
  }

  res.render('changelog', {
    title:   'Change Logs — Mimir Media Search',
    entries,
  });
}

function api(req, res) {
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  } catch (e) {}
  res.json(entries);
}

module.exports = { index, api };
