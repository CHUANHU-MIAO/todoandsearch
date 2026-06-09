const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;
let abortController = null;
const CONCURRENCY = 8;
const MAX_RESULTS = 3000;
const BATCH_SIZE = 50;
const CACHE_TTL = 30000; // 30 秒缓存

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

// 模糊匹配：预计算名字的字符位置索引，大幅加速循环内的匹配
function fuzzyMatch(name, query) {
  const nameLen = name.length;
  const queryLen = query.length;
  if (queryLen === 0) return true;
  if (nameLen < queryLen) return false;

  let nameIdx = 0;
  for (let i = 0; i < queryLen; i++) {
    const ch = query[i];
    // 手动内联 charCodeAt 比较，比 toLowerCase + indexOf 快
    let found = false;
    for (let j = nameIdx; j < nameLen; j++) {
      if (name[j] === ch) {
        nameIdx = j + 1;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

// 预计算：将 query 和 name 都转为 lowercase 数组（允许一次分配）
function prepareQuery(query) {
  return { raw: query, lower: query.toLowerCase(), chars: Array.from(query.toLowerCase()) };
}

function fuzzyMatchPrepared(nameLower, prep) {
  const nameLen = nameLower.length;
  const chars = prep.chars;
  const queryLen = chars.length;
  if (queryLen === 0) return true;
  if (nameLen < queryLen) return false;

  let nameIdx = 0;
  for (let i = 0; i < queryLen; i++) {
    const ch = chars[i];
    let found = false;
    for (let j = nameIdx; j < nameLen; j++) {
      if (nameLower[j] === ch) {
        nameIdx = j + 1;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

// 搜索结果缓存
const searchCache = new Map();
function getCachedResults(query) {
  const entry = searchCache.get(query);
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.results;
  }
  return null;
}
function setCachedResults(query, results) {
  searchCache.set(query, { results, time: Date.now() });
  // 限制缓存数量
  if (searchCache.size > 20) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].time - b[1].time)[0];
    if (oldest) searchCache.delete(oldest[0]);
  }
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

function getAvailableDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    try { fsSync.accessSync(letter + ':\\', fsSync.constants.R_OK); drives.push(letter + ':\\'); } catch (e) {}
  }
  return Promise.resolve(drives);
}

async function searchInDir(dirPath, prep, signal, resultsRef, depth = 0) {
  if (signal.aborted || depth > 8) return;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subdirs = [];

    for (const entry of entries) {
      if (signal.aborted) {
        resultsRef.aborted = true;
        return;
      }
      try {
        const nameLower = entry.name.toLowerCase();
        if (entry.isDirectory()) {
          if (fuzzyMatchPrepared(nameLower, prep)) {
            resultsRef.buffer.push({
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
          if (fuzzyMatchPrepared(nameLower, prep)) {
            resultsRef.buffer.push({
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

    // 并行处理子目录
    for (let i = 0; i < subdirs.length; i += CONCURRENCY) {
      if (signal.aborted || resultsRef.aborted) return;
      const batch = subdirs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(d =>
        searchInDir(d, prep, signal, resultsRef, depth + 1)
      ));
    }
  } catch (e) {}
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
    backgroundColor: '#0f0f14',
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
  const win = BrowserWindow.fromWebContents(event.sender);
  const prep = prepareQuery(query);

  // 检查缓存
  const cached = getCachedResults(query);
  if (cached) {
    // 缓存命中：一次性发送所有结果
    if (win && !win.isDestroyed()) {
      win.webContents.send('search-batch', cached);
      win.webContents.send('search-done', { total: cached.length, maxReached: cached.length >= MAX_RESULTS, cached: true });
    }
    abortController = null;
    return;
  }

  // 收集所有驱动器结果，批量发送
  const allBuffer = [];

  const sendBatch = () => {
    if (signal.aborted || !win || win.isDestroyed()) return;
    if (allBuffer.length === 0) return;
    const batch = allBuffer.splice(0, allBuffer.length);
    win.webContents.send('search-batch', batch);
  };

  let totalSent = 0;

  // 驱动级并行：一次性启动所有驱动器
  getAvailableDrives().then(drives => {
    if (signal.aborted) return;

    const homeDrive = process.env.USERPROFILE ? process.env.USERPROFILE.split(':')[0] + ':\\' : null;
    if (homeDrive) {
      const idx = drives.indexOf(homeDrive);
      if (idx > 0) { drives.splice(idx, 1); drives.unshift(homeDrive); }
    }

    Promise.all(drives.map(drive => {
      const ref = { buffer: [], aborted: false };
      return searchInDir(drive, prep, signal, ref).then(() => {
        if (signal.aborted || ref.aborted) return;
        for (const r of ref.buffer) {
          if (totalSent >= MAX_RESULTS) { abortController.abort(); break; }
          totalSent++;
          allBuffer.push(r);
          if (allBuffer.length >= BATCH_SIZE) sendBatch();
        }
      });
    })).finally(() => {
      sendBatch();
      if (!signal.aborted && win && !win.isDestroyed()) {
        win.webContents.send('search-done', { total: totalSent, maxReached: totalSent >= MAX_RESULTS });
      }
    });
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
  // 固定模式下：禁止拖动（CSS）、禁止调整大小、隐藏任务栏图标
  mainWindow.setResizable(!enabled);
  mainWindow.setSkipTaskbar(enabled);
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
