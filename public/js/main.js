'use strict';

/* =========================================================
   Mimir Media Search — Frontend JS
   ========================================================= */

// ── Hamburger / Left Sidebar ──────────────────────────────────
(function () {
  var menuToggle  = document.getElementById('menuToggle');
  var sideNav     = document.getElementById('sideNav');
  var navBackdrop = document.getElementById('navBackdrop');
  if (!menuToggle || !sideNav) return;

  function openMenu() {
    sideNav.classList.add('open');
    navBackdrop.classList.add('show');
    menuToggle.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    sideNav.classList.remove('open');
    navBackdrop.classList.remove('show');
    menuToggle.classList.remove('open');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', function () {
    sideNav.classList.contains('open') ? closeMenu() : openMenu();
  });
  navBackdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); closeClPanel(); }
  });
})();

// ── Changelog Right Panel ─────────────────────────────────────
var clPanelLoaded = false;

function openClPanel() {
  var panel     = document.getElementById('clPanel');
  var backdrop  = document.getElementById('clBackdrop');
  var body      = document.getElementById('clPanelBody');
  if (!panel) return;
  panel.classList.add('open');
  backdrop.classList.add('show');

  if (!clPanelLoaded) {
    clPanelLoaded = true;
    fetch('/api/changelog')
      .then(function (r) { return r.json(); })
      .then(function (entries) {
        body.innerHTML = renderChangelog(entries);
      })
      .catch(function () {
        body.innerHTML = '<p style="color:#dc2626;padding:20px">โหลดไม่สำเร็จ</p>';
      });
  }
}
function closeClPanel() {
  var panel    = document.getElementById('clPanel');
  var backdrop = document.getElementById('clBackdrop');
  if (panel)    panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
}
function renderChangelog(entries) {
  if (!entries || !entries.length) return '<p style="color:#9ca3af;padding:20px">ไม่มีข้อมูล</p>';
  return entries.map(function (r, ri) {
    var dateStr = '';
    try { dateStr = new Date(r.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { dateStr = r.date; }
    var latest  = ri === 0 ? '<span class="cl-latest-badge">ล่าสุด</span>' : '';
    var entryHtml = (r.entries || []).map(function (en) {
      var icons = { added: '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>', fixed: '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', improved: '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 9l4-6 4 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
      var icon  = icons[en.type] || '';
      var label = en.type === 'added' ? 'Added' : en.type === 'fixed' ? 'Fixed' : en.type === 'improved' ? 'Improved' : en.type;
      return '<li class="cl-entry cl-entry--' + escHtml(en.type) + '">' +
        '<span class="cl-entry-badge cl-entry-badge--' + escHtml(en.type) + '">' + icon + ' ' + label + '</span>' +
        '<span class="cl-entry-text">' + escHtml(en.text) + '</span></li>';
    }).join('');
    return '<div class="cl-release">' +
      '<div class="cl-release-meta">' +
        '<span class="cl-version">v' + escHtml(r.version) + '</span>' +
        '<span class="cl-date">' + escHtml(dateStr) + '</span>' +
        latest +
      '</div>' +
      '<div class="cl-release-body">' +
        '<h2 class="cl-release-title">' + escHtml(r.title) + '</h2>' +
        '<ul class="cl-entries">' + entryHtml + '</ul>' +
      '</div></div>';
  }).join('');
}

var clBtn     = document.getElementById('clPanelBtn');
var clClose   = document.getElementById('clPanelClose');
var clBdrop   = document.getElementById('clBackdrop');
if (clBtn)   clBtn.addEventListener('click',   function () { openClPanel(); document.getElementById('sideNav') && document.getElementById('sideNav').classList.remove('open'); document.getElementById('navBackdrop') && document.getElementById('navBackdrop').classList.remove('show'); document.getElementById('menuToggle') && document.getElementById('menuToggle').classList.remove('open'); document.body.style.overflow = ''; });
if (clClose) clClose.addEventListener('click', closeClPanel);
if (clBdrop) clBdrop.addEventListener('click', closeClPanel);

// ── Help Panel ───────────────────────────────────────────────
function openHelpPanel() {
  var panel = document.getElementById('helpPanel');
  var bd    = document.getElementById('helpBackdrop');
  if (!panel) return;
  panel.classList.add('open');
  if (bd) bd.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeHelpPanel() {
  var panel = document.getElementById('helpPanel');
  var bd    = document.getElementById('helpBackdrop');
  if (panel) panel.classList.remove('open');
  if (bd)    bd.classList.remove('show');
  document.body.style.overflow = '';
}

var helpBtn   = document.getElementById('helpPanelBtn');
var helpClose = document.getElementById('helpPanelClose');
var helpBdrop = document.getElementById('helpBackdrop');
if (helpBtn) helpBtn.addEventListener('click', function () {
  openHelpPanel();
  var sideNav    = document.getElementById('sideNav');
  var navBackdrop = document.getElementById('navBackdrop');
  var menuToggle  = document.getElementById('menuToggle');
  if (sideNav)     sideNav.classList.remove('open');
  if (navBackdrop) navBackdrop.classList.remove('show');
  if (menuToggle)  menuToggle.classList.remove('open');
  document.body.style.overflow = '';
  // Re-apply after panel sets it
  setTimeout(function () { document.body.style.overflow = 'hidden'; }, 10);
});
if (helpClose) helpClose.addEventListener('click', closeHelpPanel);
if (helpBdrop) helpBdrop.addEventListener('click', closeHelpPanel);

// ── Advanced Search Panel ────────────────────────────────────
var advToggle = document.getElementById('advToggle');
var advPanel  = document.getElementById('advPanel');
var advReset  = document.getElementById('advReset');

// Auto-open panel if any advanced filter is active
(function () {
  if (!advPanel || !advToggle) return;
  var dateFrom  = document.getElementById('dateFrom');
  var dateTo    = document.getElementById('dateTo');
  var sortBy    = document.getElementById('sortBySelect');
  var sortOrder = document.getElementById('sortOrderSelect');
  var hasFilter = (dateFrom  && dateFrom.value)  ||
                  (dateTo    && dateTo.value)     ||
                  (sortBy    && sortBy.value    !== 'date') ||
                  (sortOrder && sortOrder.value !== 'desc');
  if (hasFilter) {
    advPanel.removeAttribute('hidden');
    advToggle.classList.add('open');
    advToggle.setAttribute('aria-expanded', 'true');
  }
})();

if (advToggle && advPanel) {
  advToggle.addEventListener('click', function () {
    var isOpen = !advPanel.hasAttribute('hidden');
    if (isOpen) {
      advPanel.setAttribute('hidden', '');
      advToggle.classList.remove('open', 'chip--active');
      advToggle.setAttribute('aria-expanded', 'false');
    } else {
      advPanel.removeAttribute('hidden');
      advToggle.classList.add('open', 'chip--active');
      advToggle.setAttribute('aria-expanded', 'true');
    }
  });
}

if (advReset) {
  advReset.addEventListener('click', function () {
    var form = document.getElementById('searchForm');
    if (!form) return;
    var textFields = ['searchTitle','searchPeople','searchDescription','searchTranscript',
                      'searchLabels','searchMetadata','searchFile','searchDetectedText',
                      'dateFrom','dateTo','durationMin','durationMax','locationFilter'];
    textFields.forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = '';
    });
    if (form.elements['sortBy'])    form.elements['sortBy'].value    = 'date';
    if (form.elements['sortOrder']) form.elements['sortOrder'].value = 'desc';
    if (form.elements['pageSize'])  form.elements['pageSize'].value  = '24';
    form.submit();
  });
}

// ── Modal ─────────────────────────────────────────────────────
var modal         = document.getElementById('assetModal');
var modalBackdrop = document.getElementById('modalBackdrop');
var modalClose    = document.getElementById('modalClose');
var modalMedia    = document.getElementById('modalMedia');
var modalTitle    = document.getElementById('modalTitle');
var modalMeta     = document.getElementById('modalMeta');
var modalActions  = document.getElementById('modalActions');

function openModal(assetId) {
  if (!modal) return;
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  modalMedia.innerHTML   = '<div class="spinner"></div>';
  modalTitle.textContent = '';
  modalMeta.innerHTML    = '';
  modalActions.innerHTML = '';

  fetch('/asset/' + encodeURIComponent(assetId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) throw new Error(data.message);
      renderModal(data.asset);
    })
    .catch(function (err) {
      modalMedia.innerHTML =
        '<p style="color:#dc2626;padding:24px;text-align:center">โหลดข้อมูลไม่สำเร็จ: ' + escHtml(err.message) + '</p>';
    });
}

function renderModal(asset) {
  // ── Media area ──────────────────────────────────────────────
  if (asset.mediaType === 'video' && asset.previewUrl) {
    modalMedia.innerHTML =
      '<video id="mv" controls autoplay muted playsinline style="width:100%;max-height:55vh;background:#000">' +
        '<source id="mvSrc" src="' + escHtml(asset.previewUrl) + '" />' +
        (asset.vttUrl ? '<track kind="subtitles" src="' + escHtml(asset.vttUrl) + '" default />' : '') +
      '</video>' +
      '<div id="mvErr" style="display:none;padding:28px 20px;text-align:center;background:#111;color:#aaa">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" style="margin-bottom:10px;opacity:.5"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M10 8l6 4-6 4V8z" fill="currentColor"/><line x1="4" y1="4" x2="20" y2="20" stroke="#dc2626" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '<p style="margin:0 0 6px;font-size:.88rem;color:#ccc">ไม่สามารถเล่นวีดิโอในเบราว์เซอร์ได้</p>' +
        '<p style="margin:0 0 16px;font-size:.75rem;opacity:.7">รูปแบบไฟล์ไม่รองรับการเล่นออนไลน์ (เช่น MXF, ProRes)</p>' +
        '<a href="' + escHtml(asset.previewUrl) + '" target="_blank" rel="noopener" ' +
          'style="display:inline-block;padding:7px 16px;background:#0066cc;color:#fff;border-radius:8px;font-size:.82rem;text-decoration:none">เปิดไฟล์โดยตรง</a>' +
      '</div>';

    // Attach error handler after element is in DOM
    var _mv    = document.getElementById('mv');
    var _mvSrc = document.getElementById('mvSrc');
    var _mvErr = document.getElementById('mvErr');
    function _showVideoErr() {
      if (_mv)    _mv.style.display    = 'none';
      if (_mvErr) _mvErr.style.display = 'block';
    }
    if (_mv)    _mv.addEventListener('error',   _showVideoErr);
    if (_mvSrc) _mvSrc.addEventListener('error', _showVideoErr);
    // Fallback timeout: if video hasn't started loading after 8s, show error
    if (_mv) {
      var _mvTimer = setTimeout(function () {
        if (_mv && _mv.readyState === 0 && _mv.networkState !== 1) _showVideoErr();
      }, 8000);
      _mv.addEventListener('loadedmetadata', function () { clearTimeout(_mvTimer); });
    }
  } else if (asset.previewUrl) {
    modalMedia.innerHTML =
      '<img src="' + escHtml(asset.previewUrl) + '" alt="' + escHtml(asset.title) +
      '" style="width:100%;max-height:55vh;object-fit:contain;background:#111" />';
  } else {
    modalMedia.innerHTML =
      '<img src="/proxy/thumbnail/' + asset.id + '" alt="' + escHtml(asset.title) +
      '" style="width:100%;max-height:55vh;object-fit:contain;background:#111" />';
  }

  // ── Title ───────────────────────────────────────────────────
  modalTitle.textContent = asset.title || 'ไม่มีชื่อ';

  // ── Metadata ────────────────────────────────────────────────
  var fields = [
    ['ประเภท',      asset.mediaType === 'video' ? 'วีดิโอ' : 'รูปภาพ'],
    ['ช่างภาพ',     asset.photographer || null],
    ['ชนิดไฟล์',    asset.fileType],
    ['หมวดหมู่',    asset.category],
    ['วันที่สร้าง',  formatDate(asset.created)],
    ['แก้ไขล่าสุด',  formatDate(asset.modified)],
    ['ขนาดไฟล์',    formatBytes(asset.fileSize)],
    ['ความยาว',      asset.duration ? formatDuration(asset.duration) : null],
    ['ความละเอียด',  (asset.width && asset.height) ? asset.width + ' × ' + asset.height + ' px' : null],
  ];
  modalMeta.innerHTML = fields
    .filter(function (f) { return f[1]; })
    .map(function (f) {
      return '<dt>' + escHtml(f[0]) + '</dt><dd>' + escHtml(String(f[1])) + '</dd>';
    })
    .join('');

  // ── Action buttons ─────────────────────────────────────────
  var actions = '';
  var dlUrl = asset.highResUrl || asset.previewUrl;
  if (dlUrl) {
    var label = 'ดาวน์โหลด Hi-res';
    actions += '<a href="' + escHtml(dlUrl) + '" target="_blank" rel="noopener" class="btn btn--primary">' + label + '</a>';
  }
  if (asset.previewUrl && asset.previewUrl !== dlUrl) {
    actions += '<a href="' + escHtml(asset.previewUrl) + '" target="_blank" rel="noopener" class="btn btn--ghost">ดาวน์โหลด Low-res</a>';
  }
  modalActions.innerHTML = actions;

  // Log download clicks
  modalActions.querySelectorAll('a[href]').forEach(function (a) {
    a.addEventListener('click', function () {
      fetch('/log/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, title: asset.title, mediaType: asset.mediaType, url: a.href }),
      });
    });
  });
}

