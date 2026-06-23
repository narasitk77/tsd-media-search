'use strict';
/**
 * Google Drive search — surfaces media from our Shared Drive alongside Mimir.
 *
 * Auth: service account (set GOOGLE_SA_KEY_FILE). Optional Domain-Wide
 * Delegation subject (GOOGLE_DWD_SUBJECT) if the SA isn't a Shared Drive member.
 *
 * Config (.env):
 *   DRIVE_SEARCH_ENABLED=1
 *   GOOGLE_SA_KEY_FILE=/path/service-account.json
 *   DRIVE_SHARED_DRIVE_ID=0A...        # scope to one Shared Drive (recommended)
 *   GOOGLE_DWD_SUBJECT=you@thestandard.co   # optional
 *
 * If not configured, every function no-ops (search returns []) so the app runs
 * exactly as before.
 */
const fs = require('fs');
const { google } = require('googleapis');

const SHARED_DRIVE_ID = process.env.DRIVE_SHARED_DRIVE_ID || '';
const KEY_FILE        = process.env.GOOGLE_SA_KEY_FILE || '';
const DWD_SUBJECT     = process.env.GOOGLE_DWD_SUBJECT || '';

function isEnabled() {
  return process.env.DRIVE_SEARCH_ENABLED === '1' && !!KEY_FILE && fs.existsSync(KEY_FILE);
}

let _drive = null;
function client() {
  if (_drive) return _drive;
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    clientOptions: DWD_SUBJECT ? { subject: DWD_SUBJECT } : {},
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

// Escape a user term for the Drive `q` grammar (single-quoted strings).
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function mediaTypeOf(mime) {
  if (!mime) return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return null;
}

// Drive file → the app's normalised item shape (id prefixed `drive:`)
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

/**
 * Keyword search across the Shared Drive. Returns [] when disabled or on error
 * (Drive must never break the primary Mimir search).
 */
async function searchDrive(query, { mediaType = 'all', limit = 24 } = {}) {
  if (!isEnabled() || !query || !query.trim()) return [];
  const clauses = ['(mimeType contains \'image/\' or mimeType contains \'video/\')', 'trashed = false'];
  clauses.push(`fullText contains '${esc(query.trim())}'`);
  if (mediaType === 'image') clauses[0] = 'mimeType contains \'image/\'';
  if (mediaType === 'video') clauses[0] = 'mimeType contains \'video/\'';
  try {
    const r = await client().files.list(listParams(clauses.join(' and '), limit));
    const files = (r.data.files || []);
    const items = [];
    for (const f of files) { if (mediaTypeOf(f.mimeType)) items.push(toItem(f)); }
    return items;
  } catch (e) {
    console.warn('[driveModel] search failed:', e.message);
    return [];
  }
}

// Fresh thumbnail URL for a Drive file (thumbnailLink is short-lived).
async function getThumbnailUrl(fileId) {
  const r = await client().files.get({ fileId, fields: 'thumbnailLink', supportsAllDrives: true });
  if (r.data.thumbnailLink) return r.data.thumbnailLink;
  throw new Error('no thumbnail');
}

// Full detail for the modal.
async function getAssetById(fileId) {
  const r = await client().files.get({
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
