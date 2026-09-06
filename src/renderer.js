let lang = {};
let currentLangCode = 'de';
let settings = {};
let allGames = [];

async function loadLang(code) {
  const res = await fetch(`lang/${code}.json`);
  lang = await res.json();
  currentLangCode = code;
  applyI18n();
}

function t(key) { return lang[key] || key; }

function applyI18n() {
  document.title = t('app_title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  renderGames();
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function openModal({ title, bodyHTML, confirmText = 'OK', cancelText = 'Abbrechen', onConfirm, focusSelector }) {
  const backdrop = document.getElementById('modal-backdrop');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML || '';
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  backdrop.hidden = false;

  const close = () => { backdrop.hidden = true; confirmBtn.onclick = null; cancelBtn.onclick = null; };
  confirmBtn.onclick = () => { onConfirm && onConfirm(); close(); };
  cancelBtn.onclick = close;

  if (focusSelector) {
    const f = document.querySelector(focusSelector);
    if (f) { f.focus(); f.select && f.select(); }
  }
}

function setView(name) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
}
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-max').addEventListener('click', () => window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

const ICON_PLAY = '<svg viewBox="0 0 16 16"><path d="M4 2.8v10.4a.8.8 0 001.2.7l8.6-5.2a.8.8 0 000-1.4L5.2 2.1A.8.8 0 004 2.8z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>';
const ICON_RESTART = '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 11-1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13 2.5v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FALLBACK = '<svg class="fallback-icon" viewBox="0 0 24 24"><path d="M6 9h3v2H7v2H5v-2H3V9h2V7h1v2zm12.5 1a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM16 12.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM7.5 4h9c2.5 0 4.3 1.9 4.5 4.4l.9 7A3 3 0 0118.9 19a3 3 0 01-2.6-1.5L15 15H9l-1.3 2.5A3 3 0 015.1 19a3 3 0 01-3-3.6l.9-7C3.2 5.9 5 4 7.5 4z"/></svg>';

function timeAgo(ts) {
  if (!ts) return t('never_played');
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('min_ago');
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} d`;
}

function iconMarkup(game) {
  if (game.icon) return `<img src="${game.icon}" alt="" />`;
  return ICON_FALLBACK;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGames() {
  const grid = document.getElementById('game-grid');
  const empty = document.getElementById('empty-state');
  const query = (document.getElementById('search-input').value || '').toLowerCase();

  const filtered = allGames.filter((g) => g.name.toLowerCase().includes(query));

  document.getElementById('stat-games').textContent = allGames.length;
  document.getElementById('stat-running').textContent = allGames.filter((g) => g.running).length;

  if (allGames.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = filtered.map((g) => `
    <div class="game-card" data-id="${g.id}">
      <div class="game-thumb" title="${escapeHtml(g.name)}">
        ${iconMarkup(g)}
        ${g.running ? `<div class="running-dot"></div>` : ''}
        <div class="thumb-overlay">
          <button class="ov-btn" data-action="start" ${g.running ? 'disabled' : ''} title="${t('btn_start')}">${ICON_PLAY}</button>
          <button class="ov-btn" data-action="restart" ${!g.running ? 'disabled' : ''} title="${t('btn_restart')}">${ICON_RESTART}</button>
          <button class="ov-btn" data-action="stop" ${!g.running ? 'disabled' : ''} title="${t('btn_stop')}">${ICON_STOP}</button>
        </div>
      </div>
      <div class="game-card-bottom">
        <div class="game-name">${escapeHtml(g.name)}</div>
        <button class="menu-btn" data-action="menu">&#8942;</button>
      </div>
    </div>
  `).join('');
}

function closeAnyMenu() {
  const existing = document.querySelector('.dropdown-menu');
  if (existing) existing.remove();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown-menu') && !e.target.closest('.menu-btn')) closeAnyMenu();
});

document.getElementById('game-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const card = e.target.closest('.game-card');
  const id = card.dataset.id;
  const game = allGames.find((g) => g.id === id);
  const action = btn.dataset.action;

  if (action === 'start') {
    const ok = await window.api.startGame(id);
    if (!ok) showToast(t('toast_start_failed'));
  } else if (action === 'stop') {
    if (settings.confirmStop && !confirm(t('confirm_stop_msg'))) return;
    await window.api.stopGame(id);
  } else if (action === 'restart') {
    await window.api.restartGame(id);
  } else if (action === 'menu') {
    closeAnyMenu();
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.innerHTML = `
      <button data-m="folder">${t('btn_open_folder')}</button>
      <button data-m="rename">${t('btn_rename')}</button>
      <button data-m="remove" class="danger">${t('btn_remove')}</button>
    `;
    document.body.appendChild(menu);
    const rect = btn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth - 150)}px`;

    menu.querySelector('[data-m="folder"]').addEventListener('click', () => {
      window.api.openFolder(id);
      closeAnyMenu();
    });
    menu.querySelector('[data-m="rename"]').addEventListener('click', () => {
      closeAnyMenu();
      openModal({
        title: t('btn_rename'),
        bodyHTML: `<input type="text" id="rename-input" value="${escapeHtml(game.name)}" />`,
        confirmText: 'OK',
        focusSelector: '#rename-input',
        onConfirm: async () => {
          const val = document.getElementById('rename-input').value;
          await window.api.renameGame(id, val);
          showToast(t('toast_renamed'));
          await refreshGames();
        }
      });
    });
    menu.querySelector('[data-m="remove"]').addEventListener('click', async () => {
      closeAnyMenu();
      if (!confirm(t('confirm_remove_msg'))) return;
      await window.api.removeGame(id);
      showToast(t('toast_removed'));
      await refreshGames();
    });
  }
});