function closeModal() {
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
  var video = modalMedia && modalMedia.querySelector('video');
  if (video) video.pause();
}

if (modal) {
  if (modalClose)    modalClose.addEventListener('click', closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
  });
}

document.querySelectorAll('.media-card').forEach(function (card) {
  // Clicking the checkbox indicator always toggles selection (auto-enters select mode)
  var indicator = card.querySelector('.card-select-indicator');
  if (indicator) {
    indicator.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleCardSelection(card);
      if (_selectedIds.size > 0 && !_selectMode) {
        _selectMode = true;
        var grid = document.getElementById('mediaGrid');
        if (grid) grid.classList.add('select-mode');
        if (selectToggle) {
          selectToggle.classList.add('chip--active');
          selectToggle.setAttribute('aria-pressed', 'true');
          selectToggle.querySelector('.select-toggle-label').textContent = 'ยกเลิกเลือก';
        }
      }
    });
  }

  // Clicking the card body: if in select mode → toggle; else → open modal
  card.addEventListener('click', function () {
    if (_selectMode) { toggleCardSelection(this); }
    else { openModal(this.dataset.id); }
  });
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (_selectMode) { toggleCardSelection(this); }
      else { openModal(this.dataset.id); }
    }
  });
});

// ── Dark / Light Mode Toggle ──────────────────────────────────
var themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('mimir-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('mimir-theme', 'dark');
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch (e) { return iso; }
}

