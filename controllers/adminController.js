'use strict';

const logModel = require('../models/logModel');

// Only these emails can access /admin
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).render('error', { title: 'ไม่มีสิทธิ์เข้าถึง', message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' });
  }
  next();
}

function dashboard(req, res) {
  const stats = logModel.getStats();
  res.render('admin', {
    title: 'Admin Dashboard — Media Search',
    stats,
  });
}

module.exports = { requireAdmin, dashboard };
