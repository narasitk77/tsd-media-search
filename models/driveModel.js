'use strict';
/**
 * Google Drive search — surfaces media from our Shared Drive alongside Mimir.
 *
 * Two auth paths (per-user preferred, service account as fallback):
 *   1. Per-user OAuth — uses the logged-in user's Google token (already granted
 *      `drive.metadata.readonly` at login). No service account needed. The
 *      controller passes { accessToken, refreshToken } from the session.
 *   2. Service account — set GOOGLE_SA_KEY_FILE (+ optional GOOGLE_DWD_SUBJECT).
 *
 * Config (.env):
 *   DRIVE_SEARCH_ENABLED=1            # master switch (works for either path)
 *   DRIVE_SHARED_DRIVE_ID=0A...       # scope to one Shared Drive (recommended)
 *   GOOGLE_SA_KEY_FILE=/path/sa.json  # only for the service-account path
 *   GOOGLE_DWD_SUBJECT=you@thestandard.co
 *
 * Disabled or no usable auth → every function no-ops (search returns []), so the
 * app runs exactly as before and Drive never breaks the primary Mimir search.
 */
const fs = require('fs');
const { google } = require('googleapis');

const SHARED_DRIVE_ID = process.env.DRIVE_SHARED_DRIVE_ID || '';
const KEY_FILE        = process.env.GOOGLE_SA_KEY_FILE || '';
const DWD_SUBJECT     = process.env.GOOGLE_DWD_SUBJECT || '';
const SCOPES          = ['https://www.googleapis.com/auth/drive.readonly'];

function isEnabled() {
  return process.env.DRIVE_SEARCH_ENABLED === '1';
}

// ── Auth clients ──────────────────────────────────────────────
let _saDrive = null;
function saClient() {
  if (!KEY_FILE || !fs.existsSync(KEY_FILE)) return null;
  if (_saDrive) return _saDrive;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: SCOPES,
    clientOptions: DWD_SUBJECT ? { subject: DWD_SUBJECT } : {},
  });
  _saDrive = google.drive({ version: 'v3', auth });
  return _saDrive;
}

// Per-request client built from the logged-in user's Google token.
function userClient(auth) {
  if (!auth || !auth.accessToken) return null;
  const o = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
  o.setCredentials({
    access_token:  auth.accessToken,
    refresh_token: auth.refreshToken || undefined, // enables auto-refresh when present
  });
  return google.drive({ version: 'v3', auth: o });
}

// Prefer the user's own access; fall back to the service account if configured.
function resolveClient(auth) {
  return userClient(auth) || saClient();
}

// ── Helpers ───────────────────────────────────────────────────
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function mediaTypeOf(mime) {
  if (!mime) return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return null;
}

function toItem(f) {
  const mt = mediaTypeOf(f.mimeType);
  const vmeta = f.videoMediaMetadata || {};
  const imeta = f.imageMediaMetadata || {};
  return {
    id:           `drive:${f.id}`,
    source:       'drive',
    mediaType:    mt || 'image',
    title:        f.name || 'ไม่มีชื่อ',
    thumbnail:    `/proxy/thumbnail/drive:${f.id}`,
    created:      f.createdTime || null,
    modified:     f.modifiedTime || null,
    duration:     vmeta.durationMillis ? Math.round(Number(vmeta.durationMillis) / 1000) : null,
    fileSize:     f.size ? Number(f.size) : null,
    width:        vmeta.width || imeta.width || null,
    height:       vmeta.height || imeta.height || null,
    mimeType:     f.mimeType || null,
    sourcePath:   null,
    rootFolder:   null,
    photographer: null,
    downloadUrl:  f.webContentLink || f.webViewLink || null,
    externalUrl:  f.webViewLink || null,
  };
}

const LIST_FIELDS = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,videoMediaMetadata,imageMediaMetadata)';

function listParams(q, pageSize) {
  const p = {
    q,
    pageSize,
    fields: `nextPageToken,${LIST_FIELDS}`,
    spaces: 'drive',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  if (SHARED_DRIVE_ID) { p.corpora = 'drive'; p.driveId = SHARED_DRIVE_ID; }
  else { p.corpora = 'allDrives'; }
  return p;
}

// ── Search ────────────────────────────────────────────────────
/**
 * Keyword search across the Shared Drive. Returns [] when disabled, no auth, or
 * on error. Tries `fullText` (broad) and falls back to `name` (works even with
 * the metadata-only scope).
 */
async function searchDrive(query, { mediaType = 'all', limit = 24, auth } = {}) {
  if (!isEnabled() || !query || !query.trim()) return [];
  const drive = resolveClient(auth);
  if (!drive) return [];

  const term = esc(query.trim());
  const typeClause = mediaType === 'image'
    ? "mimeType contains 'image/'"
    : mediaType === 'video'
      ? "mimeType contains 'video/'"
      : "(mimeType contains 'image/' or mimeType contains 'video/')";

  const run = async (textClause) => {
    const q = `${typeClause} and trashed = false and ${textClause}`;
    const r = await drive.files.list(listParams(q, limit));
    return (r.data.files || []).filter(f => mediaTypeOf(f.mimeType)).map(toItem);
  };

  try {
    return await run(`fullText contains '${term}'`);
  } catch (e1) {
    try {
      return await run(`name contains '${term}'`); // metadata-scope-safe fallback
    } catch (e2) {
      console.warn('[driveModel] search failed:', e2.message);
      return [];
    }
  }
}

// Fresh thumbnail URL for a Drive file (thumbnailLink is short-lived).
async function getThumbnailUrl(fileId, auth) {
  const drive = resolveClient(auth);
  if (!drive) throw new Error('drive not available');
  const r = await drive.files.get({ fileId, fields: 'thumbnailLink', supportsAllDrives: true });
  if (r.data.thumbnailLink) return r.data.thumbnailLink;
  throw new Error('no thumbnail');
}

// Full detail for the modal.
async function getAssetById(fileId, auth) {
  const drive = resolveClient(auth);
  if (!drive) throw new Error('drive not available');
  const r = await drive.files.get({
    fileId,
    fields: `id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,videoMediaMetadata,imageMediaMetadata`,
    supportsAllDrives: true,
  });
  const base = toItem(r.data);
  const isVideo = base.mediaType === 'video';
  return {
    ...base,
    // images can render inline; Drive video plays via the Drive preview iframe
    previewUrl:  isVideo ? `https://drive.google.com/file/d/${fileId}/preview` : (r.data.webContentLink || null),
    previewIsIframe: isVideo,
    thumbUrl:    base.thumbnail,
    highResUrl:  r.data.webContentLink || r.data.webViewLink || null,
    vttUrl:      null,
    fileType:    (r.data.mimeType || '').split('/')[1] || null,
  };
}

module.exports = { isEnabled, searchDrive, getThumbnailUrl, getAssetById };