function formatBytes(b) {
  if (!b || isNaN(b)) return null;
  b = Number(b);
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function formatDuration(s) {
  if (!s) return null;
  s = Math.round(Number(s));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

// ── Multi-select ──────────────────────────────────────────────
var _selectedIds = new Set();
var _selectMode  = false;
var _gdocDocId   = null;
var _gdocLinks   = [];

var selectToggle = document.getElementById('selectToggle');
if (selectToggle) {
  selectToggle.addEventListener('click', function () {
    _selectMode = !_selectMode;
    if (!_selectMode) {
      _selectedIds.clear();
      document.querySelectorAll('.media-card--selected').forEach(function (c) { c.classList.remove('media-card--selected'); });
    }
    var grid = document.getElementById('mediaGrid');
    if (grid) grid.classList.toggle('select-mode', _selectMode);
    selectToggle.classList.toggle('chip--active', _selectMode);
    selectToggle.setAttribute('aria-pressed', _selectMode ? 'true' : 'false');
    selectToggle.querySelector('.select-toggle-label').textContent = _selectMode ? 'ยกเลิกเลือก' : 'เลือก';
    _syncSelectBar();
  });
}

function toggleCardSelection(card) {
  var id = card.dataset.id;
  if (_selectedIds.has(id)) {
    _selectedIds.delete(id);
    card.classList.remove('media-card--selected');
  } else {
    _selectedIds.add(id);
    card.classList.add('media-card--selected');
  }
  _syncSelectBar();
}

function _syncSelectBar() {
  var bar = document.getElementById('selectBar');
  if (!bar) return;
  document.getElementById('selectCount').textContent = _selectedIds.size + ' รายการ';
  if (_selectedIds.size > 0) { bar.removeAttribute('hidden'); }
  else { bar.setAttribute('hidden', ''); }
}

// ── Float bar actions ─────────────────────────────────────────
var _dlBtn     = document.getElementById('selectDownloadBtn');
var _copyBtn   = document.getElementById('selectCopyBtn');
var _gdocBtn   = document.getElementById('selectGdocBtn');
var _cancelBtn = document.getElementById('selectCancelBtn');

if (_dlBtn) {
  _dlBtn.addEventListener('click', function () {
    var ids = Array.from(_selectedIds);
    if (!ids.length) return;
    _dlBtn.disabled = true;
    _dlBtn.textContent = 'กำลังโหลด...';
    Promise.all(ids.map(function (id) {
      return fetch('/asset/' + encodeURIComponent(id)).then(function (r) { return r.json(); }).catch(function () { return null; });
    })).then(function (results) {
      var count = 0;
      results.forEach(function (data, i) {
        if (data && data.success && data.asset) {
          var url = data.asset.highResUrl || data.asset.previewUrl;
          if (url) {
            setTimeout(function () { window.open(url, '_blank', 'noopener'); }, i * 150);
            fetch('/log/download', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assetId: data.asset.id, title: data.asset.title, mediaType: data.asset.mediaType }) });
            count++;
          }
        }
      });
      showToast('เปิดดาวน์โหลด ' + count + ' รายการ (อนุญาต pop-up หากถูกบล็อก)');
    }).catch(function () { showToast('เกิดข้อผิดพลาด', 'error'); })
    .finally(function () {
      _dlBtn.disabled = false;
      _dlBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> ดาวน์โหลด';
    });
  });
}