document.getElementById('search-input').addEventListener('input', renderGames);
document.getElementById('empty-add-btn').addEventListener('click', () => setView('add'));

async function refreshGames() {
  allGames = await window.api.listGames();
  renderGames();
}

window.api.onStatus(({ id, running }) => {
  const g = allGames.find((x) => x.id === id);
  if (g) g.running = running;
  renderGames();
});

document.getElementById('manual-browse-btn').addEventListener('click', async () => {
  const exePath = await window.api.chooseExe();
  if (!exePath) return;
  await window.api.addManual(exePath);
  showToast(t('toast_added'));
  await refreshGames();
  setView('library');
});

const dropzone = document.getElementById('manual-dropzone');
['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); })
);
dropzone.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  if (!file || !file.path) return;
  await window.api.addManual(file.path);
  showToast(t('toast_added'));
  await refreshGames();
  setView('library');
});

document.getElementById('steam-scan-btn').addEventListener('click', async () => {
  const resultsEl = document.getElementById('steam-results');
  resultsEl.innerHTML = `<div class="muted">${t('add_steam_scanning')}</div>`;
  const res = await window.api.scanSteam();

  if (!res.found || res.games.length === 0) {
    resultsEl.innerHTML = `<div class="muted">${t('add_steam_none')}</div>`;
    return;
  }

  resultsEl.innerHTML = res.games.map((g, i) => `
    <div class="steam-row" data-idx="${i}">
      <div>
        <div class="steam-row-name">${escapeHtml(g.name)}</div>
        <div class="steam-row-path">${escapeHtml(g.installPath)}</div>
      </div>
      <button class="btn btn-primary" data-steam-import="${i}">${t('add_steam_import')}</button>
    </div>
  `).join('');

  resultsEl.querySelectorAll('[data-steam-import]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.steamImport);
      const steamGame = res.games[idx];
      const exes = await window.api.listExes(steamGame.installPath);

      if (exes.length === 0) {
        showToast(t('toast_start_failed'));
        return;
      }
      if (exes.length === 1) {
        await window.api.addSteamGame({ name: steamGame.name, exePath: exes[0], appid: steamGame.appid });
        showToast(t('toast_added'));
        await refreshGames();
        setView('library');
        return;
      }
      openModal({
        title: t('add_steam_pick_exe'),
        bodyHTML: `<select id="exe-select" class="select" style="width:100%">${
          exes.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p.split(/[\\/]/).pop())}</option>`).join('')
        }</select>`,
        confirmText: t('add_steam_import'),
        onConfirm: async () => {
          const chosen = document.getElementById('exe-select').value;
          await window.api.addSteamGame({ name: steamGame.name, exePath: chosen, appid: steamGame.appid });
          showToast(t('toast_added'));
          await refreshGames();
          setView('library');
        }
      });
    });
  });
});

async function initSettings() {
  settings = await window.api.getSettings();
  document.getElementById('lang-select').value = settings.language || 'de';
  document.getElementById('toggle-autostart').checked = !!settings.autostart;
  document.getElementById('toggle-confirm-stop').checked = settings.confirmStop !== false;
}

document.getElementById('lang-select').addEventListener('change', async (e) => {
  const code = e.target.value;
  settings = await window.api.setSettings({ language: code });
  await loadLang(code);
});

document.getElementById('toggle-autostart').addEventListener('change', async (e) => {
  settings = await window.api.setSettings({ autostart: e.target.checked });
});

document.getElementById('toggle-confirm-stop').addEventListener('change', async (e) => {
  settings = await window.api.setSettings({ confirmStop: e.target.checked });
});

(async function init() {
  settings = await window.api.getSettings();
  await loadLang(settings.language || 'de');
  await initSettings();
  await refreshGames();
})();
