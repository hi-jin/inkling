const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inkling', {
  load: () => ipcRenderer.invoke('sheet:load'),
  save: (text) => ipcRenderer.send('sheet:save', text),
  flush: (text) => ipcRenderer.sendSync('sheet:flush', text),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
});