if (_copyBtn) {
  _copyBtn.addEventListener('click', function () {
    var ids = Array.from(_selectedIds);
    if (!ids.length) return;
    _copyBtn.disabled = true;
    _copyBtn.textContent = 'กำลังโหลด...';
    Promise.all(ids.map(function (id) {
      return fetch('/asset/' + encodeURIComponent(id)).then(function (r) { return r.json(); }).catch(function () { return null; });
    })).then(function (results) {
      var lines = [];
      results.forEach(function (data) {
        if (data && data.success && data.asset) {
          var url = data.asset.highResUrl || data.asset.previewUrl;
          if (url) lines.push((data.asset.title || 'ไม่มีชื่อ') + '\n' + url);
        }
      });
      var text = lines.join('\n\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          showToast('Copy ลิงก์ ' + lines.length + ' รายการแล้ว');
        }).catch(function () { showToast('Copy ไม่ได้', 'error'); });
      }
    }).catch(function () { showToast('เกิดข้อผิดพลาด', 'error'); })
    .finally(function () {
      _copyBtn.disabled = false;
      _copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M6 3a1 1 0 00-1 1v8a1 1 0 001 1h7a1 1 0 001-1V7l-3-4H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 3v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 5H2a1 1 0 00-1 1v8a1 1 0 001 1h7a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Copy ลิงก์';
    });
  });
}

