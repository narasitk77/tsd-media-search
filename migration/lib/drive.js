'use strict';
/**
 * Google Drive client via service account.
 *
 * Required env (set in migration/.env or the repo .env):
 *   GOOGLE_SA_KEY_FILE   path to the service account JSON key
 *   GOOGLE_DWD_SUBJECT   (optional) Workspace user email to impersonate via
 *                        Domain-Wide Delegation — use this if the service
 *                        account itself isn't a member of the Shared Drive.
 *
 * Scope: full Drive (upload + appProperties + Shared Drive support).
 */
const fs = require('fs');
const { google } = require('googleapis');

function driveClient() {
  const keyFile = process.env.GOOGLE_SA_KEY_FILE;
  if (!keyFile || !fs.existsSync(keyFile)) {
    throw new Error('GOOGLE_SA_KEY_FILE is not set or file not found — point it at the service account JSON');
  }
  const subject = process.env.GOOGLE_DWD_SUBJECT || undefined;
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive'],
    clientOptions: subject ? { subject } : {},
  });
  return google.drive({ version: 'v3', auth });
}

module.exports = { driveClient };
