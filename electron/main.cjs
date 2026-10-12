const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isSetupMode = false;

// Ensure single running instance on Windows
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createMainWindow() {
  const fs = require('fs');
  const icoPath = path.join(__dirname, '../public/icon.ico');
  const pngPath = path.join(__dirname, '../public/icon.png');
  const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  const appIcon = nativeImage.createFromPath(iconPath);

  isSetupMode = process.argv.includes('--setup') || process.argv.includes('--install');

  mainWindow = new BrowserWindow({
    width: isSetupMode ? 480 : 1320,
    height: isSetupMode ? 620 : 840,
    minWidth: isSetupMode ? 480 : 940,
    minHeight: isSetupMode ? 620 : 620,
    resizable: !isSetupMode,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#06060b',
    show: false,
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // Load production bundle or local dev server
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(isSetupMode ? `${devServerUrl}#/setup` : devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: isSetupMode ? '/setup' : ''
    });
  }

  // Gracefully show window when DOM and styles are ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      if (isSetupMode) {
        isQuitting = true;
        app.quit();
        return;
      }
      event.preventDefault();
      mainWindow.hide();
    }
  });

  setupTray(appIcon);
  registerGlobalMediaKeys();
}

function setupTray(appIcon) {
  if (tray) return;

  const trayIcon = appIcon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('WaveCraft Pro — Windows Studio Edition');

  updateTrayMenu({ title: 'WaveCraft Pro', artist: 'Liquid Glass Audio Studio' });

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu(trackInfo) {
  if (!tray) return;

  const label = trackInfo?.title
    ? `${trackInfo.title} — ${trackInfo.artist || 'WaveCraft'}`
    : 'WaveCraft Pro: Studio Ready';

  const contextMenu = Menu.buildFromTemplate([
    { label: label, enabled: false },
    { type: 'separator' },
    {
      label: 'Play / Pause',
      click: () => mainWindow?.webContents.send('media:action', 'togglePlay')
    },
    {
      label: 'Next Track',
      click: () => mainWindow?.webContents.send('media:action', 'nextTrack')
    },
    {
      label: 'Previous Track',
      click: () => mainWindow?.webContents.send('media:action', 'prevTrack')
    },
    {
      label: 'Mute Audio',
      click: () => mainWindow?.webContents.send('media:action', 'toggleMute')
    },
    { type: 'separator' },
    {
      label: 'Open WaveCraft Pro',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  if (trackInfo?.title) {
    tray.setToolTip(`WaveCraft Pro: ${trackInfo.title} - ${trackInfo.artist}`);
  }
}

function registerGlobalMediaKeys() {
  try {
    globalShortcut.register('MediaPlayPause', () => {
      mainWindow?.webContents.send('media:action', 'togglePlay');
    });
    globalShortcut.register('MediaNextTrack', () => {
      mainWindow?.webContents.send('media:action', 'nextTrack');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      mainWindow?.webContents.send('media:action', 'prevTrack');
    });
    globalShortcut.register('MediaStop', () => {
      mainWindow?.webContents.send('media:action', 'pause');
    });
  } catch (err) {
    console.warn('Could not register global media keys:', err);
  }
}

// Window Management IPC Handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (!mainWindow) return;
  if (isSetupMode) {
    isQuitting = true;
    app.quit();
  } else {
    mainWindow.close();
  }
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('track:update', (_event, track) => {
  updateTrayMenu(track);
});

ipcMain.handle('app:is-setup-mode', () => {
  return isSetupMode;
});

ipcMain.on('window:finish-setup', () => {
  if (!mainWindow) return;
  isSetupMode = false;
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(940, 620);
  mainWindow.setSize(1320, 840, true);
  mainWindow.center();
  mainWindow.focus();
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
