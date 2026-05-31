const state = {
  todos: [],
  filter: 'all',
  selectedColor: '#8e8e93',
  searchResults: [],
  currentContextFile: null,
  searchCount: 0,
};

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem('todos') || '[]');
  } catch { return []; }
}

function saveTodos() {
  localStorage.setItem('todos', JSON.stringify(state.todos));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function getFileExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase() : '?';
}

function renderTodos() {
  const container = document.getElementById('todoList');
  let items = [...state.todos];

  if (state.filter === 'active') items = items.filter(t => !t.completed);
  else if (state.filter === 'completed') items = items.filter(t => t.completed);

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  if (items.length === 0) {
    const msgs = {
      all: { text: '暂无待办', sub: '添加一条待办开始吧' },
      active: { text: '没有进行中的待办', sub: '全部完成！' },
      completed: { text: '没有已完成的待办', sub: '' },
    };
    const msg = msgs[state.filter];
    container.innerHTML = `
      <div class="todo-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
        </svg>
        ${msg.text}
        ${msg.sub ? `<span style="font-size:12px;color:var(--text-tertiary)">${msg.sub}</span>` : ''}
      </div>`;
    return;
  }

  container.innerHTML = items.map(todo => {
    const pinned = todo.pinned;
    return `
      <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}" style="--item-color: ${todo.color}">
        <div class="todo-check ${todo.completed ? 'checked' : ''}" data-action="toggle">
          <svg viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <span class="todo-text" data-action="toggle">${escapeHtml(todo.text)}</span>
        <button class="todo-pin ${pinned ? 'pinned' : ''}" data-action="pin" title="${pinned ? '取消置顶' : '置顶'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
          </svg>
        </button>
        <button class="todo-delete" data-action="delete" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
          </svg>
        </button>
      </div>`;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addTodo(text) {
  if (!text.trim()) return;
  state.todos.push({
    id: generateId(),
    text: text.trim(),
    color: state.selectedColor,
    pinned: false,
    completed: false,
    completedAt: null,
    createdAt: Date.now(),
  });
  saveTodos();
  renderTodos();
  updateStats();
  renderCalendar();
}

function toggleTodo(id) {
  const todo = state.todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? Date.now() : null;
    saveTodos();
    renderTodos();
    updateStats();
    renderCalendar();
  }
}

function deleteTodo(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  saveTodos();
  renderTodos();
  updateStats();
  renderCalendar();
}

function togglePin(id) {
  const todo = state.todos.find(t => t.id === id);
  if (todo) {
    todo.pinned = !todo.pinned;
    saveTodos();
    renderTodos();
  }
}

function updateStats() {
  const total = state.todos.length;
  document.getElementById('todoCount').textContent = `${total} 项`;
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'search') {
      document.getElementById('searchInput').focus();
    }
    if (tab.dataset.tab === 'calendar') {
      hideDayDetail();
      renderCalendar();
    }
  });
});

// Color picker
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    state.selectedColor = dot.dataset.color;
  });
});
document.querySelector('.color-dot').classList.add('active');

// Todo input
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addTodoBtn');

function handleAddTodo() {
  const text = todoInput.value.trim();
  if (text) {
    addTodo(text);
    todoInput.value = '';
    todoInput.focus();
  }
}

todoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAddTodo();
});
addBtn.addEventListener('click', handleAddTodo);

// Todo list event delegation
document.getElementById('todoList').addEventListener('click', (e) => {
  const item = e.target.closest('.todo-item');
  if (!item) return;
  const id = item.dataset.id;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle') toggleTodo(id);
  else if (action === 'delete') deleteTodo(id);
  else if (action === 'pin') togglePin(id);
  else if (!action) toggleTodo(id);
});

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    renderTodos();
  });
});

// Window controls
document.getElementById('min-btn').addEventListener('click', () => {
  window.api.minimizeWindow();
});
document.getElementById('close-btn').addEventListener('click', () => {
  window.api.closeWindow();
});

// Search
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');
const searchResults = document.getElementById('searchResults');
let searchTimeout = null;
let cleanupResultListener = null;
let cleanupDoneListener = null;

