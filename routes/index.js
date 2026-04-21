'use strict';

const express    = require('express');
const passport   = require('passport');
const controller = require('../controllers/searchController');
const changelog  = require('../controllers/changelogController');
const browse     = require('../controllers/browseController');
const auth       = require('../controllers/authController');
const admin      = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { setToken, clearToken } = require('../middleware/jwt');
const logModel   = require('../models/logModel');
const userModel  = require('../models/userModel');

const gdocs  = require('../services/googleDocsService');

const router = express.Router();

// Safe ID pattern: alphanumeric + hyphens/underscores, max 100 chars
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;
// Google Doc ID pattern
const SAFE_DOC_ID = /^[a-zA-Z0-9_-]{20,100}$/;

// ── Auth ──────────────────────────────────────────────────────
router.get('/login',  auth.loginPage);
router.get('/logout', function (req, res, next) {
  clearToken(res);             // clear JWT cookie
  auth.logout(req, res, next); // clear passport session + redirect
});

router.get('/auth/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/documents',
    ],
    hd: 'thestandard.co',
  })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=fail' }),
  function (req, res) {
    // Save Google access token in session (not in JWT); used for Google Docs API
    if (req.user._gToken) {
      req.session.gToken = req.user._gToken;
      delete req.user._gToken;
    }
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

// ── Google Docs API (requires fresh login with Drive/Docs scopes) ─────────────
router.get('/api/gdocs/recent', async function (req, res) {
  const token = req.session && req.session.gToken;
  if (!token) return res.json({ ok: false, error: 'no_token', docs: [] });
  try {
    const docs = await gdocs.listRecentDocs(token);
    res.json({ ok: true, docs });
  } catch (e) {
    const status = e.response && e.response.status;
    if (status === 401) req.session.gToken = null;
    res.json({ ok: false, error: e.message, docs: [] });
  }
});

router.post('/api/gdocs/append', async function (req, res) {
  const token = req.session && req.session.gToken;
  if (!token) return res.status(401).json({ ok: false, error: 'no_token' });
  const { docId, text } = req.body || {};
  if (!docId || !SAFE_DOC_ID.test(String(docId))) return res.status(400).json({ ok: false, error: 'invalid_doc_id' });
  if (typeof text !== 'string' || text.length > 20_000) return res.status(400).json({ ok: false, error: 'invalid_text' });
  try {
    await gdocs.appendToDoc(token, docId, text);
    res.json({ ok: true });
  } catch (e) {
    const status = (e.response && e.response.status) || 502;
    const msg    = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message;
    if (status === 401) req.session.gToken = null;
    res.status(status).json({ ok: false, error: msg });
  }
});

module.exports = router;
