const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;
let abortController = null;
const CONCURRENCY = 6;
const MAX_RESULTS = 3000;

const SKIP_DIRS = new Set([
  'windows', 'winnt', 'winxs', '$recycle.bin', 'system volume information',
  'program files', 'program files (x86)', 'programdata',
  'appdata', 'application data', 'local settings',
  'temp', 'tmp', 'cache', 'cached', '.git', 'node_modules',
  'recovery', 'boot', 'system32', 'syswow64', 'config.msi',
  'msocache', 'installer', '$windows.~ws', '$windows.~bt',
  'python27', 'python31', 'python38', 'python39', 'python310',
]);

function shouldSkipDir(name) {
  const lower = name.toLowerCase();
  if (SKIP_DIRS.has(lower)) return true;
  if (name.startsWith('$')) return true;
  if (name.startsWith('.')) return true;
  return false;
}

function createTrayIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist < 10) {
        const alpha = Math.max(0, Math.min(255, Math.round((1 - dist / 10) * 255)));
        buf[i] = 108; buf[i + 1] = 92; buf[i + 2] = 231;
        buf[i + 3] = alpha;
      } else {
        buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

async function getAvailableDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    try {
      await fs.access(letter + ':\\');
      drives.push(letter + ':\\');
    } catch (e) {}
  }
  return drives;
}

async function searchInDir(dirPath, query, signal, onResult, depth = 0) {
  if (signal.aborted || depth > 15) return;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subdirs = [];
    for (const entry of entries) {
      if (signal.aborted) return;
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          if (!shouldSkipDir(entry.name)) {
            subdirs.push(fullPath);
          }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (entry.name.toLowerCase().includes(query.toLowerCase())) {
            let stat;
            try {
              stat = await fs.stat(fullPath);
            } catch (e) {
              stat = { size: 0, mtime: new Date(0) };
            }
            onResult({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
            });
          }
        }
      } catch (e) {}
    }
    for (let i = 0; i < subdirs.length; i += CONCURRENCY) {
      if (signal.aborted) return;
      const batch = subdirs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(d => searchInDir(d, query, signal, onResult, depth + 1)));
    }
  } catch (e) {}
}

async function searchAllDrives(query, signal, onResult) {
  const drives = await getAvailableDrives();
  const homeDrive = process.env.USERPROFILE ? process.env.USERPROFILE.split(':')[0] + ':\\' : null;
  if (homeDrive) {
    const idx = drives.indexOf(homeDrive);
    if (idx > 0) {
      drives.splice(idx, 1);
      drives.unshift(homeDrive);
    }
  }
  for (const drive of drives) {
    if (signal.aborted) break;
    await searchInDir(drive, query, signal, onResult);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 580,
    minWidth: 340,
    minHeight: 440,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    show: false,
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Todo & Search');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

ipcMain.on('search-files', (event, query) => {
  if (!query || query.trim().length === 0) return;
  query = query.trim();
  abortController = new AbortController();
  const signal = abortController.signal;
  let count = 0;
  const win = BrowserWindow.fromWebContents(event.sender);
  searchAllDrives(query, signal, (result) => {
    if (count >= MAX_RESULTS) {
      abortController.abort();
      return;
    }
    count++;
    if (!signal.aborted && win && !win.isDestroyed()) {
      win.webContents.send('search-result', { ...result, index: count });
    }
  }).then(() => {
    if (!signal.aborted && win && !win.isDestroyed()) {
      win.webContents.send('search-done', { total: count, maxReached: count >= MAX_RESULTS });
    }
  }).catch(() => {
    if (!signal.aborted && win && !win.isDestroyed()) {
      win.webContents.send('search-done', { total: count, maxReached: count >= MAX_RESULTS });
    }
  });
});

ipcMain.on('search-cancel', () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
});

ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('open-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('copy-file-path', async (event, filePath) => {
  try {
    clipboard.writeText(filePath);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('copy-file', async (event, filePath) => {
  try {
    const ps = `Set-Clipboard -Path "${filePath.replace(/"/g, '`"')}"`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -EncodedCommand ${encoded}`);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('min-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.hide();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
});