if (_gdocBtn) { _gdocBtn.addEventListener('click', openGdocPanel); }

if (_cancelBtn) {
  _cancelBtn.addEventListener('click', function () {
    _selectMode = false;
    _selectedIds.clear();
    document.querySelectorAll('.media-card--selected').forEach(function (c) { c.classList.remove('media-card--selected'); });
    var grid = document.getElementById('mediaGrid');
    if (grid) grid.classList.remove('select-mode');
    if (selectToggle) {
      selectToggle.classList.remove('chip--active');
      selectToggle.setAttribute('aria-pressed', 'false');
      selectToggle.querySelector('.select-toggle-label').textContent = 'เลือก';
    }
    _syncSelectBar();
  });
}

// ── Google Doc Panel ──────────────────────────────────────────
function openGdocPanel() {
  var panel = document.getElementById('gdocPanel');
  var bd    = document.getElementById('gdocBackdrop');
  if (!panel) return;
  panel.classList.add('open');
  if (window.innerWidth >= 900) {
    // Desktop: push content to the left (split view), no overlay
    document.body.classList.add('gdoc-split');
  } else {
    // Mobile: overlay with backdrop
    if (bd) bd.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  _loadGdocPanel();
}
function closeGdocPanel() {
  var panel = document.getElementById('gdocPanel');
  var bd    = document.getElementById('gdocBackdrop');
  if (panel) panel.classList.remove('open');
  if (bd)    bd.classList.remove('show');
  document.body.classList.remove('gdoc-split');
  document.body.style.overflow = '';
}

var _gdocClose = document.getElementById('gdocPanelClose');
var _gdocBd    = document.getElementById('gdocBackdrop');
if (_gdocClose) _gdocClose.addEventListener('click', closeGdocPanel);
if (_gdocBd)    _gdocBd.addEventListener('click', closeGdocPanel);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeGdocPanel(); }
});

