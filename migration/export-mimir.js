#!/usr/bin/env node
'use strict';
/**
 * Mimir full export — TIME-CRITICAL before the Mimir contract ends.
 *
 * Mimir's offset /search caps at 10,000 (Elasticsearch limit), so we use the
 * SCROLL API for the complete list, then enrich per-item for full metadata.
 *
 * Stages (run in order; enrich/transcripts are resumable):
 *   node migration/export-mimir.js manifest            # all IDs via scroll (fast)
 *   node migration/export-mimir.js enrich [--sample N] # per-item full metadata + size
 *   node migration/export-mimir.js transcripts         # download VTT for items that have one
 *
 * Output (migration/out/):
 *   manifest.jsonl        { id, itemType, title }      — every item
 *   items-full.jsonl      raw GET /items/{id}          — full metadata (resumable)
 *   inventory-report.json totals + storage TB + type breakdown
 *   transcripts/<id>.vtt  subtitle files
 *
 * Reuses the app's Cognito SRP auth (services/mimirAuth) — no extra creds.
 */
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const readline = require('readline');
const axios = require('axios');
const config = require('../config/mimir');
const auth   = require('../services/mimirAuth');

const OUT = path.join(__dirname, 'out');
const F = {
  manifest:   path.join(OUT, 'manifest.jsonl'),
  full:       path.join(OUT, 'items-full.jsonl'),
  report:     path.join(OUT, 'inventory-report.json'),
  transcripts:path.join(OUT, 'transcripts'),
};

const RETRIES = 4;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const api = axios.create({
  baseURL: config.baseUrl,
  timeout: config.requestTimeout || 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});
api.interceptors.request.use(async (cfg) => {
  Object.assign(cfg.headers, await auth.getAuthHeader());
  return cfg;
});

async function withRetry(fn, label) {
  let lastErr;
  for (let a = 0; a <= RETRIES; a++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await sleep(400 * Math.pow(2, a)); }
  }
  throw new Error(`${label} failed: ${lastErr && (lastErr.response ? lastErr.response.status : lastErr.message)}`);
}

// Run an async worker over items with bounded concurrency.
async function pool(items, concurrency, worker) {
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
}

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

// ── Stage 1: manifest via scroll ──────────────────────────────
async function manifest() {
  fs.mkdirSync(OUT, { recursive: true });
  const out = fs.createWriteStream(F.manifest, { flags: 'w' });
  let mScrollId = null, total = 0, written = 0;
  do {
    const params = { scroll: 'true' };
    if (mScrollId) params.mScrollId = mScrollId;
    const data = await withRetry(() => api.get('/search', { params }).then(r => r.data), 'scroll');
    total = data.total || total;
    const items = data.items || [];
    for (const s of items) out.write(JSON.stringify({ id: s.id, itemType: (s.itemType || '').toLowerCase(), title: s.title || s.name || '' }) + '\n');
    written += items.length;
    mScrollId = data.mScrollId || null;
    if (written % 20000 < items.length) console.log(`  manifest ${written.toLocaleString()}/${total.toLocaleString()}`);
    if (!items.length) break;
  } while (mScrollId && written < total);
  await new Promise(r => out.end(r));
  console.log(`✓ manifest: ${written.toLocaleString()} items -> ${F.manifest}`);
}

// ── Stage 2: enrich per item ──────────────────────────────────
async function enrich(sample) {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(F.manifest)) { console.error('Run `manifest` first.'); process.exit(1); }

  // load manifest
  const all = [];
  await readJsonl(F.manifest, (m) => all.push(m));
  // resume: skip already-enriched IDs
  const done = new Set();
  await readJsonl(F.full, (it) => { if (it && it.id) done.add(it.id); });
  let todo = all.filter(m => !done.has(m.id));
  if (sample) {
    // representative sample: shuffle so every type is proportionally covered
    for (let i = todo.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [todo[i], todo[j]] = [todo[j], todo[i]]; }
    todo = todo.slice(0, sample);
  }
  console.log(`enrich: ${all.length.toLocaleString()} total, ${done.size.toLocaleString()} done, ${todo.length.toLocaleString()} to fetch${sample ? ' (random sample)' : ''}`);

  const out = fs.createWriteStream(F.full, { flags: 'a' });
  let n = 0, failed = 0;
  await pool(todo, 8, async (m) => {
    try {
      const raw = await withRetry(() => api.get(`/items/${m.id}`).then(r => r.data), `item ${m.id}`);
      out.write(JSON.stringify(raw) + '\n');
    } catch (e) { failed++; }
    if (++n % 1000 === 0) console.log(`  enriched ${n.toLocaleString()}/${todo.length.toLocaleString()} (failed ${failed})`);
  });
  await new Promise(r => out.end(r));
  console.log(`✓ enrich: +${n.toLocaleString()} (failed ${failed})`);
  if (sample) {
    const perTypeCounts = {};
    for (const m of all) perTypeCounts[m.itemType || 'unknown'] = (perTypeCounts[m.itemType || 'unknown'] || 0) + 1;
    await report({ perTypeCounts });
  } else {
    await report(null);
  }
}

