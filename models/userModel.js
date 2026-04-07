'use strict';

const fs   = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../data/users.json');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function getAll() {
  return readUsers().sort((a, b) =>
    (b.lastSeen || b.registeredAt || '').localeCompare(a.lastSeen || a.registeredAt || '')
  );
}

function findByEmail(email) {
  return readUsers().find(u => u.email === (email || '').toLowerCase()) || null;
}

// Called on every successful Google OAuth login
function upsertOnLogin(profile) {
  const users = readUsers();
  const email = (profile.email || '').toLowerCase();
  const idx   = users.findIndex(u => u.email === email);
  const now   = new Date().toISOString();

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (idx >= 0) {
    users[idx].name    = profile.name  || users[idx].name;
    users[idx].photo   = profile.photo || users[idx].photo;
    users[idx].lastSeen = now;
    if (users[idx].status === 'pending') users[idx].status = 'active';
    writeUsers(users);
    return users[idx];
  }

  const newUser = {
    email,
    name:        profile.name  || '',
    photo:       profile.photo || '',
    role:        adminEmails.includes(email) ? 'admin' : 'user',
    canSearch:   true,
    canDownload: true,
    status:      'active',
    registeredAt: now,
    lastSeen:    now,
  };
  users.push(newUser);
  writeUsers(users);
  return newUser;
}

// Admin: pre-register user by email
function addUser(email, opts) {
  const users     = readUsers();
  const lowerEmail = (email || '').toLowerCase();
  if (!lowerEmail || users.find(u => u.email === lowerEmail)) return null;
  const now = new Date().toISOString();
  const newUser = {
    email:       lowerEmail,
    name:        opts.name || '',
    photo:       '',
    role:        opts.role || 'user',
    canSearch:   opts.canSearch  !== false,
    canDownload: opts.canDownload !== false,
    status:      'pending',
    registeredAt: now,
    lastSeen:    null,
  };
  users.push(newUser);
  writeUsers(users);
  return newUser;
}

// Admin: update user fields
function updateUser(email, changes) {
  const users = readUsers();
  const idx   = users.findIndex(u => u.email === (email || '').toLowerCase());
  if (idx < 0) return null;
  users[idx] = { ...users[idx], ...changes };
  writeUsers(users);
  return users[idx];
}

// Admin: remove user
function removeUser(email) {
  const users = readUsers();
  const idx   = users.findIndex(u => u.email === (email || '').toLowerCase());
  if (idx < 0) return false;
  users.splice(idx, 1);
  writeUsers(users);
  return true;
}

module.exports = { getAll, findByEmail, upsertOnLogin, addUser, updateUser, removeUser };
