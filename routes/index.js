'use strict';

const express    = require('express');
const passport   = require('passport');
const controller = require('../controllers/searchController');
const changelog  = require('../controllers/changelogController');
const auth       = require('../controllers/authController');
const admin      = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { setToken, clearToken } = require('../middleware/jwt');
const logModel   = require('../models/logModel');

const router = express.Router();

// Safe ID pattern: alphanumeric + hyphens/underscores, max 100 chars
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;

// ── Auth ──────────────────────────────────────────────────────
router.get('/login',  auth.loginPage);
router.get('/logout', function (req, res, next) {
  clearToken(res);             // clear JWT cookie
  auth.logout(req, res, next); // clear passport session + redirect
});

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], hd: 'thestandard.co' })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=fail' }),
  function (req, res) {
    setToken(res, req.user);   // issue signed JWT cookie
    logModel.log(req.user.email, 'login', { name: req.user.name });
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// ── Protected routes ──────────────────────────────────────────
router.use(requireAuth);

router.get('/',         controller.index);
router.get('/search',   controller.search);
router.get('/changelog',     changelog.index);
router.get('/api/changelog', changelog.api);
router.get('/admin',    admin.requireAdmin, admin.dashboard);

router.get('/proxy/thumbnail/:id', function (req, res, next) {
  if (!SAFE_ID.test(req.params.id)) return res.status(400).end();
  next();
}, controller.thumbnailProxy);

router.get('/asset/:id', function (req, res, next) {
  if (!SAFE_ID.test(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID' });
  next();
}, controller.assetDetail);

// ── Download log (called by frontend JS) ──────────────────────
router.post('/log/download', function (req, res) {
  const { assetId, title, mediaType } = req.body || {};
  if (!assetId || !SAFE_ID.test(String(assetId))) return res.json({ ok: false });
  const safeTitle     = typeof title     === 'string' ? title.slice(0, 200)     : null;
  const safeMediaType = typeof mediaType === 'string' ? mediaType.slice(0, 20)  : null;
  logModel.log(req.user.email, 'download', { assetId, title: safeTitle, mediaType: safeMediaType });
  res.json({ ok: true });
});

module.exports = router;
