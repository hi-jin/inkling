const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inkling', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pauseSummon: (on) => ipcRenderer.send('summon:pause', on),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  loadNote: (id) => ipcRenderer.invoke('notes:load', id),
  saveNote: (id, text) => ipcRenderer.send('notes:save', id, text),
  flushNote: (id, text) => ipcRenderer.sendSync('notes:flush', id, text),
  removeNote: (id) => ipcRenderer.invoke('notes:remove', id),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
});