function _loadGdocPanel() {
  var body = document.getElementById('gdocPanelBody');
  if (!body) return;
  body.innerHTML = '<div class="cl-panel-loading"><div class="spinner"></div></div>';

  var ids = Array.from(_selectedIds);
  Promise.all([
    fetch('/api/gdocs/recent').then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'fetch_failed', docs: [] }; }),
    Promise.all(ids.map(function (id) {
      return fetch('/asset/' + encodeURIComponent(id)).then(function (r) { return r.json(); }).catch(function () { return null; });
    }))
  ]).then(function (res) {
    var gdocData  = res[0];
    var assetData = res[1];

    if (!gdocData.ok && gdocData.error === 'no_token') {
      body.innerHTML = '<div class="gdoc-no-token"><p style="margin-bottom:16px">ต้องอนุญาต Google Drive & Docs<br><small>(ครั้งแรก หรือ session หมดอายุ)</small></p><button class="btn btn--primary" id="gdocAuthPopupBtn">เชื่อมต่อ Google</button></div>';
      var authBtn = document.getElementById('gdocAuthPopupBtn');
      if (authBtn) {
        authBtn.addEventListener('click', function () {
          var w = 500, h = 620;
          var left = Math.round(screen.width  / 2 - w / 2);
          var top  = Math.round(screen.height / 2 - h / 2);
          var popup = window.open(
            '/auth/google?popup=1', 'gdoc-auth',
            'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes'
          );
          function onMsg(e) {
            if (e.origin !== window.location.origin) return;
            if (e.data && e.data.type === 'gdoc-auth-ok') {
              window.removeEventListener('message', onMsg);
              body.innerHTML = '<div class="cl-panel-loading"><div class="spinner"></div></div>';
              _loadGdocPanel();
            }
          }
          window.addEventListener('message', onMsg);
          // Fallback: popup closed manually — try reloading anyway
          var poll = setInterval(function () {
            if (!popup || popup.closed) {
              clearInterval(poll);
              window.removeEventListener('message', onMsg);
              _loadGdocPanel();
            }
          }, 800);
        });
      }
      return;
    }

    _gdocLinks = [];
    assetData.forEach(function (data) {
      if (data && data.success && data.asset) {
        var url = data.asset.highResUrl || data.asset.previewUrl;
        if (url) _gdocLinks.push({ title: data.asset.title || 'ไม่มีชื่อ', url: url });
      }
    });

    body.innerHTML = _renderGdocContent(gdocData.docs || [], _gdocLinks);
    _setupGdocEvents();
  }).catch(function () {
    body.innerHTML = '<p style="color:var(--error);padding:20px">โหลดไม่สำเร็จ</p>';
  });
}

