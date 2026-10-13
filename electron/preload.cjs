const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximized-change', handler);
    return () => ipcRenderer.removeListener('window:maximized-change', handler);
  },
  onMaximizeChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximized-change', handler);
    return () => ipcRenderer.removeListener('window:maximized-change', handler);
  },
  onMediaKey: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('media:action', handler);
    return () => ipcRenderer.removeListener('media:action', handler);
  },
  updateTrack: (track) => ipcRenderer.send('track:update', track),
  sendPlaybackState: (isPlaying) => ipcRenderer.send('media:playback-state', isPlaying),
  onVisibilityChange: (callback) => {
    const handler = (_event, isVisible) => callback(isVisible);
    ipcRenderer.on('app:visibility-change', handler);
    return () => ipcRenderer.removeListener('app:visibility-change', handler);
  },
  finishSetup: () => ipcRenderer.send('window:finish-setup'),
  isSetupMode: () => ipcRenderer.invoke('app:is-setup-mode')
});
