const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (method, params = {}) => ipcRenderer.invoke('ipc-call', method, params),
  onNotify: (callback) => {
    const listener = (event, method, params) => callback(method, params);
    ipcRenderer.on('ipc-notify', listener);
    return () => ipcRenderer.removeListener('ipc-notify', listener);
  },
});

window.addEventListener('error', (e) => {
  console.error('Renderer error:', e.error);
});
