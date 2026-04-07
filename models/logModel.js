'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../data/activity.log');

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

function readAll() {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

function recent(limit) {
  const all = readAll();
  return all.slice(-(limit || 1000)).reverse();
}

// ── Stats for admin dashboard ──────────────────────────────────
function getStats() {
  const all = readAll();

  // Unique users (by login events)
  const loginEvents  = all.filter(e => e.action === 'login');
  const uniqueUsers  = new Set(all.map(e => e.user)).size;
  const totalLogins  = loginEvents.length;
  const totalSearches = all.filter(e => e.action === 'search').length;
  const totalViews   = all.filter(e => e.action === 'view').length;
  const totalDownloads = all.filter(e => e.action === 'download').length;

  // Searches per user
  const searchesByUser = {};
  all.filter(e => e.action === 'search').forEach(e => {
    searchesByUser[e.user] = (searchesByUser[e.user] || 0) + 1;
  });

  // Top search queries
  const queryCounts = {};
  all.filter(e => e.action === 'search').forEach(e => {
    const q = (e.detail && e.detail.q) || '';
    if (q) queryCounts[q] = (queryCounts[q] || 0) + 1;
  });
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([q, count]) => ({ q, count }));

  // Logins per day (last 30 days)
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const dailyLogins = {};
  loginEvents.forEach(e => {
    if (now - new Date(e.ts).getTime() > 30 * day) return;
    const d = e.ts.slice(0, 10);
    dailyLogins[d] = (dailyLogins[d] || 0) + 1;
  });

  // Recent activity (last 100)
  const recentActivity = all.slice(-100).reverse();

  // Users list with stats
  const userMap = {};
  all.forEach(e => {
    if (!userMap[e.user]) userMap[e.user] = { email: e.user, logins: 0, searches: 0, views: 0, downloads: 0, lastSeen: e.ts };
    if (e.action === 'login')    userMap[e.user].logins++;
    if (e.action === 'search')   userMap[e.user].searches++;
    if (e.action === 'view')     userMap[e.user].views++;
    if (e.action === 'download') userMap[e.user].downloads++;
    if (e.ts > userMap[e.user].lastSeen) userMap[e.user].lastSeen = e.ts;
  });
  const users = Object.values(userMap).sort((a, b) => b.searches - a.searches);

  return {
    uniqueUsers, totalLogins, totalSearches, totalViews, totalDownloads,
    topQueries, dailyLogins, recentActivity, users,
  };
}

module.exports = { log, recent, readAll, getStats };
