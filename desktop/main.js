const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let isReady = false;

const ONLINE_URL = (process.env.QARRAB_SERVER_URL || 'https://qarrib1.vercel.app').replace(/\/+$/, '');
const OFFLINE_MODE = process.env.QARRAB_OFFLINE === '1' || process.argv.includes('--offline');

function getBackendPort() {
  return process.env.BACKEND_PORT || process.env.PORT || 5000;
}

function getLocalUrl() {
  return `http://localhost:${getBackendPort()}`;
}

// Online-first: if the Vercel deployment answers, the desktop app runs
// against it (same data as web/mobile). Otherwise fall back to the bundled
// local backend so the app still opens offline.
function checkOnline() {
  return new Promise((resolve) => {
    if (OFFLINE_MODE) return resolve(false);
    try {
      const lib = ONLINE_URL.startsWith('https') ? require('https') : http;
      const req = lib.get(ONLINE_URL + '/api/health', { timeout: 6000 }, (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch (_) {
      resolve(false);
    }
  });
}

let onlineMode = false;
function getServerUrl() {
  if (process.env.QARRAB_SERVER_URL) return ONLINE_URL;
  return onlineMode ? ONLINE_URL : getLocalUrl();
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendDir = path.join(__dirname, '..', 'backend');
    const runtime = process.env.QARRAB_NODE_PATH || process.execPath;
    const runtimeEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: getBackendPort(),
      DESKTOP_MODE: 'true'
    };
    if (!process.env.QARRAB_NODE_PATH && process.versions.electron) {
      runtimeEnv.ELECTRON_RUN_AS_NODE = '1';
    }

    backendProcess = spawn(runtime, ['src/server.js'], {
      cwd: backendDir,
      shell: false,
      windowsHide: true,
      env: runtimeEnv
    });

    let backendReady = false;

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
      if (data.toString().includes('Qarrab API running')) {
        backendReady = true;
        isReady = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data}`);
      if (data.toString().includes('EADDRINUSE')) {
        reject(new Error(`Port ${getBackendPort()} is already in use — another Qarrib server is running. Close the other window or use a different PORT.`));
      }
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (!backendReady && code !== 0) {
        reject(new Error(`Backend process exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!backendReady) {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill();
        }
        reject(new Error('Backend failed to start within the timeout period'));
      }
    }, 10000);
  });
}

function createWindow() {
  const serverUrl = getServerUrl();

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const iconOption = require('fs').existsSync(iconPath) ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'Qarrab Healthcare',
    backgroundColor: '#F6F3EC',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    ...iconOption
  });

  // Autofit: open maximized on any screen like the website fills the browser,
  // still resizable down to a phone-sized window for testing.
  mainWindow.once('ready-to-show', () => {
    try {
      mainWindow.maximize();
    } catch (_) {}
    mainWindow.show();
  });

  mainWindow.loadURL(serverUrl);

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url !== serverUrl) {
      require('electron').shell.openExternal(details.url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (e) => {
    if (backendProcess) {
      backendProcess.kill();
    }
  });
}

async function setupApp() {
  await app.whenReady();
  try {
    onlineMode = await checkOnline();
    if (onlineMode) {
      console.log(`[Qarrib] Online mode: using ${ONLINE_URL}`);
    } else if (!process.env.QARRAB_SERVER_URL) {
      console.log('[Qarrib] Offline or unreachable — starting local backend...');
      await startBackend();
    }
    createWindow();
  } catch (err) {
    console.error('Failed to start:', err.message);
    // Last resort: still open the window against the online URL so the
    // user gets the live app instead of a dead screen.
    try {
      onlineMode = true;
      createWindow();
    } catch (_) {
      dialog.showErrorBox('Startup Error', err.message + '\n\nThe application cannot start.');
      app.quit();
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.whenReady().then(setupApp).catch((err) => {
  console.error('Failed to start desktop app:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-version', async () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  return {
    version: pkg.version,
    appName: pkg.productName || pkg.name,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle('get-connection-mode', async () => ({
  online: onlineMode,
  serverUrl: getServerUrl(),
  onlineUrl: ONLINE_URL,
}));

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});
