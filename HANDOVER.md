# 项目交接文档 (Project Handover)

## 1. 项目概述 (Overview)
本项目是一个 **"MetaSeekOJ 本地化运维仪表盘" (Ops Dashboard)**。
它的核心目标是让开发者在本地机器 (WSL2/Linux) 上，通过可视化界面管理远程腾讯云服务器 (Ubuntu)。

**核心功能**:
*   **系统监控**: 查看远程服务器 CPU/内存、SSH 连接状态、核心服务 (Django, Nginx, Judge) 健康度。
*   **代码发布**: 本地构建前端 (React/Vue)，并一键 rsync 同步代码到远程。
*   **服务管理**: 重启后端、Nginx，修复 Scratch 编辑器等。
*   **日志监控**: 实时查看远程日志文件。

## 2. 技术架构 (Architecture)

项目采用 **前后端分离** 架构，通过本地 Loopback 通信：

```mermaid
graph TD
    A[React 前端] -- HTTP API --> B[FastAPI 后端]
    B -- Python 调用 --> C[MCP 核心逻辑 (CodeSyncMCP)]
    C -- SSH / Rsync --> D[远程腾讯云服务器]
```

### 2.1 前端 (Frontend)
*   **路径**: `/frontend`
*   **技术栈**: React 18, Vite, Tailwind CSS, Shadcn UI, Lucide Icons.
*   **来源**: 基于用户提供的 Figma 设计稿代码 (`Opsdashboarddesignspec`) 改造。
*   **关键文件**:
    *   `src/app/components/pages/*`: 各个功能页面 (Dashboard, Deployment, Services, Logs).
    *   `src/lib/api.ts`: Axios 封装，处理与后端通信。
    *   `vite.config.ts`: 配置了 `/api` 代理转发到后端 `8000` 端口。

### 2.2 后端 (Backend)
*   **路径**: `/backend`
*   **技术栈**: Python FastAPI, Uvicorn.
*   **职责**: 作为 API 网关，接收前端请求，调用底层的运维脚本。
*   **关键文件**:
    *   `main.py`: 定义 API 路由 (`/api/status`, `/api/sync`, `/api/restart` 等)。

### 2.3 核心逻辑 (Core Logic)
*   **路径**: `/mcp-servers/code-sync/server.py`
*   **类名**: `CodeSyncMCP`
*   **职责**: 
    *   封装了 `sshpass` 和 `rsync` 命令。
    *   管理服务器配置文件 (`config.json` / `tencent_servers.json`)。
    *   执行具体的运维任务（如 `check_status`, `sync_code`）。

## 3. 快速开始 (Quick Start)

需要同时启动后端和前端服务。

### 3.1 启动后端
在终端 1 中运行：
```bash
cd backend
# 确保已安装依赖: pip install fastapi uvicorn
./run_backend.sh
# 服务将运行在 http://0.0.0.0:8000
```

### 3.2 启动前端
在终端 2 中运行：
```bash
cd frontend
# 确保已安装依赖: npm install
npm run dev
# 服务将运行在 http://localhost:5173
```

访问浏览器: **http://localhost:5173**

## 4. 已完成工作 (Status)

### ✅ 已实现
1.  **界面迁移**: 成功将 Figma 设计稿代码运行起来，并修复了 React 依赖问题。
2.  **API 对接**:
    *   **概览页**: 真实显示服务器 IP、SSH 状态、服务列表状态。
    *   **部署页**: 支持 "Vue Admin" 和 "React Client" 的本地构建调用；支持 "All/Backend/Frontend" 的代码同步。
    *   **服务页**: 实现了 "重启后端"、"修复 Scratch" 的真实调用。
    *   **日志页**: 实现了日志文件的实时 tail 读取 (支持 5s 自动刷新)。
3.  **配置管理**: 前端支持添加/切换服务器配置 (保存到本地 json)。

### 🚧 待优化 / 已知问题
1.  **单文件同步**: 前端 "同步单个文件" 功能目前仅有 UI，后端 API 尚未完全支持细粒度的单文件路径校验。
2.  **构建日志流**: 目前构建过程是阻塞的，日志会在构建完成后一次性返回。如下一步有需求，可改为 WebSocket 推送实时日志。
3.  **安全性**: 目前后端 API 没有任何鉴权 (CORS 开放)，仅限本地 `localhost` 使用。如果暴露到公网需加 Token 验证。

## 5. 项目资源导航 (Resources)

### 📂 项目目录
*   **项目根目录**: `/home/sharelgx/MetaSeekOJdev`
*   **前端代码**: `/home/sharelgx/MetaSeekOJdev/frontend`
*   **后端代码**: `/home/sharelgx/MetaSeekOJdev/backend`

### 📄 关键文档
*   **设计规范文档**: [`/home/sharelgx/MetaSeekOJdev/.trae/documents/DESIGN_OpsDashboard.md`](file:///home/sharelgx/MetaSeekOJdev/.trae/documents/DESIGN_OpsDashboard.md)
*   **本交接文档**: [`/home/sharelgx/MetaSeekOJdev/HANDOVER.md`](file:///home/sharelgx/MetaSeekOJdev/HANDOVER.md)

## 6. 关键文件索引 (File Index)

| 路径 | 说明 |
| :--- | :--- |
| `frontend/vite.config.ts` | 前端代理配置，解决跨域问题 |
| `frontend/src/app/components/ui/api.ts` | 前端 API 定义文件 |
| `backend/main.py` | 后端 API 入口 |
| `mcp-servers/code-sync/server.py` | **核心**：所有运维逻辑的 Python 实现 |
| `ops_dashboard.py` | (已废弃) 旧版 Streamlit 尝试，可删除 |

## 7. 给接手 AI 的提示 (Prompt for Next AI)
> "你好，这是一个基于 React + FastAPI 的本地运维工具。前端代码在 `frontend/`，后端在 `backend/`。核心运维逻辑复用了 `mcp-servers/code-sync/server.py` 中的 `CodeSyncMCP` 类。目前的任务重点是维护和扩展前端功能。请注意 `frontend/vite.config.ts` 中配置了 API 代理。如果需要修改运维逻辑（如新增重启服务），请先在 `server.py` 中添加方法，然后在 `backend/main.py` 暴露接口，最后在前端调用。"
