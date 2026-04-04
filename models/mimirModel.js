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

  const sourcePath = raw.ingestSourceFullPath || '';
  const parts      = sourcePath.split('/');
  const category   = parts.length > 2 ? parts[parts.length - 2] : null;
  // root folder name (e.g. "PHOTOGRAPHER", "VIDEO2026hires")
  const rootFolder = parts.length > 1 ? parts[0] : null;

  return { id, mediaType, title, thumbnail: `/proxy/thumbnail/${id}`, modified, created, duration, fileSize: raw.mediaSize || null, category, mimeType, sourcePath, rootFolder };
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
    sourcePath:  raw.ingestSourceFullPath || '',
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
  } = opts;

  // Build effective search string from all text fields
  const effectiveSearch = buildSearchString({
    searchString: rawString, searchTitle, searchPeople,
    searchDescription, searchTranscript, searchLabels,
    searchMetadata, searchFile, searchDetectedText,
  });

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

module.exports = { searchAssets, getAssetById, getThumbnailUrl, getStats };