function startSearch(query) {
  if (cleanupResultListener) cleanupResultListener();
  if (cleanupDoneListener) cleanupDoneListener();

  window.api.cancelSearch();
  state.searchResults = [];
  state.searchCount = 0;
  searchResults.innerHTML = '';

  if (!query.trim()) {
    searchStatus.textContent = '输入文件名开始搜索';
    return;
  }

  searchStatus.textContent = '搜索中...';
  searchStatus.style.color = 'var(--text-secondary)';

  cleanupResultListener = window.api.onSearchResult((data) => {
    state.searchCount = data.index;
    state.searchResults.push(data);
    appendResult(data);
    searchStatus.textContent = `搜索中... 已找到 ${state.searchCount} 个文件`;
  });

  cleanupDoneListener = window.api.onSearchDone((data) => {
    const total = data.total || state.searchResults.length;
    if (total === 0) {
      searchStatus.textContent = '未找到匹配的文件';
    } else if (data.maxReached) {
      searchStatus.textContent = `结果过多，已显示前 ${total} 个文件（请精确搜索）`;
    } else {
      searchStatus.textContent = `搜索完成，共找到 ${total} 个文件`;
    }
    searchStatus.style.color = 'var(--text-tertiary)';
  });

  window.api.searchFiles(query);
}

function appendResult(data) {
  const div = document.createElement('div');
  div.className = 'search-item';
  div.dataset.path = data.path;
  div.innerHTML = `
    <div class="search-item-icon">${getFileExt(data.name)}</div>
    <div class="search-item-info">
      <div class="search-item-name">${highlightMatch(escapeHtml(data.name), searchInput.value)}</div>
      <div class="search-item-path">${escapeHtml(data.path)}</div>
    </div>
    <div class="search-item-meta">
      ${formatSize(data.size)}<br>${formatDate(data.mtime)}
    </div>`;
  searchResults.appendChild(div);
}

function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => startSearch(searchInput.value.trim()), 300);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimeout);
    startSearch(searchInput.value.trim());
  } else if (e.key === 'Escape') {
    searchInput.value = '';
    startSearch('');
    searchInput.blur();
  }
});

searchBtn.addEventListener('click', () => {
  startSearch(searchInput.value.trim());
});

// Search item click - open file
searchResults.addEventListener('click', (e) => {
  const item = e.target.closest('.search-item');
  if (!item) return;
  window.api.openFile(item.dataset.path);
});

// Context menu for search results
const contextMenu = document.getElementById('contextMenu');

searchResults.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const item = e.target.closest('.search-item');
  if (!item) return;
  state.currentContextFile = item.dataset.path;
  showContextMenu(e.clientX, e.clientY);
});

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    contextMenu.classList.remove('show');
  }
});

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.search-item')) {
    contextMenu.classList.remove('show');
  }
});

function showContextMenu(x, y) {
  const menuWidth = 170;
  const menuHeight = 160;
  const maxX = window.innerWidth - menuWidth;
  const maxY = window.innerHeight - menuHeight;
  contextMenu.style.left = Math.min(x, maxX) + 'px';
  contextMenu.style.top = Math.min(y, maxY) + 'px';
  contextMenu.classList.add('show');
}

contextMenu.addEventListener('click', async (e) => {
  const action = e.target.closest('.menu-item')?.dataset.action;
  if (!action || !state.currentContextFile) return;
  contextMenu.classList.remove('show');

  switch (action) {
    case 'open':
      await window.api.openFile(state.currentContextFile);
      break;
    case 'folder':
      await window.api.openFolder(state.currentContextFile);
      break;
    case 'copy-path':
      await window.api.copyFilePath(state.currentContextFile);
      showToast('路径已复制');
      break;
    case 'copy-file':
      await window.api.copyFile(state.currentContextFile);
      showToast('文件已复制');
      break;
  }
});

// Toast notification
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: var(--bg-secondary); color: var(--text-primary);
      padding: 8px 16px; border-radius: 6px; font-size: 12px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow); z-index: 9999;
      transition: opacity 0.3s; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
}

// Calendar
const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const DAYS_CN = ['一', '二', '三', '四', '五', '六', '日'];
let calYear, calMonth;

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function tsToDateKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

