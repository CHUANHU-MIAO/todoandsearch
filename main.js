const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;
let abortController = null;
const CONCURRENCY = 12;
const MAX_RESULTS = 3000;

// 跳过的系统目录 - 扩展列表提高速度
const SKIP_DIRS = new Set([
  'windows', 'winnt', 'winxs', '$recycle.bin', 'system volume information',
  'program files', 'program files (x86)', 'programdata', 'perflogs',
  'appdata', 'application data', 'local settings', 'common files',
  'temp', 'tmp', 'cache', 'cached', '.git', 'node_modules', '.svn', '.hg',
  'recovery', 'boot', 'system32', 'syswow64', 'config.msi', 'drivers',
  'msocache', 'installer', '$windows.~ws', '$windows.~bt', '$getcurrent',
  'python27', 'python31', 'python38', 'python39', 'python310', 'python311',
  'android', '.android', '.vscode', '.idea', '__pycache__', '.nuget',
  'microsoft', 'packages', 'nuget', 'pip', 'npm', 'yarn',
  'crashdumps', 'errorreports', 'telemetry', 'diagnostics',
]);

// 文档类扩展名
const DOC_EXTS = new Set([
  'doc', 'docx', 'pdf', 'txt', 'rtf', 'odt', 'wps',
  'xls', 'xlsx', 'csv', 'ods', 'et', 'ett',
  'ppt', 'pptx', 'odp', 'dps', 'dpt',
  'md', 'markdown', 'rst', 'tex', 'latex',
  'epub', 'mobi', 'azw3', 'fb2',
  'pages', 'numbers', 'key',
]);

// 图片类扩展名
const IMG_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif',
  'psd', 'ai', 'eps', 'raw', 'cr2', 'nef', 'arw', 'dng',
  'heic', 'heif', 'avif', 'jxl', 'apng',
]);

function shouldSkipDir(name) {
  const lower = name.toLowerCase();
  if (SKIP_DIRS.has(lower)) return true;
  if (name.startsWith('$')) return true;
  if (name.startsWith('.')) return true;
  return false;
}

// 获取文件分类
function getFileCategory(name, isDir) {
  if (isDir) return 'folder';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (DOC_EXTS.has(ext)) return 'document';
  if (IMG_EXTS.has(ext)) return 'image';
  return 'other';
}

// 模糊匹配：检查 query 的每个字是否按顺序出现在 name 中
function fuzzyMatch(name, query) {
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();
  let nameIndex = 0;
  for (let i = 0; i < queryLower.length; i++) {
    const char = queryLower[i];
    const foundIndex = nameLower.indexOf(char, nameIndex);
    if (foundIndex === -1) return false;
    nameIndex = foundIndex + 1;
  }
  return true;
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
  if (signal.aborted || depth > 12) return;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subdirs = [];
    for (const entry of entries) {
      if (signal.aborted) return;
      try {
        if (entry.isDirectory()) {
          // 文件夹也参与匹配
          if (fuzzyMatch(entry.name, query)) {
            onResult({
              name: entry.name,
              path: path.join(dirPath, entry.name),
              size: 0,
              mtime: null,
              category: 'folder',
            });
          }
          if (!shouldSkipDir(entry.name)) {
            subdirs.push(path.join(dirPath, entry.name));
          }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (fuzzyMatch(entry.name, query)) {
            onResult({
              name: entry.name,
              path: path.join(dirPath, entry.name),
              size: 0,
              mtime: null,
              category: getFileCategory(entry.name, false),
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
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    show: false,
    backgroundColor: '#1e1e2e',
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
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('toggle-pin-window', (event, enabled) => {
  if (!mainWindow) return;
  mainWindow.setSkipTaskbar(enabled);
  if (enabled) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    mainWindow.setAlwaysOnTop(false);
  }
});

ipcMain.handle('get-window-bounds', () => {
  if (!mainWindow) return null;
  return mainWindow.getBounds();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
});
