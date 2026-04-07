'use strict';

const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-jwt-secret';
const COOKIE  = 'mimir_token';
const TTL_SEC = 2 * 60 * 60; // 2 hours
const isProd  = process.env.NODE_ENV === 'production';

// Sign a JWT from user object
function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, photo: user.photo },
    SECRET,
    { expiresIn: TTL_SEC, issuer: 'mimir-websearch', algorithm: 'HS256' }
  );
}

// Set JWT as httpOnly secure cookie on the response
function setToken(res, user) {
  const token = sign(user);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   TTL_SEC * 1000,
  });
}

// Clear JWT cookie (on logout)
function clearToken(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax' });
}

// Middleware: verify JWT cookie → populate req.jwtUser if valid
function verifyMiddleware(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, SECRET, {
      issuer:    'mimir-websearch',
      algorithms: ['HS256'],
    });
    req.jwtUser = {
      id:    payload.id,
      email: payload.email,
      name:  payload.name,
      photo: payload.photo,
    };
  } catch (err) {
    // Expired or tampered — clear the bad cookie
    clearToken(res);
  }
  next();
}

module.exports = { setToken, clearToken, verifyMiddleware };
