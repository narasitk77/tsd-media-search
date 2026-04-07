'use strict';

const logModel      = require('../models/logModel');
const userModel     = require('../models/userModel');
const githubService = require('../services/githubService');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).render('error', { title: 'ไม่มีสิทธิ์เข้าถึง', message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' });
  }
  next();
}

async function dashboard(req, res) {
  const [stats, commits, users] = await Promise.all([
    Promise.resolve(logModel.getStats()),
    githubService.getRecentCommits(20),
    Promise.resolve(userModel.getAll()),
  ]);

  // Enrich users with activity stats from log
  const allLogs = logModel.readAll ? logModel.readAll() : [];
  const enrichedUsers = users.map(u => {
    const userLogs = allLogs.filter(e => e.user === u.email);
    return {
      ...u,
      loginCount:    userLogs.filter(e => e.action === 'login').length,
      searchCount:   userLogs.filter(e => e.action === 'search').length,
      downloadCount: userLogs.filter(e => e.action === 'download').length,
      downloads:     userLogs.filter(e => e.action === 'download').reverse().slice(0, 50),
    };
  });

  res.render('admin', {
    title: 'Admin Console — Media Search',
    stats,
    commits,
    users: enrichedUsers,
    tab: req.query.tab || 'overview',
    filterUser: req.query.user || '',
  });
}

// POST /admin/users/add
function addUser(req, res) {
  const { email, role, canSearch, canDownload } = req.body || {};
  if (email) {
    userModel.addUser(email.trim(), {
      role:        role || 'user',
      canSearch:   canSearch  !== 'false',
      canDownload: canDownload !== 'false',
    });
  }
  res.redirect('/admin?tab=users');
}

// POST /admin/users/:email/update
function updateUser(req, res) {
  const email = decodeURIComponent(req.params.email);
  const { role, status, canSearch, canDownload } = req.body || {};
  userModel.updateUser(email, {
    role:        role,
    status:      status,
    canSearch:   canSearch   === 'on' || canSearch   === 'true',
    canDownload: canDownload === 'on' || canDownload === 'true',
  });
  res.redirect('/admin?tab=users');
}

// POST /admin/users/:email/remove
function removeUser(req, res) {
  const email = decodeURIComponent(req.params.email);
  userModel.removeUser(email);
  res.redirect('/admin?tab=users');
}

module.exports = { requireAdmin, dashboard, addUser, updateUser, removeUser };
