#!/usr/bin/env node
'use strict';
/**
 * Phase 2 — upload Mimir originals to a Google Drive Shared Drive.
 *
 * Streams each original from Mimir (highRes URL) straight into Drive (no local
 * staging of 14 TB), tags it with the Mimir ID in appProperties, and records a
 * mimirId→driveFileId mapping so the run is fully RESUMABLE.
 *
 * Prereqs:
 *   1. migration/out/items-full.jsonl  (run `enrich` first)
 *   2. env: GOOGLE_SA_KEY_FILE, DRIVE_SHARED_DRIVE_ID
 *           GOOGLE_DWD_SUBJECT (optional), DRIVE_DEST_FOLDER_ID (optional)
 *
 * Usage:  node migration/upload-to-drive.js [--limit N] [--refresh]
 *   --limit N    upload at most N items (smoke test)
 *   --refresh    always re-fetch a fresh download URL from Mimir per item
 *                (use if the export is old and presigned URLs have expired)
 *
 * NOTE: presigned highRes URLs expire — run the upload while Mimir is still
 * live, or pass --refresh. Originals prefer `highRes`; falls back to `proxy`.
 */
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const readline = require('readline');
const axios = require('axios');
const { driveClient } = require('./lib/drive');

const OUT = path.join(__dirname, 'out');
const FULL    = path.join(OUT, 'items-full.jsonl');
const MAPPING = path.join(OUT, 'drive-mapping.jsonl'); // {mimirId, driveFileId, name, bytes}

const SHARED_DRIVE_ID = process.env.DRIVE_SHARED_DRIVE_ID;
const DEST_FOLDER_ID  = process.env.DRIVE_DEST_FOLDER_ID || process.env.DRIVE_SHARED_DRIVE_ID; // default: drive root
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file']);
const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 4);
const RETRIES = 3;

const argLimit  = process.argv.includes('--limit') ? Number(process.argv[process.argv.indexOf('--limit') + 1]) : 0;
const forceRefresh = process.argv.includes('--refresh');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function readJsonl(file, onLine) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(0);
    let n = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    rl.on('line', (l) => { if (l.trim()) { onLine(JSON.parse(l)); n++; } });
    rl.on('close', () => resolve(n));
    rl.on('error', reject);
  });
}

// Lazy Mimir client only if we need to refresh download URLs (Cognito auth).
let _mimir = null;
async function refreshDownloadUrl(id) {
  if (!_mimir) {
    const cfg = require('../config/mimir');
    const auth = require('../services/mimirAuth');
    _mimir = axios.create({ baseURL: cfg.baseUrl, timeout: cfg.requestTimeout || 30000 });
    _mimir.interceptors.request.use(async (c) => { Object.assign(c.headers, await auth.getAuthHeader()); return c; });
  }
  const r = await _mimir.get(`/items/${id}`);
  return r.data.highRes || r.data.proxy || null;
}

function originalName(raw) {
  if (raw.originalFileName) return raw.originalFileName;
  const p = (raw.ingestSourceFullPath || '').split('/').filter(Boolean);
  return p[p.length - 1] || `${raw.id}`;
}

async function pool(items, concurrency, worker) {
  let idx = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (idx < items.length) { const i = idx++; await worker(items[i]); }
  }));
}

async function main() {
  if (!SHARED_DRIVE_ID) { console.error('Set DRIVE_SHARED_DRIVE_ID'); process.exit(1); }
  if (!fs.existsSync(FULL)) { console.error('Run `enrich` first — items-full.jsonl missing'); process.exit(1); }
  const drive = driveClient();

  // resume: which Mimir IDs already uploaded
  const done = new Set();
  await readJsonl(MAPPING, (m) => { if (m && m.mimirId) done.add(m.mimirId); });

  // candidate media items not yet uploaded
  const todo = [];
  await readJsonl(FULL, (raw) => {
    const ty = (raw.itemType || '').toLowerCase();
    if (!MEDIA_TYPES.has(ty)) return;
    if (done.has(raw.id)) return;
    todo.push(raw);
  });
  const list = argLimit ? todo.slice(0, argLimit) : todo;
  console.log(`upload: ${done.size.toLocaleString()} already done, ${list.toLocaleString?.() || list.length} to upload (concurrency ${CONCURRENCY})`);

  const mapOut = fs.createWriteStream(MAPPING, { flags: 'a' });
  let ok = 0, failed = 0, bytes = 0;

  await pool(list, CONCURRENCY, async (raw) => {
    const name = originalName(raw);
    try {
      let url = forceRefresh ? await refreshDownloadUrl(raw.id) : (raw.highRes || raw.proxy);
      if (!url) url = await refreshDownloadUrl(raw.id);
      if (!url) throw new Error('no download url');

      let dl;
      for (let a = 0; a <= RETRIES; a++) {
        try { dl = await axios.get(url, { responseType: 'stream', timeout: 0 }); break; }
        catch (e) {
          if (a === RETRIES) throw e;
          if (e.response && (e.response.status === 403 || e.response.status === 401)) url = await refreshDownloadUrl(raw.id); // expired
          await sleep(800 * Math.pow(2, a));
        }
      }

      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [DEST_FOLDER_ID],
          appProperties: {
            mimirId: String(raw.id),
            itemType: (raw.itemType || '').toLowerCase(),
            sourcePath: (raw.ingestSourceFullPath || '').slice(0, 124), // appProperties value max 124 chars
            mediaCreatedOn: String((raw.metadata && raw.metadata.formData && raw.metadata.formData.default_mediaCreatedOn) || ''),
          },
        },
        media: { body: dl.data },
        fields: 'id,size',
        supportsAllDrives: true,
      });

      const size = Number(res.data.size) || Number(raw.mediaSize) || 0;
      bytes += size;
      mapOut.write(JSON.stringify({ mimirId: raw.id, driveFileId: res.data.id, name, bytes: size }) + '\n');
      if (++ok % 200 === 0) console.log(`  uploaded ${ok.toLocaleString()} · ${(bytes / 1e9).toFixed(1)} GB · failed ${failed}`);
    } catch (e) {
      failed++;
      if (failed % 50 === 1) console.warn(`  ! ${name} (${raw.id}): ${e.message}`);
    }
  });

  await new Promise(r => mapOut.end(r));
  console.log(`\n✓ upload done: ${ok.toLocaleString()} ok, ${failed.toLocaleString()} failed, ${(bytes / 1e9).toFixed(1)} GB`);
  console.log(`  mapping -> ${MAPPING}`);
}

main().catch(e => { console.error('UPLOAD FAILED:', e.message); process.exit(1); });
