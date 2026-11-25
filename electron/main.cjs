const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, powerSaveBlocker, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isSetupMode = false;
let powerSaveBlockerId = null;

function safeSendToWindow(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function isApprovedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Ensure single running instance on Windows before registering app lifecycle & IPC handlers
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  // High-Performance Chromium Engine Optimization & Resource Efficiency
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('force_high_performance_gpu');

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  // Open external links in system browser (HTTP/HTTPS only) and prevent untrusted in-app navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isApprovedExternalUrl(url)) {
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
          if (isApprovedExternalUrl(navigationUrl)) {
            shell.openExternal(navigationUrl);
          }
        }
      } else if (parsed.protocol !== 'file:') {
        event.preventDefault();
        if (isApprovedExternalUrl(navigationUrl)) {
          shell.openExternal(navigationUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  // Load production bundle or local dev server
  if (devServerUrl) {
    mainWindow.loadURL(isSetupMode ? `${devServerUrl}#/setup` : devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: isSetupMode ? '/setup' : ''
    });
  }

  // Gracefully show window when DOM and styles are ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('maximize', () => {
    safeSendToWindow('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    safeSendToWindow('window:maximized-change', false);
  });

  mainWindow.on('minimize', () => {
    safeSendToWindow('app:visibility-change', false);
  });

  mainWindow.on('restore', () => {
    safeSendToWindow('app:visibility-change', true);
  });

  mainWindow.on('hide', () => {
    safeSendToWindow('app:visibility-change', false);
  });

  mainWindow.on('show', () => {
    safeSendToWindow('app:visibility-change', true);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      if (isSetupMode) {
        isQuitting = true;
        app.quit();
        return;
      }
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        safeSendToWindow('app:visibility-change', false);
      }
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
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
      click: () => safeSendToWindow('media:action', 'togglePlay')
    },
    {
      label: 'Next Track',
      click: () => safeSendToWindow('media:action', 'nextTrack')
    },
    {
      label: 'Previous Track',
      click: () => safeSendToWindow('media:action', 'prevTrack')
    },
    {
      label: 'Mute Audio',
      click: () => safeSendToWindow('media:action', 'toggleMute')
    },
    { type: 'separator' },
    {
      label: 'Open WaveCraft Pro',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
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
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isSetupMode) {
    isQuitting = true;
    app.quit();
  } else {
    mainWindow.close();
  }
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
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

// Download helper with streaming progress, SHA-256 computation & strict HTTPS redirect checking
function isApprovedReleaseHost(hostname) {
  const host = (hostname || '').toLowerCase();
  return (
    host === 'github.com' ||
    host === 'objects.githubusercontent.com' ||
    host === 'release-assets.githubusercontent.com' ||
    host.endsWith('.githubusercontent.com')
  );
}

function downloadFileWithProgress(urlStr, destPath, onProgress, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const https = require('https');
    const crypto = require('crypto');
    const { URL } = require('url');

    let settled = false;
    const fail = (err, fileStream) => {
      if (settled) return;
      settled = true;
      try { fileStream?.destroy(); } catch {}
      fs.unlink(destPath, () => {});
      reject(err);
    };

    const download = (curUrl, redirectsLeft) => {
      if (redirectsLeft <= 0) {
        return fail(new Error('Too many redirects while downloading update'));
      }

      let parsed;
      try {
        parsed = new URL(curUrl);
      } catch (e) {
        return fail(e);
      }

      if (parsed.protocol !== 'https:' || !isApprovedReleaseHost(parsed.hostname)) {
        return fail(new Error('Insecure or unapproved host blocked during update download'));
      }

      const req = https.get(
        curUrl,
        { headers: { 'User-Agent': 'WaveCraft-Pro-Updater' } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            let redirectUrl;
            try {
              redirectUrl = new URL(res.headers.location, curUrl).toString();
              const redParsed = new URL(redirectUrl);
              if (redParsed.protocol !== 'https:' || !isApprovedReleaseHost(redParsed.hostname)) {
                return fail(new Error('Insecure or unapproved redirect blocked during update download'));
              }
            } catch (urlErr) {
              return fail(urlErr);
            }
            return download(redirectUrl, redirectsLeft - 1);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return fail(new Error(`Failed to download update, status code: ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          const hash = crypto.createHash('sha256');
          const fileStream = fs.createWriteStream(destPath, { mode: 0o700 });

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            hash.update(chunk);
            if (totalBytes > 0 && typeof onProgress === 'function') {
              const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
              onProgress(percent);
            }
          });

          res.on('error', (err) => fail(err, fileStream));
          fileStream.on('error', (err) => fail(err, fileStream));

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close((closeErr) => {
              if (closeErr) return fail(closeErr, fileStream);
              if (!settled) {
                settled = true;
                resolve({ destPath, sha256: hash.digest('hex'), bytes: receivedBytes });
              }
            });
          });
        }
      );

      req.setTimeout(30000, () => {
        req.destroy(new Error('Update download timed out'));
      });

      req.on('error', (err) => fail(err));
    };

    download(urlStr, maxRedirects);
  });
}

function fetchOptionalExpectedSha256(urlStr, maxRedirects = 3) {
  return new Promise((resolve) => {
    const https = require('https');
    const { URL } = require('url');
    const run = (curUrl, left) => {
      if (left <= 0) return resolve(null);
      let parsed;
      try { parsed = new URL(curUrl); } catch { return resolve(null); }
      if (parsed.protocol !== 'https:' || !isApprovedReleaseHost(parsed.hostname)) return resolve(null);
      const req = https.get(curUrl, { headers: { 'User-Agent': 'WaveCraft-Pro-Updater' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          try {
            return run(new URL(res.headers.location, curUrl).toString(), left - 1);
          } catch {
            return resolve(null);
          }
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.on('data', (c) => {
          body += c;
          if (body.length > 4096) req.destroy();
        });
        res.on('end', () => {
          const match = body.trim().match(/^([a-fA-F0-9]{64})/);
          resolve(match ? match[1].toLowerCase() : null);
        });
        res.on('error', () => resolve(null));
      });
      req.setTimeout(5000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    };
    run(urlStr, maxRedirects);
  });
}

function verifyPeHeader(filePath) {
  const fs = require('fs');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(2);
    const bytesRead = fs.readSync(fd, buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === 0x4d && buf[1] === 0x5a; // 'MZ'
  } finally {
    fs.closeSync(fd);
  }
}

// Windows Desktop Updater IPC Handler (Hardened against arbitrary binary execution)
ipcMain.handle('app:download-and-install-update', async (_event, updateArg) => {
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');
  let tempUpdateDir = null;

  try {
    const launchInstaller = (installerPath) => {
      safeSendToWindow('update:status', 'installing');
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
          safeSendToWindow(
            'update:error',
            'Failed to launch Windows installer: ' + spawnErr.message
          );
        }
      }, 600);
    };

    const rawUrl = typeof updateArg === 'string' ? updateArg : updateArg?.url;
    const explicitSha256 =
      typeof updateArg === 'object' && typeof updateArg?.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(updateArg.sha256.trim())
        ? updateArg.sha256.trim().toLowerCase()
        : null;

    // Strictly validate update download URL: must be HTTPS and originate from official release repository
    let targetUrl =
      'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe';

    if (rawUrl && typeof rawUrl === 'string') {
      try {
        const parsed = new URL(rawUrl);
        if (
          parsed.protocol === 'https:' &&
          parsed.hostname === 'github.com' &&
          parsed.pathname.startsWith('/Pradeep28012010/WaveCraft/releases/') &&
          parsed.pathname.toLowerCase().endsWith('.exe')
        ) {
          targetUrl = rawUrl;
        } else {
          return { success: false, error: 'Untrusted or unapproved update source domain' };
        }
      } catch {
        return { success: false, error: 'Invalid update URL format' };
      }
    }

    safeSendToWindow('update:status', 'downloading');
    safeSendToWindow('update:progress', 1);

    tempUpdateDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'wavecraft-update-'));
    const tempExePath = path.join(tempUpdateDir, 'WaveCraft-Pro-Setup.exe');

    const [{ sha256, bytes }, sidecarSha256] = await Promise.all([
      downloadFileWithProgress(targetUrl, tempExePath, (percent) => {
        safeSendToWindow('update:progress', percent);
      }),
      explicitSha256 ? Promise.resolve(explicitSha256) : fetchOptionalExpectedSha256(`${targetUrl}.sha256`)
    ]);

    if (bytes < 512 * 1024 || !verifyPeHeader(tempExePath)) {
      fs.rmSync(tempUpdateDir, { recursive: true, force: true });
      safeSendToWindow('update:error', 'Downloaded installer failed integrity check');
      return { success: false, error: 'Downloaded installer failed binary validation' };
    }

    const expectedSha = explicitSha256 || sidecarSha256;
    if (expectedSha && sha256 !== expectedSha) {
      fs.rmSync(tempUpdateDir, { recursive: true, force: true });
      safeSendToWindow('update:error', 'Update package SHA-256 checksum mismatch');
      return { success: false, error: 'Update package checksum mismatch' };
    }

    launchInstaller(tempExePath);
    return { success: true };
  } catch (err) {
    console.error('Electron update failed:', err);
    if (tempUpdateDir) {
      try { fs.rmSync(tempUpdateDir, { recursive: true, force: true }); } catch {}
    }
    safeSendToWindow('update:error', err.message || 'Windows update download failed');
    return { success: false, error: err.message };
  }
});

ipcMain.on('window:finish-setup', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isSetupMode = false;
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(940, 620);
  mainWindow.setSize(1320, 840, true);
  mainWindow.center();
  mainWindow.focus();
});

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

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
