'use strict';

const axios      = require('axios');
const archiver   = require('archiver');
const mimirModel = require('../models/mimirModel');
const logModel   = require('../models/logModel');

const SAFE_PATH = /^[a-zA-Z0-9_\- ./]+$/;
const ZIP_FILE_LIMIT = 300; // max files per ZIP

// ── Folder list (root level) ───────────────────────────────────
async function folderList(req, res) {
  const tree = await mimirModel.getFolderTree();
  res.render('browse', {
    title:      'เลือกโฟลเดอร์ — Mimir Media Search',
    mode:       'list',
    tree,
    folder:     null,
    breadcrumb: [],
    results:    [],
    subFolders: [],
    mediaType:  'all',
    page:       1,
    totalPages: 0,
    total:      0,
  });
}

// ── Folder contents ────────────────────────────────────────────
async function folderContents(req, res) {
  const folderPath = (req.query.path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!folderPath) return res.redirect('/browse');

  const mediaType = ['all', 'image', 'video'].includes(req.query.type) ? req.query.type : 'all';
  const page      = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize  = 48;

  const parts      = folderPath.split('/');
  const breadcrumb = parts.map((name, i) => ({
    name,
    path: parts.slice(0, i + 1).join('/'),
  }));

  const [tree, data] = await Promise.all([
    mimirModel.getFolderTree(),
    mimirModel.browseFolderAssets(folderPath, { mediaType, page, pageSize }),
  ]);

  // Sub-folders: find this node in the deep tree
  const subFolders = findNodeChildren(tree, folderPath);

  logModel.log(req.user && req.user.email, 'browse', {
    folderPath, mediaType, page, total: data.total,
  });

  res.render('browse', {
    title:      `${parts[parts.length - 1]} — Mimir Media Search`,
    mode:       'folder',
    tree,
    folder:     folderPath,
    breadcrumb,
    subFolders,
    results:    data.items,
    mediaType,
    page:       data.page,
    totalPages: data.totalPages,
    total:      data.total,
  });
}

// ── ZIP download (streams from Wasabi through server) ─────────
async function folderZip(req, res) {
  const folderPath = (req.query.path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!folderPath || !SAFE_PATH.test(folderPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  let items;
  try {
    items = await mimirModel.browseFolderItemUrls(folderPath);
  } catch (err) {
    console.error('[folderZip] browseFolderItemUrls error:', err.message);
    return res.status(500).json({ error: 'ไม่สามารถโหลดรายการไฟล์ได้' });
  }

  if (items.length === 0) {
    return res.status(404).json({ error: 'ไม่พบไฟล์ในโฟลเดอร์นี้' });
  }

  const capped  = items.slice(0, ZIP_FILE_LIMIT);
  const folderName = folderPath.split('/').pop();
  const zipName    = `${folderName}.zip`.replace(/[^a-zA-Z0-9._\-]/g, '_');

  logModel.log(req.user && req.user.email, 'folder_zip', {
    folderPath, total: items.length, zipped: capped.length,
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 0 } }); // level 0 = store only (fast)
  archive.pipe(res);

  archive.on('error', function (err) {
    console.error('[folderZip] archive error:', err.message);
    res.end();
  });

  // Add files one-by-one (stream from Wasabi)
  for (const item of capped) {
    try {
      const r = await axios.get(item.url, { responseType: 'stream', timeout: 30_000 });
      archive.append(r.data, { name: item.filename });
    } catch (e) {
      console.warn('[folderZip] skip', item.filename, e.message);
    }
  }

  await archive.finalize();
}

// ── Helper: walk deep tree to find children of a path ─────────
function findNodeChildren(tree, targetPath) {
  function walk(nodes) {
    for (const n of nodes) {
      if (n.path === targetPath) return n.children || [];
      const found = walk(n.children || []);
      if (found !== null) return found;
    }
    return null;
  }
  return walk(tree) || [];
}

module.exports = { folderList, folderContents, folderZip };
