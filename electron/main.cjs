const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, powerSaveBlocker, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isSetupMode = false;
let powerSaveBlockerId = null;

// High-Performance Chromium Engine Optimization & Resource Efficiency
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force_high_performance_gpu');

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
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false, // Saves 35-50MB RAM by disabling dictionary engine
      backgroundThrottling: false, // Prevents background audio stuttering
      v8CacheOptions: 'bypassHeatCheck'
    }
  });

  // Open external links in system browser and prevent untrusted in-app navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (devServerUrl) {
        const devParsed = new URL(devServerUrl);
        if (parsed.origin !== devParsed.origin) {
          event.preventDefault();
          shell.openExternal(navigationUrl);
        }
      } else if (parsed.protocol !== 'file:') {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch {
      event.preventDefault();
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

  mainWindow.on('minimize', () => {
    mainWindow.webContents.send('app:visibility-change', false);
  });

  mainWindow.on('restore', () => {
    mainWindow.webContents.send('app:visibility-change', true);
  });

  mainWindow.on('hide', () => {
    mainWindow.webContents.send('app:visibility-change', false);
  });

  mainWindow.on('show', () => {
    mainWindow.webContents.send('app:visibility-change', true);
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
      mainWindow.webContents.send('app:visibility-change', false);
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
  const mediaKeys = [
    { key: 'MediaPlayPause', action: 'togglePlay' },
    { key: 'MediaNextTrack', action: 'nextTrack' },
    { key: 'MediaPreviousTrack', action: 'prevTrack' },
    { key: 'MediaStop', action: 'pause' }
  ];

  mediaKeys.forEach(({ key, action }) => {
    try {
      globalShortcut.register(key, () => {
        // Forward global shortcut when window is unfocused/minimized/in-tray so background keys always work.
        // When window is focused, Chromium's native navigator.mediaSession already handles media keys.
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (!mainWindow.isFocused()) {
            mainWindow.webContents.send('media:action', action);
          }
        }
      });
    } catch (e) {
      console.warn(`[WaveCraft Desktop] Failed to bind global media key ${key}:`, e);
    }
  });
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

ipcMain.on('media:playback-state', (_event, isPlaying) => {
  try {
    if (isPlaying) {
      if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      }
    } else {
      if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
      }
    }
  } catch {}
});

ipcMain.handle('app:is-setup-mode', () => {
  return isSetupMode;
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Download helper with streaming progress & HTTP redirect following
function downloadFileWithProgress(urlStr, destPath, onProgress, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const http = require('http');
    const https = require('https');
    const { URL } = require('url');

    const download = (curUrl, redirectsLeft) => {
      if (redirectsLeft <= 0) {
        return reject(new Error('Too many redirects while downloading update'));
      }

      let parsed;
      try {
        parsed = new URL(curUrl);
      } catch (e) {
        return reject(e);
      }

      const client = parsed.protocol === 'http:' ? http : https;
      const req = client.get(
        curUrl,
        { headers: { 'User-Agent': 'WaveCraft-Pro-Updater' } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, curUrl).toString();
            try {
              const redParsed = new URL(redirectUrl);
              const isAllowedHost =
                redParsed.protocol === 'https:' &&
                (redParsed.hostname === 'github.com' ||
                  redParsed.hostname.endsWith('.github.com') ||
                  redParsed.hostname.endsWith('.githubusercontent.com'));
              if (!isAllowedHost) {
                return reject(new Error('Insecure or unapproved redirect blocked during update download'));
              }
            } catch (urlErr) {
              return reject(urlErr);
            }
            return download(redirectUrl, redirectsLeft - 1);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download update, status code: ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0 && typeof onProgress === 'function') {
              const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
              onProgress(percent);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => resolve(destPath));
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });
    };

    download(urlStr, maxRedirects);
  });
}

// Windows Desktop Updater IPC Handler (Hardened against arbitrary binary execution)
ipcMain.handle('app:download-and-install-update', async (_event, updateUrl) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    const launchInstaller = (installerPath) => {
      mainWindow?.webContents.send('update:status', 'installing');
      setTimeout(() => {
        try {
          const child = spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          isQuitting = true;
          app.quit();
        } catch (spawnErr) {
          mainWindow?.webContents.send(
            'update:error',
            'Failed to launch Windows installer: ' + spawnErr.message
          );
        }
      }, 600);
    };

    // Strictly validate update download URL: must be HTTPS and originate from official release repository
    let targetUrl =
      'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe';

    if (updateUrl && typeof updateUrl === 'string') {
      try {
        const parsed = new URL(updateUrl);
        if (
          parsed.protocol === 'https:' &&
          parsed.hostname === 'github.com' &&
          parsed.pathname.startsWith('/Pradeep28012010/WaveCraft/releases/') &&
          parsed.pathname.endsWith('.exe')
        ) {
          targetUrl = updateUrl;
        } else {
          return { success: false, error: 'Untrusted or unapproved update source domain' };
        }
      } catch {
        return { success: false, error: 'Invalid update URL format' };
      }
    }

    mainWindow?.webContents.send('update:status', 'downloading');
    mainWindow?.webContents.send('update:progress', 1);

    const tempDir = app.getPath('temp');
    const tempExePath = path.join(tempDir, 'WaveCraft-Pro-Setup.exe');

    await downloadFileWithProgress(targetUrl, tempExePath, (percent) => {
      mainWindow?.webContents.send('update:progress', percent);
    });

    launchInstaller(tempExePath);
    return { success: true };
  } catch (err) {
    console.error('Electron update failed:', err);
    mainWindow?.webContents.send('update:error', err.message || 'Windows update download failed');
    return { success: false, error: err.message };
  }
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
