const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { ALLOWED_RENDERER_METHODS } = require('./ipc-methods');

const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  console.debug('[preload] Preload script executing...');
}

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (method, params = {}) => {
      if (typeof method !== 'string' || !ALLOWED_RENDERER_METHODS.has(method)) {
        return Promise.reject(new Error(`IPC method not allowed: ${method}`));
      }
      return ipcRenderer.invoke('ipc-call', method, params);
    },
    backendStatus: () => ipcRenderer.invoke('backend-status'),
    backendRestart: () => ipcRenderer.invoke('backend-restart'),
    onNotify: (callback) => {
      const listener = (event, method, params) => callback(method, params);
      ipcRenderer.on('ipc-notify', listener);
      return () => ipcRenderer.removeListener('ipc-notify', listener);
    },
    minimizeWindow: () => ipcRenderer.invoke('window-control', 'minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-control', 'maximize'),
    closeWindow: () => ipcRenderer.invoke('window-control', 'close'),
    showAppMenu: (menuIndex, position) => ipcRenderer.invoke('app-menu-popup', menuIndex, position),
    autoUpdateCheck: () => ipcRenderer.invoke('auto-update-check'),
    autoUpdateInstall: () => ipcRenderer.invoke('auto-update-install'),
    onAutoUpdateStatus: (callback) => {
      const listener = (event, data) => callback(data);
      ipcRenderer.on('auto-update-status', listener);
      return () => ipcRenderer.removeListener('auto-update-status', listener);
    },
    // Electron 32+ removed File.path; webUtils.getPathForFile is the
    // supported way to resolve a File from <input> or drop events to an
    // absolute filesystem path. Exposed here because the renderer runs with
    // contextIsolation and cannot import electron modules directly.
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file) || '';
      } catch {
        return '';
      }
    },
  });
  if (isDev) {
    console.debug('[preload] electronAPI exposed successfully');
  }
} catch (err) {
  if (isDev) {
    console.error('[preload] Failed to expose electronAPI:', err);
  }
}

window.addEventListener('error', (e) => {
  if (isDev) {
    console.error('Renderer error:', e.error);
  }
});