// ── Inventory report (size, types) from items-full.jsonl ──────
async function report(opts) {
  const t = { count: 0, byType: {}, bytesByType: {}, totalBytes: 0, withVtt: 0, withHighRes: 0, noSize: 0 };
  await readJsonl(F.full, (raw) => {
    const ty = (raw.itemType || 'unknown').toLowerCase();
    t.count++; t.byType[ty] = (t.byType[ty] || 0) + 1;
    const sz = Number(raw.mediaSize) || 0;
    if (!sz) t.noSize++;
    t.bytesByType[ty] = (t.bytesByType[ty] || 0) + sz;
    t.totalBytes += sz;
    if (raw.vttUrl) t.withVtt++;
    if (raw.highRes || raw.proxy) t.withHighRes++;
  });
  const gb = t.totalBytes / 1e9;
  const rep = {
    generatedAt: new Date().toISOString(),
    enrichedCount: t.count,
    byType: t.byType,
    sizeByTypeGB: Object.fromEntries(Object.entries(t.bytesByType).map(([k, v]) => [k, +(v / 1e9).toFixed(2)])),
    totalGB: +gb.toFixed(2),
    totalTB: +(gb / 1000).toFixed(3),
    itemsWithTranscript: t.withVtt,
    itemsWithDownloadUrl: t.withHighRes,
    itemsNoSize: t.noSize,
  };
  if (opts && opts.perTypeCounts) {
    // per-type extrapolation: avg size of each type (from sample) × full count of that type
    const counts = opts.perTypeCounts;
    let estBytes = 0;
    const perType = {};
    for (const ty of Object.keys(counts)) {
      const sampleN = t.byType[ty] || 0;
      const avg = sampleN ? (t.bytesByType[ty] || 0) / sampleN : 0;
      const est = avg * counts[ty];
      estBytes += est;
      perType[ty] = { fullCount: counts[ty], sampleN, avgMB: +(avg / 1e6).toFixed(2), estGB: +(est / 1e9).toFixed(1) };
    }
    rep.SAMPLE = true;
    rep.estTotalTB_extrapolated = +(estBytes / 1e12).toFixed(2);
    rep.perTypeEstimate = perType;
  }
  fs.writeFileSync(F.report, JSON.stringify(rep, null, 2));
  console.log('\n=== INVENTORY ===');
  console.log(rep);
  console.log(`-> ${F.report}`);
}

// ── Stage 3: transcripts ──────────────────────────────────────
async function transcripts() {
  fs.mkdirSync(F.transcripts, { recursive: true });
  const targets = [];
  await readJsonl(F.full, (raw) => { if (raw.vttUrl) targets.push({ id: raw.id, url: raw.vttUrl }); });
  const todo = targets.filter(t => !fs.existsSync(path.join(F.transcripts, `${t.id}.vtt`)));
  console.log(`transcripts: ${targets.length.toLocaleString()} have VTT, ${todo.length.toLocaleString()} to download`);
  let n = 0, failed = 0;
  await pool(todo, 8, async (t) => {
    try {
      const res = await withRetry(() => axios.get(t.url, { responseType: 'text', timeout: 15000 }), `vtt ${t.id}`);
      fs.writeFileSync(path.join(F.transcripts, `${t.id}.vtt`), res.data);
    } catch (e) { failed++; }
    if (++n % 500 === 0) console.log(`  vtt ${n.toLocaleString()}/${todo.length.toLocaleString()} (failed ${failed})`);
  });
  console.log(`✓ transcripts: +${n.toLocaleString()} (failed ${failed})`);
}

// ── CLI ───────────────────────────────────────────────────────
const cmd = process.argv[2];
const sampleArg = process.argv.includes('--sample') ? Number(process.argv[process.argv.indexOf('--sample') + 1]) : 0;
(async () => {
  if (cmd === 'manifest') await manifest();
  else if (cmd === 'enrich') await enrich(sampleArg);
  else if (cmd === 'transcripts') await transcripts();
  else if (cmd === 'report') await report(null);
  else { console.log('usage: export-mimir.js  manifest | enrich [--sample N] | transcripts | report'); process.exit(1); }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
