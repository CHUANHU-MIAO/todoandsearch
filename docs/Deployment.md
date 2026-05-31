# 部署指南

## 目录

- [本地开发环境](#本地开发环境)
- [GitHub Actions 自动构建](#github-actions-自动构建)
- [手动打包](#手动打包)
- [发布新版本](#发布新版本)
- [关于图标](#关于图标)

---

## 本地开发环境

### 系统要求

- **操作系统**: Windows 10/11
- **Node.js**: >= 20.x
- **npm**: >= 10.x
- **Git**: 任意版本

### 完整设置步骤

```powershell
# 1. 安装 Node.js
#    从 https://nodejs.org/ 下载 LTS 版本并安装

# 2. 验证安装
node --version   # 应输出 v20.x.x 或更高
npm --version    # 应输出 10.x.x 或更高

# 3. 克隆项目
git clone https://github.com/YOUR_USERNAME/todoandsearch.git
cd todoandsearch

# 4. 安装依赖
npm install
```

### 依赖说明

| 依赖 | 类型 | 用途 |
|------|------|------|
| `electron` | devDependency | 桌面应用框架 |
| `electron-builder` | devDependency | 打包构建工具 |

### 开发命令

| 命令 | 说明 |
|------|------|
| `npm start` | 以开发模式启动应用 |
| `npm run pack` | 打包到目录（不压缩） |
| `npm run dist` | 完整打包（所有平台） |
| `npm run dist:win` | 仅打包 Windows 平台 |

---

## GitHub Actions 自动构建

项目配置了 GitHub Actions CI/CD 工作流，位于 `.github/workflows/build.yml`。

### 触发条件

工作流在以下情况自动触发：

| 事件 | 行为 |
|------|------|
| `push` 到 `main` 分支 | 执行构建并上传构建产物为 Artifact |
| 推送 `v*` 标签（如 `v1.0.0`） | 构建 + 创建 GitHub Release 并上传附件 |
| PR 到 `main` 分支 | 仅执行构建验证 |

### 工作流内容

```yaml
# .github/workflows/build.yml
- windows-latest 运行器
- Node.js 20
- npm ci 安装依赖
- node scripts/generate-icon.js 生成图标
- npm run dist:win 打包
- 上传 release/ 目录为构建产物
- 打标签时自动创建 Release
```

### 构建产物

成功构建后会生成以下文件：

```
release/
├── TodoSearch-1.0.0-64.exe        # NSIS 安装包
├── TodoSearch-1.0.0-64-portable.exe  # 便携版
└── builder-effective-config.yaml   # 构建配置快照
```

### 手动触发 Release

要发布一个新版本：

```powershell
# 1. 更新版本号（在 package.json 中）
#    将 version 改为新版本号

# 2. 提交并打标签
git add package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1

# 3. 推送到 GitHub
git push origin main
git push origin v1.0.1
```

推送标签后，GitHub Actions 会自动构建并创建 Release。

---

## 手动打包

如果不想使用 CI，也可以在本地直接打包：

```powershell
# 确保依赖完整
npm install

# 生成图标（如尚未生成）
node scripts/generate-icon.js

# 打包
npm run dist:win
```

产物在 `release/` 目录下。

### electron-builder 配置

配置位于 `package.json` 的 `"build"` 字段：

```json
{
  "build": {
    "appId": "com.todosearch.app",
    "productName": "TodoSearch",
    "directories": { "output": "release" },
    "files": [
      "main.js", "preload.js", "index.html",
      "style.css", "renderer.js", "package.json"
    ],
    "win": {
      "target": ["portable", "nsis"],
      "icon": "build/icon.png"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

---

## 发布新版本

完整发布流程：

```powershell
# 1. 确认所有代码已提交
git status

# 2. 更新版本号
#    编辑 package.json 中的 version 字段

# 3. 更新 README 中的版本信息（如有需要）

# 4. 提交更改
git add -A
git commit -m "release: v1.0.1"

# 5. 创建版本标签
git tag v1.0.1

# 6. 推送代码和标签
git push origin main
git push origin v1.0.1

# 7. 等待 GitHub Actions 自动构建完成
#    构建完成后在仓库 Releases 页面查看
```

---

## 关于图标

应用图标通过 `scripts/generate-icon.js` 脚本生成。

### 图标规格

| 属性 | 值 |
|------|-----|
| 尺寸 | 256×256 |
| 格式 | PNG |
| 颜色 | 紫色渐变 (#6c5ce7) |
| 形状 | 径向渐变圆形 |

### 自定义图标

如需自定义图标，替换 `build/icon.png` 文件即可。

要求：
- 尺寸: 至少 256×256
- 格式: PNG（推荐）或 ICO
- Windows 要求: 建议提供 256×256 的 PNG

---
