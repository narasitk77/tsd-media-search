'use strict';

const axios  = require('axios');
const config = require('../config/mimir');
const auth   = require('../services/mimirAuth');

// ── Axios instance ─────────────────────────────────────────────
const api = axios.create({
  baseURL: config.baseUrl,
  timeout: config.requestTimeout,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Separate lightweight client for internal metadata-tool calls
const _metaAxios = axios.create({ timeout: 10_000 });
api.interceptors.request.use(async (cfg) => {
  Object.assign(cfg.headers, await auth.getAuthHeader());
  return cfg;
});

// ── Constants ──────────────────────────────────────────────────
const MEDIA_TYPES      = new Set(['image', 'video']);
const FETCH_BATCH      = 500;
const MAX_SCAN         = 5000;
const SCROLL_CACHE_TTL = 5 * 60 * 1000;

// ── Scroll result cache (browse mode) ─────────────────────────
const scrollCache = new Map();

function scrollCacheKey(query, mediaType) {
  return `q:${query.trim()}|t:${mediaType}`;
}

function evictStaleScrollCache() {
  const now = Date.now();
  for (const [k, v] of scrollCache) {
    if (now - v.time > SCROLL_CACHE_TTL) scrollCache.delete(k);
  }
}

// ── Global stats cache ─────────────────────────────────────────
let globalCountCache     = null;
let globalCountCacheTime = 0;
const GLOBAL_CACHE_TTL   = 5 * 60 * 1000;

async function getGlobalCounts() {
  const now = Date.now();
  if (globalCountCache && now - globalCountCacheTime < GLOBAL_CACHE_TTL) {
    return globalCountCache;
  }
  try {
    const r = await api.get('/search', { params: { itemsPerPage: 1, typeCount: 'true' } });
    const counts = {};
    if (Array.isArray(r.data)) {
      r.data.forEach(({ key, doc_count }) => { counts[key] = doc_count; });
    }
    globalCountCache     = counts;
    globalCountCacheTime = now;
    return counts;
  } catch {
    return globalCountCache || {};
  }
}

// ── Normalise ──────────────────────────────────────────────────

function normaliseItem(raw) {
  const id        = raw.id || '';
  const mediaType = (raw.itemType || '').toLowerCase();
  const formData  = (raw.metadata && raw.metadata.formData) || {};
  const title     = formData.default_title || raw.originalFileName || raw.name || raw.title || 'ไม่มีชื่อ';
  const modified  = raw.modifiedOn || null;
  const created   = formData.default_mediaCreatedOn || formData.default_createdOn || raw.createdOn || null;
  const techData  = (raw.technicalMetadata && raw.technicalMetadata.formData) || {};
  const duration  = techData.technical_media_duration ? Math.round(techData.technical_media_duration / 1000) : null;
  const mimeType  = raw.mediaType || null;

  const sourcePath   = raw.ingestSourceFullPath || '';
  const parts        = sourcePath.split('/');
  const category     = parts.length > 2 ? parts[parts.length - 2] : null;
  const rootFolder   = parts.length > 1 ? parts[0] : null;
  // Extract photographer name: path like "PHOTOGRAPHER/First Last/..."
  const photographer = (parts[0] || '').toUpperCase() === 'PHOTOGRAPHER' && parts[1]
    ? parts[1].trim()
    : null;

  return { id, mediaType, title, thumbnail: `/proxy/thumbnail/${id}`, modified, created, duration, fileSize: raw.mediaSize || null, category, mimeType, sourcePath, rootFolder, photographer, downloadUrl: raw.highRes || raw.proxy || null };
}

function normaliseItemFull(raw) {
  const base     = normaliseItem(raw);
  const techData = (raw.technicalMetadata && raw.technicalMetadata.formData) || {};
  return {
    ...base,
    previewUrl:  raw.proxy     || null,
    thumbUrl:    raw.thumbnail || null,
    highResUrl:  raw.highRes   || null,
    vttUrl:      raw.vttUrl    || null,
    width:       techData.technical_video_width  || techData.technical_image_width  || null,
    height:      techData.technical_video_height || techData.technical_image_height || null,
    fileType:    techData.technical_media_container_format || techData.technical_image_file_type || null,
    duration:    techData.technical_media_duration ? Math.round(techData.technical_media_duration / 1000) : base.duration,
    sourcePath:    raw.ingestSourceFullPath || '',
    photographer:  base.photographer,
  };
}

// ── Client-side filter pipeline ────────────────────────────────

function applyClientFilters(items, {
  mediaType, dateFrom, dateTo,
  durationMin, durationMax, locationFilter, sortBy, sortOrder,
}) {
  let out = items;

  // Type filter (already applied at fetch time, but double-check)
  if (mediaType !== 'all') {
    out = out.filter(i => i.mediaType === mediaType);
  }

  // Date range
  if (dateFrom || dateTo) {
    const fromTs = dateFrom ? new Date(dateFrom).getTime()               : 0;
    const toTs   = dateTo   ? new Date(dateTo + 'T23:59:59Z').getTime()  : Infinity;
    out = out.filter(i => {
      const d = i.modified || i.created;
      if (!d) return true;
      const t = new Date(d).getTime();
      return t >= fromTs && t <= toTs;
    });
  }

  // Duration range (seconds)
  if (durationMin !== null && durationMin !== '' && !isNaN(Number(durationMin))) {
    const min = Number(durationMin);
    out = out.filter(i => i.duration !== null && i.duration >= min);
  }
  if (durationMax !== null && durationMax !== '' && !isNaN(Number(durationMax))) {
    const max = Number(durationMax);
    out = out.filter(i => i.duration !== null && i.duration <= max);
  }

  // Ingest location / root folder filter
  if (locationFilter && locationFilter.trim()) {
    const loc = locationFilter.trim().toLowerCase();
    out = out.filter(i =>
      (i.sourcePath || '').toLowerCase().includes(loc) ||
      (i.rootFolder || '').toLowerCase().includes(loc) ||
      (i.category   || '').toLowerCase().includes(loc)
    );
  }

  // Sort
  if (sortBy === 'title') {
    out.sort((a, b) => {
      const cmp = (a.title || '').localeCompare(b.title || '', 'th');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  } else {
    out.sort((a, b) => {
      const ta = new Date(a.modified || a.created || 0).getTime();
      const tb = new Date(b.modified || b.created || 0).getTime();
      return sortOrder === 'asc' ? ta - tb : tb - ta;
    });
  }

  return out;
}

// ── Build search string from multi-field form ──────────────────

function buildSearchString(searchFields) {
  const { searchTitle, searchPeople, searchDescription, searchTranscript,
          searchLabels, searchMetadata, searchFile, searchDetectedText,
          searchString } = searchFields;

  // Collect all non-empty field terms
  const terms = [searchString, searchTitle, searchPeople, searchDescription,
                 searchTranscript, searchLabels, searchMetadata, searchFile,
                 searchDetectedText]
    .map(t => (t || '').trim())
    .filter(Boolean);

  // Combine unique terms
  const unique = [...new Set(terms)];
  return unique.join(' ');
}

// ── Search: vector / semantic mode ────────────────────────────

async function searchByVector(query, { mediaType = 'all', page = 1, pageSize = 24 } = {}) {
  const baseUrl  = process.env.METADATA_TOOL_URL || 'http://metadata-tool:8000';
  const itemType = (mediaType === 'image' || mediaType === 'video') ? mediaType : undefined;
  const params   = { q: query, limit: 50 };
  if (itemType) params.item_type = itemType;

  const r   = await _metaAxios.get(`${baseUrl}/api/vector/search`, { params });
  const raw = (r.data && r.data.results) || [];

  const items = raw.map(v => ({
    id:           v.item_id,
    mediaType:    v.item_type  || 'image',
    title:        v.title      || 'ไม่มีชื่อ',
    thumbnail:    `/proxy/thumbnail/${v.item_id}`,
    created:      v.media_created_on || null,
    modified:     null,
    duration:     null,
    fileSize:     null,
    category:     null,
    mimeType:     null,
    sourcePath:   null,
    rootFolder:   null,
    photographer: v.ai_persons || null,
    score:        v.score,
  }));

  const start = (page - 1) * pageSize;
  return {
    items:      items.slice(start, start + pageSize),
    total:      items.length,
    apiTotal:   items.length,
    fetched:    items.length,
    exhausted:  true,
    page, pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    mode:       'semantic',
  };
}

// ── Search: keyword mode (regular API) ────────────────────────

async function searchByKeyword(opts) {
  const {
    searchString, mediaType, page, pageSize,
    dateFrom, dateTo, durationMin, durationMax,
    locationFilter, sortBy, sortOrder,
  } = opts;

  let allMedia = [];
  let scanned  = 0;
  let apiTotal = 0;

  while (scanned < MAX_SCAN) {
    const r     = await api.get('/search', { params: { searchString, itemsPerPage: FETCH_BATCH, from: scanned } });
    const batch = (r.data._embedded && r.data._embedded.collection) || [];
    if (!batch.length) break;

    apiTotal = r.data.totalAcrossPages || r.data.total || 0;

    for (const raw of batch) {
      const mtype = (raw.itemType || '').toLowerCase();
      if (!MEDIA_TYPES.has(mtype)) continue;
      allMedia.push(normaliseItem(raw));
    }

    scanned += batch.length;
    if (scanned >= apiTotal) break;
  }

  // Apply client-side filters (date, duration, location, sort)
  const filtered = applyClientFilters(allMedia, {
    mediaType, dateFrom, dateTo, durationMin, durationMax, locationFilter, sortBy, sortOrder,
  });

  const start = (page - 1) * pageSize;
  return {
    items:      filtered.slice(start, start + pageSize),
    total:      filtered.length,
    apiTotal,
    scanned,
    fetched:    filtered.length,
    exhausted:  true,
    page, pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    mode:       'keyword',
  };
}

// ── Search: scroll mode (browse all) ──────────────────────────

async function fetchScrollBatch(query, mScrollId) {
  const params = { scroll: 'true' };
  if (query.trim()) params.searchString = query.trim();
  if (mScrollId)    params.mScrollId    = mScrollId;
  const r = await api.get('/search', { params });
  return {
    rawItems:  r.data.items     || [],
    mScrollId: r.data.mScrollId || null,
    total:     r.data.total     || 0,
  };
}

function filterScrollItems(rawItems, mediaType) {
  const out = [];
  for (const raw of rawItems) {
    const mtype = (raw.itemType || '').toLowerCase();
    if (!MEDIA_TYPES.has(mtype)) continue;
    if (mediaType === 'image' && mtype !== 'image') continue;
    if (mediaType === 'video' && mtype !== 'video') continue;
    out.push({
      id:         raw.id,
      mediaType:  mtype,
      title:      raw.title || raw.name || 'ไม่มีชื่อ',
      thumbnail:  `/proxy/thumbnail/${raw.id}`,
      duration:   null,
      category:   null,
      created:    null,
      modified:   null,
      fileSize:   null,
      mimeType:   null,
      sourcePath: null,
      rootFolder: null,
    });
  }
  return out;
}

async function searchByScroll({ query, mediaType, page, pageSize }) {
  evictStaleScrollCache();

  const cacheKey   = scrollCacheKey(query, mediaType);
  const now        = Date.now();
  const neededUpTo = page * pageSize;

  let entry = scrollCache.get(cacheKey);

  const expand = async (ent) => {
    while (ent.mediaItems.length < neededUpTo && ent.mScrollId) {
      const batch    = await fetchScrollBatch(query, ent.mScrollId);
      const filtered = filterScrollItems(batch.rawItems, mediaType);
      ent.mediaItems.push(...filtered);
      ent.mScrollId  = batch.mScrollId;
      if (!batch.rawItems.length) break;
    }
  };

  if (entry && now - entry.time < SCROLL_CACHE_TTL &&
      entry.query === query && entry.mediaType === mediaType) {
    await expand(entry);
    entry.time = now;
  } else {
    const batch    = await fetchScrollBatch(query, null);
    const filtered = filterScrollItems(batch.rawItems, mediaType);
    entry = {
      query, mediaType,
      mediaItems: filtered,
      mScrollId:  batch.mScrollId,
      apiTotal:   batch.total,
      time:       now,
    };
    await expand(entry);
    scrollCache.set(cacheKey, entry);
  }

  const start     = (page - 1) * pageSize;
  const items     = entry.mediaItems.slice(start, start + pageSize);
  const fetched   = entry.mediaItems.length;
  const exhausted = !entry.mScrollId;
  const total     = exhausted ? fetched : (entry.apiTotal || fetched);

  return {
    items,
    total,
    apiTotal:   entry.apiTotal,
    fetched,
    exhausted,
    page, pageSize,
    totalPages: exhausted
      ? Math.max(1, Math.ceil(fetched / pageSize))
      : Math.max(1, Math.ceil(total  / pageSize)),
    mode: 'scroll',
  };
}

// ── Public: searchAssets ───────────────────────────────────────

async function searchAssets(opts) {
  const {
    searchString:    rawString   = '',
    searchTitle                  = '',
    searchPeople                 = '',
    searchDescription            = '',
    searchTranscript             = '',
    searchLabels                 = '',
    searchMetadata               = '',
    searchFile                   = '',
    searchDetectedText           = '',
    mediaType                    = 'all',
    page                         = 1,
    pageSize                     = config.defaultPageSize,
    dateFrom                     = null,
    dateTo                       = null,
    durationMin                  = null,
    durationMax                  = null,
    locationFilter               = '',
    sortBy                       = 'date',
    sortOrder                    = 'desc',
    semantic                     = false,
  } = opts;

  // Build effective search string from all text fields
  const effectiveSearch = buildSearchString({
    searchString: rawString, searchTitle, searchPeople,
    searchDescription, searchTranscript, searchLabels,
    searchMetadata, searchFile, searchDetectedText,
  });

  // Semantic / vector search mode
  if (semantic && effectiveSearch) {
    return searchByVector(effectiveSearch, { mediaType, page, pageSize });
  }

  const hasAdvancedFilters = dateFrom || dateTo ||
    (durationMin !== null && durationMin !== '') ||
    (durationMax !== null && durationMax !== '') ||
    locationFilter;

  if (effectiveSearch) {
    return searchByKeyword({
      searchString: effectiveSearch, mediaType, page, pageSize,
      dateFrom, dateTo, durationMin, durationMax,
      locationFilter, sortBy, sortOrder,
    });
  }

  // Browse mode — use scroll API; advanced filters still applied client-side
  if (hasAdvancedFilters) {
    // For browse + duration/location filter we need full metadata
    // Use keyword-mode with empty string to get regular results with metadata
    return searchByKeyword({
      searchString: '', mediaType, page, pageSize,
      dateFrom, dateTo, durationMin, durationMax,
      locationFilter, sortBy, sortOrder,
    });
  }

  return searchByScroll({ query: '', mediaType, page, pageSize });
}

// ── Global stats ───────────────────────────────────────────────
async function getStats() {
  const counts = await getGlobalCounts();
  return {
    images:  counts.image  || 0,
    videos:  counts.video  || 0,
    total:   (counts.image || 0) + (counts.video || 0),
  };
}

// ── Thumbnail proxy ────────────────────────────────────────────
async function getThumbnailUrl(itemId) {
  const r      = await api.get(`/items/${itemId}/thumbnails/urls`);
  const thumbs = r.data && r.data.thumbnails;
  if (thumbs && thumbs.length) return thumbs[0].url;
  throw new Error('No thumbnail available');
}

// ── Asset detail ───────────────────────────────────────────────
async function getAssetById(id) {
  const r = await api.get(`/items/${id}`);
  return normaliseItemFull(r.data);
}

// Raw Mimir response for a single item — used by admin debug route only
async function getRawAsset(id) {
  const r = await api.get(`/items/${id}`);
  return r.data;
}

// ── VTT proxy — fetch subtitle content server-side (avoids CORS) ──
async function getVttContent(id) {
  const r = await api.get(`/items/${id}`);
  const vttUrl = r.data.vttUrl;
  if (!vttUrl) throw new Error('No VTT');
  const res = await _metaAxios.get(vttUrl, { responseType: 'text', timeout: 10_000 });
  return res.data;
}

// ── Recent folders (last N days) ───────────────────────────────
const SKIP_FOLDER_WORDS = /\b(hires?|hi[-_]?res|lowres?|logo|clip|thum(b|nail)?s?|proxy|web|raw|original|preview)\b/i;

async function getRecentFolders(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const r = await api.get('/search', { params: { itemsPerPage: 500, from: 0 } });
    const batch = (r.data._embedded && r.data._embedded.collection) || [];
    const folderMap = {};
    for (const raw of batch) {
      const mtype = (raw.itemType || '').toLowerCase();
      if (!MEDIA_TYPES.has(mtype)) continue;
      const item   = normaliseItem(raw);
      const dateMs = new Date(item.modified || item.created || 0).getTime();
      if (dateMs < cutoff) continue;

      // Derive immediate folder and its parent from sourcePath
      const parts   = (item.sourcePath || '').split('/').filter(Boolean);
      // parts: [root, ..., parentFolder, immediateFolder, filename]
      const folder  = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || null);
      if (!folder) continue;
      if (SKIP_FOLDER_WORDS.test(folder)) continue;

      const parent  = parts.length >= 3 ? parts[parts.length - 3] : null;
      const key     = folder;
      if (!folderMap[key]) folderMap[key] = { folder, parent, count: 0, latest: null };
      folderMap[key].count++;
      const d = item.modified || item.created;
      if (!folderMap[key].latest || d > folderMap[key].latest) folderMap[key].latest = d;
    }
    return Object.values(folderMap).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
  } catch (_) { return []; }
}

// ── Mimir Folder API (uses /folders endpoint) ─────────────────

// Fetch all Mimir folders in one call (paginated if needed)
async function _fetchMimirFolders() {
  const allFolders = [];
  let from = 0;
  const batch = 500;
  while (true) {
    const r = await api.get('/folders', { params: { itemsPerPage: batch, from } }).catch(() => null);
    if (!r) break;
    const items = (r.data._embedded && r.data._embedded.collection) || r.data.items || [];
    if (!items.length) break;
    allFolders.push(...items);
    const total = r.data.totalAcrossPages || r.data.total || 0;
    from += items.length;
    if (from >= total) break;
  }
  return allFolders;
}

// Browse by Mimir folder ID — queries search API with folderId param
async function browseFolderByMimirId(folderId, { mediaType = 'all', page = 1, pageSize = 48 } = {}) {
  let allMedia = [];
  let scanned  = 0;
  let apiTotal = 0;
  while (scanned < MAX_SCAN) {
    const r = await api.get('/search', { params: { folderId, itemsPerPage: FETCH_BATCH, from: scanned } }).catch(() => null);
    if (!r) break;
    const batch = (r.data._embedded && r.data._embedded.collection) || [];
    if (!batch.length) break;
    apiTotal = r.data.totalAcrossPages || r.data.total || 0;
    for (const raw of batch) {
      const mtype = (raw.itemType || '').toLowerCase();
      if (!MEDIA_TYPES.has(mtype)) continue;
      allMedia.push(normaliseItem(raw));
    }
    scanned += batch.length;
    if (scanned >= apiTotal) break;
  }
  if (mediaType !== 'all') allMedia = allMedia.filter(i => i.mediaType === mediaType);
  const start = (page - 1) * pageSize;
  return {
    items:      allMedia.slice(start, start + pageSize),
    total:      allMedia.length,
    apiTotal,   fetched: allMedia.length,
    page,       pageSize,
    totalPages: Math.max(1, Math.ceil(allMedia.length / pageSize)),
    exhausted:  true,
    mode:       'mimir-folder-id',
  };
}

// Raw Mimir API probe for admin debugging
async function debugMimirApiPath(path, params) {
  const r = await api.get(`/${path}`, { params });
  return r.data;
}

// ── Folder tree + per-folder asset cache (one shared scan) ────
//
// Tries Mimir /folders API first to get the real folder structure.
// Falls back to building tree from ingestSourceFullPath if folders API fails.
//
const FOLDER_TREE_CACHE_TTL = 10 * 60 * 1000; // 10 min
let folderTreeCache    = null;
let folderAssetsCache  = null; // Map<folderPath, item[]>
let folderTreeCacheTime = 0;
let _warmPromise       = null; // dedup concurrent warm requests

async function _buildFolderCaches() {
  const folderCounts = {};
  const assetsMap    = new Map(); // directFolderPath → normaliseItem[]
  const BATCH        = 500;
  const PARALLEL     = 5; // concurrent requests per round

  // ── Step 0: try Mimir /folders API for complete folder structure ─
  let mimirFolderMap = null; // id → { id, name, parentId }
  try {
    const raw = await _fetchMimirFolders();
    if (raw.length > 0) {
      mimirFolderMap = {};
      for (const f of raw) {
        const id       = f.id || f.folderId;
        const name     = f.name || f.folderName || id;
        const parentId = f.parentFolderId || f.parentId || null;
        if (id) mimirFolderMap[id] = { id, name, parentId };
      }
    }
  } catch (_) {
    mimirFolderMap = null;
  }

  // ── Step 1: get true total ─────────────────────────────────
  const r0       = await api.get('/search', { params: { itemsPerPage: 1, from: 0 } });
  const apiTotal = r0.data.totalAcrossPages || r0.data.total || 0;
  if (!apiTotal) {
    folderTreeCache     = [];
    folderAssetsCache   = new Map();
    folderTreeCacheTime = Date.now();
    return;
  }

  // ── Step 2: build offset list and fetch in parallel rounds ─
  const offsets = [];
  for (let i = 0; i < apiTotal; i += BATCH) offsets.push(i);

  // folderId → item[] (for Mimir-ID-based folders)
  const mimirFolderAssets = {}; // id → normaliseItem[]

  function processRaw(raw) {
    const mtype      = (raw.itemType || '').toLowerCase();
    const sourcePath = raw.ingestSourceFullPath || '';
    const parts      = sourcePath.split('/').filter(Boolean);

    // Track by Mimir folder ID if available (catches items with missing/short paths)
    const rawFolderId = raw.folderId || raw.parentFolderId || null;
    if (rawFolderId && MEDIA_TYPES.has(mtype)) {
      if (!mimirFolderAssets[rawFolderId]) mimirFolderAssets[rawFolderId] = [];
      mimirFolderAssets[rawFolderId].push(normaliseItem(raw));
    }

    if (parts.length < 2) return;

    // Count ALL item types for the folder tree (matches Mimir's own view)
    for (let d = 1; d < parts.length; d++) {
      const fp = parts.slice(0, d).join('/');
      folderCounts[fp] = (folderCounts[fp] || 0) + 1;
    }

    // Only store image/video in assetsMap (for browsing)
    if (MEDIA_TYPES.has(mtype)) {
      const directFolder = parts.slice(0, -1).join('/');
      if (!assetsMap.has(directFolder)) assetsMap.set(directFolder, []);
      assetsMap.get(directFolder).push(normaliseItem(raw));
    }
  }

  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const chunk = offsets.slice(i, i + PARALLEL);
    const responses = await Promise.all(
      chunk.map(from =>
        api.get('/search', { params: { itemsPerPage: BATCH, from } }).catch(() => null)
      )
    );
    for (const r of responses) {
      if (!r) continue;
      const batch = (r.data._embedded && r.data._embedded.collection) || [];
      batch.forEach(processRaw);
    }
  }

  // ── Step 3: merge Mimir folder API into tree (if available) ─
  // Build path for each Mimir folder by walking up the parent chain
  if (mimirFolderMap) {
    function buildMimirPath(id, visited = new Set()) {
      if (visited.has(id)) return null; // cycle guard
      visited.add(id);
      const f = mimirFolderMap[id];
      if (!f) return null;
      if (!f.parentId || !mimirFolderMap[f.parentId]) return f.name;
      const parentPath = buildMimirPath(f.parentId, visited);
      return parentPath ? `${parentPath}/${f.name}` : f.name;
    }

    for (const [folderId, f] of Object.entries(mimirFolderMap)) {
      const fp = buildMimirPath(folderId);
      if (!fp) continue;
      f._path = fp; // cache computed path

      // Add to folderCounts if not already there (from ingestSourceFullPath scan)
      if (!folderCounts[fp]) {
        const assets = mimirFolderAssets[folderId] || [];
        folderCounts[fp] = assets.length;
      }

      // Merge assets into assetsMap
      const assets = mimirFolderAssets[folderId] || [];
      if (assets.length > 0 && !assetsMap.has(fp)) {
        assetsMap.set(fp, assets);
      }
    }
  }

  // Build nested tree
  const nodeMap = {};
  const roots   = [];
  for (const p of Object.keys(folderCounts).sort()) {
    const segs = p.split('/');
    const node = { name: segs[segs.length - 1], path: p, count: folderCounts[p], children: [] };
    nodeMap[p] = node;
    if (segs.length === 1) {
      roots.push(node);
    } else {
      const parent = segs.slice(0, -1).join('/');
      (nodeMap[parent] ? nodeMap[parent].children : roots).push(node);
    }
  }
  function sortNodes(nodes) {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    nodes.forEach(n => sortNodes(n.children));
  }
  sortNodes(roots);

  folderTreeCache     = roots;
  folderAssetsCache   = assetsMap;
  folderTreeCacheTime = Date.now();
}

async function _ensureFolderCaches() {
  const now = Date.now();
  if (folderTreeCache && now - folderTreeCacheTime < FOLDER_TREE_CACHE_TTL) return;
  if (!_warmPromise) {
    _warmPromise = _buildFolderCaches().finally(() => { _warmPromise = null; });
  }
  await _warmPromise;
}

async function getFolderTree() {
  await _ensureFolderCaches();
  return folderTreeCache;
}

// ── Browse folder assets (served from cache — instant) ────────
async function browseFolderAssets(folderPath, { mediaType = 'all', page = 1, pageSize = 48 } = {}) {
  await _ensureFolderCaches();

  // Collect items from this folder and all subfolders
  const fp = folderPath.toLowerCase();
  let items = [];
  for (const [path, pathItems] of folderAssetsCache.entries()) {
    if (path.toLowerCase() === fp || path.toLowerCase().startsWith(fp + '/')) {
      items.push(...pathItems);
    }
  }

  if (mediaType !== 'all') items = items.filter(i => i.mediaType === mediaType);

  // Sort by date desc
  items.sort((a, b) => {
    const da = new Date(a.modified || a.created || 0).getTime();
    const db = new Date(b.modified || b.created || 0).getTime();
    return db - da;
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items:      items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    apiTotal:   total,
    fetched:    total,
    exhausted:  true,
    mode:       'browse',
  };
}

// ── Collect all download URLs for a folder (ZIP — from cache) ─
async function browseFolderItemUrls(folderPath) {
  await _ensureFolderCaches();

  const fp  = folderPath.toLowerCase();
  const out = [];
  for (const [path, items] of folderAssetsCache.entries()) {
    if (path.toLowerCase() === fp || path.toLowerCase().startsWith(fp + '/')) {
      for (const item of items) {
        if (!item.downloadUrl) continue;
        const nameParts = (item.sourcePath || item.id).split('/');
        out.push({ id: item.id, filename: nameParts[nameParts.length - 1] || item.id, url: item.downloadUrl });
      }
    }
  }
  return out;
}

// Warm the cache in background 5 s after startup
setTimeout(() => {
  _ensureFolderCaches().catch(err => console.warn('[mimirModel] folder cache warm-up failed:', err.message));
}, 5000);

// Force-expire folder cache (used by admin cache-bust endpoint)
function invalidateFolderCache() {
  folderTreeCache     = null;
  folderAssetsCache   = null;
  folderTreeCacheTime = 0;
}

// ── Search folders by name/path (returns flat list of matching nodes) ──
async function searchFolders(query, { limit = 12 } = {}) {
  if (!query || !query.trim()) return [];
  await _ensureFolderCaches();
  if (!folderTreeCache) return [];

  const q = query.trim().toLowerCase();
  const results = [];

  function walk(nodes) {
    for (const node of nodes) {
      const nameMatch = node.name.toLowerCase().includes(q);
      const pathMatch = node.path.toLowerCase().includes(q);
      if (nameMatch || pathMatch) results.push(node);
      if (node.children && node.children.length) walk(node.children);
    }
  }
  walk(folderTreeCache);

  // Sort: exact name match first, then name contains, then path contains
  results.sort((a, b) => {
    const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    const ae = an === q, be = bn === q;
    if (ae !== be) return ae ? -1 : 1;
    const as = an.startsWith(q), bs = bn.startsWith(q);
    if (as !== bs) return as ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  return results.slice(0, limit);
}

module.exports = { searchAssets, searchFolders, getAssetById, getRawAsset, getThumbnailUrl, getVttContent, getStats, getRecentFolders, getFolderTree, browseFolderAssets, browseFolderByMimirId, browseFolderItemUrls, invalidateFolderCache, debugMimirApiPath };
