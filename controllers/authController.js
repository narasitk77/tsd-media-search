'use strict';

const logModel = require('../models/logModel');

function loginPage(req, res) {
  if (req.isAuthenticated()) return res.redirect('/');
  const error = req.query.error === 'domain'
    ? 'กรุณาเข้าสู่ระบบด้วยอีเมล @thestandard.co เท่านั้น'
    : req.query.error === 'fail'
    ? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
    : null;
  res.render('login', { title: 'เข้าสู่ระบบ — Media Search', error });
}

function logout(req, res, next) {
  const email = req.user && req.user.email;
  req.logout(function (err) {
    if (err) return next(err);
    if (email) logModel.log(email, 'logout');
    res.redirect('/login');
  });
}

module.exports = { loginPage, logout };
