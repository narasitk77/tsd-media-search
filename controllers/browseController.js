'use strict';

const mimirModel = require('../models/mimirModel');
const logModel   = require('../models/logModel');

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

  // Build breadcrumb from path segments
  const parts      = folderPath.split('/');
  const breadcrumb = parts.map((name, i) => ({
    name,
    path: parts.slice(0, i + 1).join('/'),
  }));

  // Get tree for sidebar
  const tree = await mimirModel.getFolderTree();

  // Get sub-folders of current path (from tree)
  let subFolders = [];
  if (parts.length === 1) {
    const rootNode = tree.find(f => f.name === parts[0]);
    if (rootNode) subFolders = rootNode.children;
  }

  const data = await mimirModel.browseFolderAssets(folderPath, { mediaType, page, pageSize });

  logModel.log(req.user && req.user.email, 'search', {
    q: '', locationFilter: folderPath, mediaType, page, total: data.total,
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

module.exports = { folderList, folderContents };
