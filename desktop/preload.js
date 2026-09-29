const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getConnectionMode: () => ipcRenderer.invoke('get-connection-mode'),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  isDesktop: true
});

window.isDesktopApp = true;