function renderCalendar() {
  document.getElementById('calTitle').textContent = `${calYear}年 ${MONTHS_CN[calMonth]}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  const createdByDay = {};
  const doneByDay = {};
  for (const t of state.todos) {
    const ck = tsToDateKey(t.createdAt);
    if (ck) createdByDay[ck] = (createdByDay[ck] || 0) + 1;
    if (t.completedAt) {
      const dk = tsToDateKey(t.completedAt);
      if (dk) doneByDay[dk] = (doneByDay[dk] || 0) + 1;
    }
  }

  let monthCreated = 0, monthDone = 0, monthPending = 0;
  let html = '<div class="cal-row cal-header">';
  for (const d of DAYS_CN) {
    html += `<div class="cal-cell cal-day-name">${d}</div>`;
  }
  html += '</div>';

  let day = 1;
  for (let row = 0; row < 6; row++) {
    if (day > daysInMonth) break;
    html += '<div class="cal-row">';
    for (let col = 0; col < 7; col++) {
      if ((row === 0 && col < startOffset) || day > daysInMonth) {
        html += '<div class="cal-cell cal-empty"></div>';
      } else {
        const dk = dateKey(calYear, calMonth, day);
        const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
        const created = createdByDay[dk] || 0;
        const done = doneByDay[dk] || 0;

        monthCreated += created;
        monthDone += done;

        html += `<div class="cal-cell cal-day${isToday ? ' cal-today' : ''}" data-date="${dk}" data-created="${created}" data-done="${done}">
          <span class="cal-day-num">${day}</span>
          <div class="cal-day-badges">`;
        if (created > 0) html += `<span class="cal-badge cal-badge-created">${created}</span>`;
        if (done > 0) html += `<span class="cal-badge cal-badge-done">${done}</span>`;
        html += `</div></div>`;
        day++;
      }
    }
    html += '</div>';
  }

  document.getElementById('calGrid').innerHTML = html;

  monthPending = state.todos.filter(t => !t.completed).length;
  document.getElementById('calCreatedCount').textContent = monthCreated;
  document.getElementById('calDoneCount').textContent = monthDone;
  document.getElementById('calPendingCount').textContent = monthPending;
}

function showDayDetail(dateStr) {
  const created = state.todos.filter(t => tsToDateKey(t.createdAt) === dateStr);
  const done = state.todos.filter(t => t.completedAt && tsToDateKey(t.completedAt) === dateStr);

  const parts = dateStr.split('-');
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const weekDay = DAYS_CN[d.getDay() === 0 ? 6 : d.getDay() - 1];
  document.getElementById('calDetailTitle').textContent = `${parts[0]}年${+parts[1]}月${+parts[2]}日 周${weekDay}`;

  const createdList = document.getElementById('calDetailCreatedList');
  const doneList = document.getElementById('calDetailDoneList');
  const emptyEl = document.getElementById('calDetailEmpty');

  if (created.length === 0 && done.length === 0) {
    createdList.innerHTML = '';
    doneList.innerHTML = '';
    document.getElementById('calDetailCreated').style.display = 'none';
    document.getElementById('calDetailDone').style.display = 'none';
    emptyEl.classList.add('show');
  } else {
    emptyEl.classList.remove('show');

    if (created.length > 0) {
      document.getElementById('calDetailCreated').style.display = '';
      createdList.innerHTML = created.map(t => `
        <div class="cal-detail-item" style="--item-color:${t.color}">${escapeHtml(t.text)}</div>
      `).join('');
    } else {
      document.getElementById('calDetailCreated').style.display = 'none';
    }

    if (done.length > 0) {
      document.getElementById('calDetailDone').style.display = '';
      doneList.innerHTML = done.map(t => `
        <div class="cal-detail-item cal-detail-item-done" style="--item-color:${t.color}">${escapeHtml(t.text)}</div>
      `).join('');
    } else {
      document.getElementById('calDetailDone').style.display = 'none';
    }
  }

  document.getElementById('calGrid').style.display = 'none';
  document.getElementById('calDayDetail').classList.add('show');
}

function hideDayDetail() {
  document.getElementById('calDayDetail').classList.remove('show');
  document.getElementById('calGrid').style.display = 'flex';
}

function goToPrevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function goToNextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function goToToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

document.getElementById('calPrev').addEventListener('click', goToPrevMonth);
document.getElementById('calNext').addEventListener('click', goToNextMonth);
document.getElementById('calToday').addEventListener('click', goToToday);
document.getElementById('calBack').addEventListener('click', hideDayDetail);

document.getElementById('calGrid').addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-day');
  if (cell) showDayDetail(cell.dataset.date);
});

// Init
state.todos = loadTodos();
renderTodos();
updateStats();
initCalendar();

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (contextMenu.classList.contains('show')) {
      contextMenu.classList.remove('show');
    }
  }
});
