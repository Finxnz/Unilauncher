const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const treeKill = require('tree-kill');

const isWin = process.platform === 'win32';
app.setName('Unilauncher');

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'games.json');
const settingsPath = path.join(userDataPath, 'settings.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

let games = readJSON(dbPath, []);
let settings = readJSON(settingsPath, {
  language: 'de',
  autostart: false,
  closeToTray: false,
  confirmStop: true
});

function saveGames() { writeJSON(dbPath, games); }
function saveSettings() { writeJSON(settingsPath, settings); }

const runningProcesses = new Map(); 
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#0d0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
}

function applyAutostart(enabled) {
  if (!isWin && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
}

app.whenReady().then(() => {
  applyAutostart(settings.autostart);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (e, partial) => {
  settings = { ...settings, ...partial };
  saveSettings();
  if ('autostart' in partial) applyAutostart(settings.autostart);
  return settings;
});

function nameFromPath(p) {
  const base = path.basename(p, path.extname(p));
  return base
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getIconDataURL(exePath) {
  try {
    const img = await app.getFileIcon(exePath, { size: 'large' });
    return img.isEmpty() ? null : img.toDataURL();
  } catch {
    return null;
  }
}

ipcMain.handle('games:list', () =>
  games.map((g) => ({ ...g, running: runningProcesses.has(g.id) }))
);

ipcMain.handle('dialog:chooseExe', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Programm auswählen',
    properties: ['openFile'],
    filters: isWin
      ? [{ name: 'Programme', extensions: ['exe'] }]
      : [{ name: 'Alle Dateien', extensions: ['*'] }]
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

ipcMain.handle('games:addManual', async (e, exePath) => {
  const icon = await getIconDataURL(exePath);
  const game = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: nameFromPath(exePath),
    exePath,
    source: 'manual',
    icon,
    addedAt: Date.now(),
    lastPlayed: null,
    playCount: 0
  };
  games.push(game);
  saveGames();
  return game;
});

ipcMain.handle('games:rename', (e, id, name) => {
  const g = games.find((x) => x.id === id);
  if (g && name && name.trim()) { g.name = name.trim(); saveGames(); }
  return g;
});

ipcMain.handle('games:remove', (e, id) => {
  if (runningProcesses.has(id)) stopGame(id);
  games = games.filter((g) => g.id !== id);
  saveGames();
  return true;
});

ipcMain.handle('games:openFolder', (e, id) => {
  const game = games.find((g) => g.id === id);
  if (game) shell.showItemInFolder(game.exePath);
});

function getSteamPath() {
  const candidates = isWin
    ? ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']
    : [
        path.join(app.getPath('home'), '.steam', 'steam'),
        path.join(app.getPath('home'), '.local', 'share', 'Steam')
      ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function parseLibraryFolders(content) {
  const paths = [];
  const regex = /"path"\s+"([^"]+)"/g;
  let m;
  while ((m = regex.exec(content))) paths.push(m[1].replace(/\\\\/g, '\\'));
  return paths;
}

function parseAcf(content) {
  const get = (key) => {
    const m = content.match(new RegExp('"' + key + '"\\s+"([^"]+)"'));
    return m ? m[1] : null;
  };
  return { appid: get('appid'), name: get('name'), installdir: get('installdir') };
}

ipcMain.handle('steam:scan', async () => {
  const steamPath = getSteamPath();
  if (!steamPath) return { found: false, games: [] };

  let libraryFolders = [steamPath];
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (fs.existsSync(vdfPath)) {
    const extra = parseLibraryFolders(fs.readFileSync(vdfPath, 'utf-8'));
    libraryFolders = [...new Set([...libraryFolders, ...extra])];
  }

  const found = [];
  const existingExes = new Set(games.map((g) => g.exePath));

  for (const lib of libraryFolders) {
    const appsDir = path.join(lib, 'steamapps');
    if (!fs.existsSync(appsDir)) continue;
    let manifestFiles = [];
    try {
      manifestFiles = fs
        .readdirSync(appsDir)
        .filter((f) => f.startsWith('appmanifest_') && f.endsWith('.acf'));
    } catch { continue; }

    for (const mf of manifestFiles) {
      try {
        const info = parseAcf(fs.readFileSync(path.join(appsDir, mf), 'utf-8'));
        if (!info.installdir) continue;
        const installPath = path.join(appsDir, 'common', info.installdir);
        if (!fs.existsSync(installPath)) continue;
        found.push({
          appid: info.appid,
          name: info.name || info.installdir,
          installPath
        });
      } catch { /* skip broken manifest */ }
    }
  }
  return { found: true, games: found, existingExes: [...existingExes] };
});

ipcMain.handle('steam:listExes', (e, installPath) => {
  const exes = [];
  function walk(dir, depth) {
    if (depth > 2) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.exe')) exes.push(full);
    }
  }
  walk(installPath, 0);
  return exes;
});

ipcMain.handle('games:addSteam', async (e, { name, exePath, appid }) => {
  const icon = await getIconDataURL(exePath);
  const game = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    exePath,
    source: 'steam',
    appid,
    icon,
    addedAt: Date.now(),
    lastPlayed: null,
    playCount: 0
  };
  games.push(game);
  saveGames();
  return game;
});

function sendStatus(id, running) {
  if (mainWindow) mainWindow.webContents.send('games:status', { id, running });
}

function launch(game) {
  const child = spawn(game.exePath, [], {
    cwd: path.dirname(game.exePath),
    detached: false,
    stdio: 'ignore'
  });
  runningProcesses.set(game.id, child);
  sendStatus(game.id, true);
  child.on('exit', () => {
    runningProcesses.delete(game.id);
    sendStatus(game.id, false);
  });
  child.on('error', () => {
    runningProcesses.delete(game.id);
    sendStatus(game.id, false);
  });
}

ipcMain.handle('games:start', (e, id) => {
  const game = games.find((g) => g.id === id);
  if (!game || runningProcesses.has(id)) return false;
  try {
    launch(game);
    game.lastPlayed = Date.now();
    game.playCount = (game.playCount || 0) + 1;
    saveGames();
    return true;
  } catch {
    return false;
  }
});

function stopGame(id) {
  const child = runningProcesses.get(id);
  if (!child) return false;
  try { treeKill(child.pid, 'SIGTERM'); } catch { /* noop */ }
  runningProcesses.delete(id);
  sendStatus(id, false);
  return true;
}
ipcMain.handle('games:stop', (e, id) => stopGame(id));

ipcMain.handle('games:restart', async (e, id) => {
  const game = games.find((g) => g.id === id);
  if (!game) return false;
  if (runningProcesses.has(id)) {
    stopGame(id);
    await new Promise((r) => setTimeout(r, 900));
  }
  try {
    launch(game);
    return true;
  } catch {
    return false;
  }
});
