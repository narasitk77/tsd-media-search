'use strict';

const express    = require('express');
const passport   = require('passport');
const controller = require('../controllers/searchController');
const changelog  = require('../controllers/changelogController');
const auth       = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const logModel   = require('../models/logModel');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────
router.get('/login',  auth.loginPage);
router.get('/logout', auth.logout);

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], hd: 'thestandard.co' })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=fail' }),
  function (req, res) {
    logModel.log(req.user.email, 'login', { name: req.user.name });
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// ── Protected routes ──────────────────────────────────────────
router.use(requireAuth);

router.get('/',                      controller.index);
router.get('/search',                controller.search);
router.get('/proxy/thumbnail/:id',   controller.thumbnailProxy);
router.get('/asset/:id',             controller.assetDetail);
router.get('/changelog',             changelog.index);

// ── Download log (called by frontend JS) ──────────────────────
router.post('/log/download', express.json(), function (req, res) {
  const { assetId, title, mediaType, url } = req.body || {};
  logModel.log(req.user.email, 'download', { assetId, title, mediaType, url });
  res.json({ ok: true });
});

module.exports = router;
