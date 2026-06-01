const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchFiles: (query) => ipcRenderer.send('search-files', query),
  cancelSearch: () => ipcRenderer.send('search-cancel'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
  copyFilePath: (filePath) => ipcRenderer.invoke('copy-file-path', filePath),
  copyFile: (filePath) => ipcRenderer.invoke('copy-file', filePath),
  minimizeWindow: () => ipcRenderer.invoke('min-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  toggleFloatMode: (enabled) => ipcRenderer.invoke('toggle-float-mode', enabled),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  onSearchResult: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('search-result', handler);
    return () => ipcRenderer.removeListener('search-result', handler);
  },
  onSearchDone: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('search-done', handler);
    return () => ipcRenderer.removeListener('search-done', handler);
  },
  onSearchError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('search-error', handler);
    return () => ipcRenderer.removeListener('search-error', handler);
  },
});
