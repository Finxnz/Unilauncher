const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizedChange: (cb) => ipcRenderer.on('window:maximized', (e, v) => cb(v)),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),

  listGames: () => ipcRenderer.invoke('games:list'),
  chooseExe: () => ipcRenderer.invoke('dialog:chooseExe'),
  addManual: (exePath) => ipcRenderer.invoke('games:addManual', exePath),
  renameGame: (id, name) => ipcRenderer.invoke('games:rename', id, name),
  removeGame: (id) => ipcRenderer.invoke('games:remove', id),
  openFolder: (id) => ipcRenderer.invoke('games:openFolder', id),

  scanSteam: () => ipcRenderer.invoke('steam:scan'),
  listExes: (installPath) => ipcRenderer.invoke('steam:listExes', installPath),
  addSteamGame: (payload) => ipcRenderer.invoke('games:addSteam', payload),

  startGame: (id) => ipcRenderer.invoke('games:start', id),
  stopGame: (id) => ipcRenderer.invoke('games:stop', id),
  restartGame: (id) => ipcRenderer.invoke('games:restart', id),

  onStatus: (cb) => ipcRenderer.on('games:status', (e, data) => cb(data))
});
