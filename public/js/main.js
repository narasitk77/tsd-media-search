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
      advToggle.classList.remove('open');
      advToggle.setAttribute('aria-expanded', 'false');
    } else {
      advPanel.removeAttribute('hidden');
      advToggle.classList.add('open');
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
      '<video controls autoplay muted playsinline style="width:100%;max-height:55vh;background:#000">' +
        '<source src="' + escHtml(asset.previewUrl) + '" type="video/mp4" />' +
        (asset.vttUrl ? '<track kind="subtitles" src="' + escHtml(asset.vttUrl) + '" default />' : '') +
      '</video>';
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
  card.addEventListener('click', function () { openModal(this.dataset.id); });
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(this.dataset.id); }
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
