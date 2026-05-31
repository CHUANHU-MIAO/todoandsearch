# TodoSearch — 桌面悬浮待办清单与文件搜索工具

一个 Windows 桌面小工具，集成**待办清单管理**和**全盘文件搜索**两大功能于一个可拖拽的悬浮窗中。

## 功能一览

| 功能 | 说明 |
|------|------|
| 📋 **待办清单** | 添加、完成、删除、置顶待办，支持 8 种颜色分类 |
| 📅 **月视图** | 按月浏览待办的新增与完成情况，点按日期查看详情 |
| 🔍 **文件搜索** | 全盘按文件名快速搜索，实时流式返回结果 |
| 📂 **文件操作** | 搜索后可直接打开文件/所在文件夹/复制路径/复制文件 |
| 🪟 **悬浮窗** | 窗口置顶，可拖拽、最小化、隐藏到系统托盘 |
| 💾 **本地存储** | 待办数据自动保存至浏览器 localStorage |

## 快速开始

### 下载使用（推荐）

从 [Releases](https://github.com/YOUR_USERNAME/todoandsearch/releases) 下载最新版本：

| 文件 | 说明 |
|------|------|
| `TodoSearch-*-portable.exe` | 便携版，下载即用，无需安装 |
| `TodoSearch-*-Setup.exe` | 安装版，会创建开始菜单快捷方式 |

### 本地开发运行

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/todoandsearch.git
cd todoandsearch

# 安装依赖
npm install

# 启动开发模式
npm start
```

### 本地打包构建

```bash
# 安装依赖（如未安装）
npm install

# 生成图标
node scripts/generate-icon.js

# 构建 Windows 安装包
npm run dist:win
```

构建产物输出到 `release/` 目录。

## 使用说明

### 待办清单

1. 点击顶部色块选择分类颜色
2. 在输入框中输入待办内容，按 Enter 或点击「添加」
3. 点击待办左侧圆圈标记完成/未完成
4. 点击星标 ⭐ 置顶/取消置顶
5. 点击垃圾桶 🗑️ 删除待办
6. 使用「全部/进行中/已完成」筛选视图

**颜色分类**：默认 · 工作 · 学习 · 个人 · 提醒 · 重要 · 紧急 · 生活

### 月视图

- 按月显示日历网格，每个日期标注新增和完成的数量
- 点击日期查看当日待办活动的详细列表
- 使用 ◀ ▶ 切换月份，点「今天」回到当前月

### 文件搜索

1. 切换到「搜索」标签
2. 输入文件名关键词（支持中文）
3. 结果实时流式显示，可即时点开文件
4. 右键搜索结果弹出菜单：
   - 打开文件
   - 打开所在文件夹
   - 复制文件路径
   - 复制文件本身（可在资源管理器中粘贴）

> 搜索上限 3000 条结果，如需精确查找请缩小关键词。

### 窗口操作

- **拖拽**：按住顶部标题栏拖动窗口
- **最小化**：点击标题栏 `—` 按钮
- **隐藏到托盘**：点击标题栏 `✕` 按钮（应用不退出）
- **托盘菜单**：右键系统托盘图标可显示/隐藏或退出

## 技术栈

- **框架**: Electron 33
- **UI**: HTML + CSS + JavaScript（原生，无框架依赖）
- **打包**: electron-builder
- **平台**: Windows（GitHub Actions 自动构建）

## 项目结构

```
todoandsearch/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本（IPC 桥接）
├── index.html           # 主界面
├── style.css            # 样式表
├── renderer.js          # 渲染进程逻辑
├── scripts/
│   └── generate-icon.js # 图标生成脚本
├── build/
│   └── icon.png         # 应用图标
├── .github/workflows/
│   └── build.yml        # CI/CD 自动构建
└── package.json         # 项目配置与构建脚本
```

## License

MIT
