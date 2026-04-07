'use strict';

function requireAuth(req, res, next) {
  // JWT takes priority (stateless, survives server restart)
  if (req.jwtUser) {
    req.user = req.jwtUser;
    return next();
  }
  // Fallback: passport session
  if (req.isAuthenticated()) return next();

  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

module.exports = { requireAuth };
