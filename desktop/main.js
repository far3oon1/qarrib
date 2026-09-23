const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let isReady = false;

function getBackendPort() {
  return process.env.BACKEND_PORT || 5000;
}

function getServerUrl() {
  return process.env.QARRAB_SERVER_URL || `http://localhost:${getBackendPort()}`;
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

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
      if (data.toString().includes('Qarrab API running')) {
        isReady = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data}`);
      if (data.toString().includes('EADDRINUSE')) {
        isReady = true;
        resolve();
      }
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });

    setTimeout(() => {
      if (!isReady) {
        isReady = true;
        resolve();
      }
    }, 5000);
  });
}

function createWindow() {
  const port = getBackendPort();
  const serverUrl = getServerUrl();

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const iconOption = require('fs').existsSync(iconPath) ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Qarrab Healthcare',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    ...iconOption
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
  if (!process.env.QARRAB_SERVER_URL) {
    await startBackend();
  }
  createWindow();

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

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});
