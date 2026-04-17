'use strict';

const express    = require('express');
const passport   = require('passport');
const { createProxyMiddleware } = require('http-proxy-middleware');
const controller = require('../controllers/searchController');
const changelog  = require('../controllers/changelogController');
const browse     = require('../controllers/browseController');
const auth       = require('../controllers/authController');
const admin      = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { setToken, clearToken } = require('../middleware/jwt');
const logModel   = require('../models/logModel');
const userModel  = require('../models/userModel');

const router = express.Router();

// Proxy to metadata-tool Python service (admin only, keep path as-is)
const METADATA_TOOL_URL = process.env.METADATA_TOOL_URL || 'http://localhost:8000';
const METADATA_TOOL_SECRET = process.env.METADATA_TOOL_SECRET || '';
const metadataProxy = createProxyMiddleware({
  target: METADATA_TOOL_URL,
  changeOrigin: true,
  pathRewrite: { '^/ai-tool': '' },
  on: {
    proxyReq: (proxyReq) => {
      if (METADATA_TOOL_SECRET) {
        proxyReq.setHeader('X-Internal-Secret', METADATA_TOOL_SECRET);
      }
    },
    error: (err, req, res) => {
      console.error('[proxy] metadata-tool error:', err.code, err.message);
      const msg = `AI Metadata Tool ยังไม่พร้อมใช้งาน (${err.code || err.message})`;
      if (res.headersSent) return;
      res.status(502).send(msg);
    },
  },
});

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
    const record = userModel.upsertOnLogin(req.user);
    if (record.status === 'suspended') {
      return req.logout(function () { res.redirect('/login?error=suspended'); });
    }
    req.user.canSearch   = record.canSearch;
    req.user.canDownload = record.canDownload;
    req.user.role        = record.role;
    setToken(res, req.user);
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
router.get('/browse',          browse.folderList);
router.get('/browse/folder',   browse.folderContents);

router.get('/admin',    admin.requireAdmin, admin.dashboard);

// ── Admin user management ─────────────────────────────────────
router.post('/admin/users/add',             admin.requireAdmin, admin.addUser);
router.post('/admin/users/:email/update',   admin.requireAdmin, admin.updateUser);
router.post('/admin/users/:email/remove',   admin.requireAdmin, admin.removeUser);

// ── AI Metadata Tool proxy (admin only) ──────────────────────
// Connectivity test — returns JSON with status so we can diagnose private-network issues
router.get('/ai-tool/ping', admin.requireAdmin, async function (req, res) {
  const https = require('https');
  const http  = require('http');
  const url   = new URL(METADATA_TOOL_URL);
  const lib   = url.protocol === 'https:' ? https : http;
  const start = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const r = lib.get(
        { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: '/api/stats', timeout: 5000 },
        resolve
      );
      r.on('error', reject);
      r.on('timeout', () => reject(new Error('timeout')));
    });
    res.json({ ok: true, target: METADATA_TOOL_URL, ms: Date.now() - start });
  } catch (err) {
    res.json({ ok: false, target: METADATA_TOOL_URL, error: err.message, code: err.code });
  }
});

// Restore req.url to originalUrl before proxy so pathRewrite sees the full path
router.use('/ai-tool', admin.requireAdmin, (req, res, next) => {
  req.url = req.originalUrl;
  next();
}, metadataProxy);

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