function _renderGdocContent(docs, links) {
  var html = '';

  if (docs.length > 0) {
    html += '<div class="gdoc-section"><div class="gdoc-section-title">เอกสารล่าสุด</div><ul class="gdoc-doc-list" id="gdocDocList">';
    docs.forEach(function (doc) {
      html += '<li class="gdoc-doc-item" data-docid="' + escHtml(doc.id) + '">' +
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '<span class="gdoc-doc-name">' + escHtml(doc.name) + '</span></li>';
    });
    html += '</ul></div>';
  }

  html += '<div class="gdoc-section"><div class="gdoc-section-title">หรือวาง URL เอกสาร</div>' +
    '<input type="text" class="adv-input" id="gdocUrlInput" placeholder="https://docs.google.com/document/d/..." autocomplete="off" style="width:100%;box-sizing:border-box" /></div>';

  html += '<div class="gdoc-section"><div class="gdoc-section-title">ลิงก์ที่จะแทรก (' + links.length + ' รายการ)</div>';
  if (links.length > 0) {
    html += '<ol class="gdoc-links-list">';
    links.forEach(function (lk) { html += '<li><span class="gdoc-link-title">' + escHtml(lk.title) + '</span></li>'; });
    html += '</ol>';
  } else {
    html += '<p style="color:var(--text-muted);font-size:0.85rem">ยังไม่ได้เลือก asset</p>';
  }
  html += '</div>';

  html += '<div class="gdoc-actions">' +
    '<button type="button" class="btn btn--primary" id="gdocInsertBtn" disabled>แทรกลิงก์เข้าเอกสาร</button>' +
    '<p class="gdoc-status" id="gdocStatus"></p></div>';

  return html;
}

function _setupGdocEvents() {
  _gdocDocId = null;
  var list = document.getElementById('gdocDocList');
  if (list) {
    list.querySelectorAll('.gdoc-doc-item').forEach(function (item) {
      item.addEventListener('click', function () {
        list.querySelectorAll('.gdoc-doc-item').forEach(function (i) { i.classList.remove('gdoc-doc-item--active'); });
        item.classList.add('gdoc-doc-item--active');
        _gdocDocId = item.dataset.docid;
        var urlInput = document.getElementById('gdocUrlInput');
        if (urlInput) urlInput.value = '';
        _updateGdocBtn();
      });
    });
  }
  var urlInput = document.getElementById('gdocUrlInput');
  if (urlInput) {
    urlInput.addEventListener('input', function () {
      _gdocDocId = _extractDocId(this.value);
      if (list && _gdocDocId) list.querySelectorAll('.gdoc-doc-item').forEach(function (i) { i.classList.remove('gdoc-doc-item--active'); });
      _updateGdocBtn();
    });
  }
  var btn = document.getElementById('gdocInsertBtn');
  if (btn) btn.addEventListener('click', _insertLinks);
}

function _updateGdocBtn() {
  var btn = document.getElementById('gdocInsertBtn');
  if (btn) btn.disabled = !_gdocDocId || _gdocLinks.length === 0;
}

function _insertLinks() {
  if (!_gdocDocId || !_gdocLinks.length) return;
  var btn = document.getElementById('gdocInsertBtn');
  var status = document.getElementById('gdocStatus');

  btn.disabled = true;
  btn.textContent = 'กำลังแทรก...';
  if (status) status.textContent = '';

  fetch('/api/gdocs/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId: _gdocDocId, links: _gdocLinks }),
  }).then(function (r) { return r.json(); })
  .then(function (data) {
    if (data.ok) {
      if (status) { status.textContent = 'แทรกลิงก์สำเร็จ!'; status.style.color = 'var(--success)'; }
      showToast('แทรกลิงก์เข้าเอกสารสำเร็จ');
    } else {
      var msg = data.error === 'no_token' ? 'กรุณา Login ใหม่' : (data.error || 'เกิดข้อผิดพลาด');
      if (status) { status.textContent = msg; status.style.color = 'var(--error)'; }
      showToast(msg, 'error');
    }
  }).catch(function () {
    if (status) { status.textContent = 'เชื่อมต่อไม่ได้'; status.style.color = 'var(--error)'; }
    showToast('เชื่อมต่อไม่ได้', 'error');
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = 'แทรกลิงก์เข้าเอกสาร';
  });
}

function _extractDocId(input) {
  if (!input) return null;
  var m = String(input).match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,100}$/.test(input.trim())) return input.trim();
  return null;
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type) {
  var el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { el.classList.add('toast--show'); });
  });
  setTimeout(function () {
    el.classList.remove('toast--show');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
  }, 3200);
}
