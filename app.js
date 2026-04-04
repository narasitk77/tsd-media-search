'use strict';

require('dotenv').config();
require('express-async-errors');

const express        = require('express');
const path           = require('path');
const session        = require('express-session');
const MemoryStore    = require('memorystore')(session);
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');

const routes = require('./routes/index');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Trust Railway's reverse proxy so secure cookies + OAuth redirects work correctly
app.set('trust proxy', 1);

// ── Security headers (helmet) ─────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // unsafe-inline needed for anti-flash theme script
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'lh3.googleusercontent.com', '*.amazonaws.com', '*.mjoll.no'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Passport: Google OAuth ────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`,
  },
  function (accessToken, refreshToken, profile, done) {
    const hd    = profile._json && profile._json.hd;
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;

    if (hd !== 'thestandard.co') {
      return done(null, false, { message: 'domain_mismatch' });
    }

    return done(null, {
      id:    profile.id,
      email,
      name:  profile.displayName,
      photo: profile.photos && profile.photos[0] && profile.photos[0].value,
    });
  }
));

passport.serializeUser(function (user, done)   { done(null, user); });
passport.deserializeUser(function (user, done) { done(null, user); });

// ── View engine ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.formatDuration = function (seconds) {
  if (!seconds) return '';
  const s   = Math.round(Number(seconds));
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

// ── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body parsers (with size limits) ──────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: false }));

// ── Rate limiting ─────────────────────────────────────────────
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max:      60,              // 60 requests/min per IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: 'Too many requests, please slow down.',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/search',       searchLimiter);
app.use('/auth/google',  authLimiter);

// ── Session ──────────────────────────────────────────────────
app.use(session({
  store:             new MemoryStore({ checkPeriod: 8 * 60 * 60 * 1000 }),
  secret:            process.env.SESSION_SECRET || 'dev-only-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,                // JS cannot read cookie
    secure:   isProd,              // HTTPS only in production
    sameSite: 'lax',
  },
}));

// ── Passport ─────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// Make user available in all EJS templates
app.use(function (req, res, next) {
  res.locals.user = req.user || null;
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/', routes);

const DEFAULT_RENDER = {
  results: null, query: '', mediaType: 'all',
  page: 1, totalPages: 0, total: 0, fetched: 0, exhausted: true, mode: null,
  searchTitle: '', searchPeople: '', searchDescription: '', searchTranscript: '',
  searchLabels: '', searchMetadata: '', searchFile: '', searchDetectedText: '',
  dateFrom: '', dateTo: '', durationMin: '', durationMax: '',
  locationFilter: '', sortBy: 'date', sortOrder: 'desc', pageSize: 24,
  displayQuery: '', stats: null,
};

// ── 404 handler ──────────────────────────────────────────────
app.use(function (req, res) {
  res.status(404).render('index', {
    ...DEFAULT_RENDER,
    title: '404 — Media Search',
    error: 'ไม่พบหน้าที่คุณต้องการ',
  });
});

// ── Error handler (no stack trace to client) ─────────────────
app.use(function (err, req, res, next) {
  console.error('[App Error]', err.message);
  res.status(500).render('index', {
    ...DEFAULT_RENDER,
    title: 'เกิดข้อผิดพลาด — Media Search',
    error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, function () {
  console.log(`Media Search running at http://localhost:${PORT}`);
});

module.exports = app;
