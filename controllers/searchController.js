'use strict';

const mimirModel = require('../models/mimirModel');
const logModel   = require('../models/logModel');

const VALID_SORT_BY    = new Set(['date', 'title']);
const VALID_SORT_ORDER = new Set(['asc', 'desc']);
const VALID_PAGE_SIZES = new Set([24, 48, 96]);

function str(v) { return (v || '').trim(); }

// ── Home ──────────────────────────────────────────────────────
async function index(req, res) {
  let stats = { images: 0, videos: 0, total: 0 };
  let recentFolders = [];
  try { [stats, recentFolders] = await Promise.all([mimirModel.getStats(), mimirModel.getRecentFolders(7)]); } catch (_) {}

  res.render('index', {
    title:             'Mimir Media Search',
    results:           null,
    query:             '',
    mediaType:         'all',
    page:              1,
    totalPages:        0,
    total:             0,
    fetched:           0,
    exhausted:         true,
    mode:              null,
    // Advanced search fields
    searchTitle:       '',
    searchPeople:      '',
    searchDescription: '',
    searchTranscript:  '',
    searchLabels:      '',
    searchMetadata:    '',
    searchFile:        '',
    searchDetectedText:'',
    dateFrom:          '',
    dateTo:            '',
    durationMin:       '',
    durationMax:       '',
    locationFilter:    '',
    sortBy:            'date',
    sortOrder:         'desc',
    pageSize:          24,
    stats,
    recentFolders,
    error:             null,
  });
}

// ── Search ─────────────────────────────────────────────────────
async function search(req, res) {
  const q                = str(req.query.q);
  const mediaType        = ['all', 'image', 'video'].includes(req.query.type) ? req.query.type : 'all';
  const page             = Math.max(1, parseInt(req.query.page, 10) || 1);
  const searchTitle      = str(req.query.searchTitle);
  const searchPeople     = str(req.query.searchPeople);
  const searchDescription= str(req.query.searchDescription);
  const searchTranscript = str(req.query.searchTranscript);
  const searchLabels     = str(req.query.searchLabels);
  const searchMetadata   = str(req.query.searchMetadata);
  const searchFile       = str(req.query.searchFile);
  const searchDetectedText = str(req.query.searchDetectedText);
  const dateFrom         = str(req.query.dateFrom);
  const dateTo           = str(req.query.dateTo);
  const durationMin      = str(req.query.durationMin);
  const durationMax      = str(req.query.durationMax);
  const locationFilter   = str(req.query.locationFilter);
  const sortBy           = VALID_SORT_BY.has(req.query.sortBy)       ? req.query.sortBy    : 'date';
  const sortOrder        = VALID_SORT_ORDER.has(req.query.sortOrder) ? req.query.sortOrder : 'desc';
  const pageSize         = VALID_PAGE_SIZES.has(parseInt(req.query.pageSize, 10))
    ? parseInt(req.query.pageSize, 10) : 24;

  try {
    const data = await mimirModel.searchAssets({
      searchString:    q,
      searchTitle, searchPeople, searchDescription,
      searchTranscript, searchLabels, searchMetadata,
      searchFile, searchDetectedText,
      mediaType, page, pageSize,
      dateFrom, dateTo, durationMin, durationMax,
      locationFilter, sortBy, sortOrder,
    });

    // Build a display query label for the results header
    const displayQuery = [q, searchTitle, searchPeople, searchDescription,
      searchTranscript, searchLabels, searchMetadata, searchFile, searchDetectedText]
      .filter(Boolean).join(' ');

    logModel.log(req.user && req.user.email, 'search', {
      q, searchTitle, searchPeople, searchDescription,
      searchTranscript, searchLabels, searchMetadata,
      searchFile, searchDetectedText,
      dateFrom, dateTo, durationMin, durationMax, locationFilter,
      mediaType, sortBy, sortOrder, pageSize, page,
      total: data.total,
    });

    res.render('index', {
      title:      displayQuery ? `"${displayQuery}" — Mimir Media Search` : 'Mimir Media Search',
      results:    data.items,
      query:      q,
      mediaType,
      page:       data.page,
      totalPages: data.totalPages,
      total:      data.total,
      apiTotal:   data.apiTotal,
      fetched:    data.fetched,
      exhausted:  data.exhausted,
      mode:       data.mode,
      searchTitle, searchPeople, searchDescription,
      searchTranscript, searchLabels, searchMetadata,
      searchFile, searchDetectedText,
      dateFrom, dateTo, durationMin, durationMax,
      locationFilter, sortBy, sortOrder, pageSize,
      displayQuery,
      stats: null,
      error: null,
    });
  } catch (err) {
    console.error('[searchController] error:', err.message);
    const status = err.response && err.response.status;
    const msg    = (status === 401 || status === 403)
      ? 'API ไม่มีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลระบบ'
      : 'ไม่สามารถเชื่อมต่อ Mimir ได้ กรุณาลองใหม่อีกครั้ง';
    res.render('index', {
      title: 'Mimir Media Search', results: [], query: q, mediaType,
      page: 1, totalPages: 0, total: 0, apiTotal: 0,
      fetched: 0, exhausted: true, mode: null,
      searchTitle, searchPeople, searchDescription,
      searchTranscript, searchLabels, searchMetadata,
      searchFile, searchDetectedText,
      dateFrom, dateTo, durationMin, durationMax,
      locationFilter, sortBy, sortOrder, pageSize,
      displayQuery: q, stats: null, error: msg,
    });
  }
}

// ── Thumbnail proxy ────────────────────────────────────────────
async function thumbnailProxy(req, res) {
  try {
    const url = await mimirModel.getThumbnailUrl(req.params.id);
    res.redirect(302, url);
  } catch (_) {
    res.redirect(302, '/images/placeholder.svg');
  }
}

// ── Asset detail (JSON) ────────────────────────────────────────
async function assetDetail(req, res) {
  try {
    const asset = await mimirModel.getAssetById(req.params.id);
    logModel.log(req.user && req.user.email, 'view', { assetId: req.params.id, title: asset.title, mediaType: asset.mediaType });
    res.json({ success: true, asset });
  } catch (err) {
    console.error('[assetDetail] error:', err.message);
    res.status((err.response && err.response.status) || 500)
       .json({ success: false, message: err.message });
  }
}

module.exports = { index, search, thumbnailProxy, assetDetail };
