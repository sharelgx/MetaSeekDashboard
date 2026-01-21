# MetaSeek Dashboard

MetaSeekOJ 本地化运维仪表盘 (Ops Dashboard)

## 项目概述

本项目是一个 **"MetaSeekOJ 本地化运维仪表盘" (Ops Dashboard)**。
它的核心目标是让开发者在本地机器 (WSL2/Linux) 上，通过可视化界面管理远程腾讯云服务器 (Ubuntu)。

**核心功能**:
*   **系统监控**: 查看远程服务器 CPU/内存、SSH 连接状态、核心服务 (Django, Nginx, Judge) 健康度。
*   **代码发布**: 本地构建前端 (React/Vue)，并一键 rsync 同步代码到远程。
*   **服务管理**: 重启后端、Nginx，修复 Scratch 编辑器等。
*   **日志监控**: 实时查看远程日志文件。

## 技术架构

项目采用 **前后端分离** 架构，通过本地 Loopback 通信：

```
React 前端 -- HTTP API --> FastAPI 后端 -- Python 调用 --> MCP 核心逻辑 -- SSH / Rsync --> 远程腾讯云服务器
```

### 前端 (Frontend)
*   **路径**: `/frontend`
*   **技术栈**: React 18, Vite, Tailwind CSS, Shadcn UI, Lucide Icons.
*   **关键文件**:
    *   `src/app/components/pages/*`: 各个功能页面 (Dashboard, Deployment, Services, Logs).
    *   `src/lib/api.ts`: Axios 封装，处理与后端通信。
    *   `vite.config.ts`: 配置了 `/api` 代理转发到后端 `8000` 端口。

### 后端 (Backend)
*   **路径**: `/backend`
*   **技术栈**: Python FastAPI, Uvicorn.
*   **职责**: 作为 API 网关，接收前端请求，调用底层的运维脚本。
*   **关键文件**:
    *   `main.py`: 定义 API 路由 (`/api/status`, `/api/sync`, `/api/restart` 等)。

## 快速开始

需要同时启动后端和前端服务。

### 启动后端
在终端 1 中运行：
```bash
cd backend
# 确保已安装依赖: pip install fastapi uvicorn
python main.py
# 服务将运行在 http://0.0.0.0:8000
```

### 启动前端
在终端 2 中运行：
```bash
cd frontend
# 确保已安装依赖: npm install
npm run dev
# 服务将运行在 http://localhost:5173
```

访问浏览器: **http://localhost:5173**

## 项目结构

```
Opsdashboarddesignspec/
├── frontend/          # React 前端应用
├── backend/           # FastAPI 后端服务
├── docs/              # 项目文档
│   └── DESIGN_OpsDashboard.md  # 设计规范文档
├── HANDOVER.md        # 项目交接文档
└── README.md          # 本文件
```

## 文档

- [设计规范文档](docs/DESIGN_OpsDashboard.md)
- [项目交接文档](HANDOVER.md)

## 注意事项

1. **MCP 依赖**: 后端需要依赖 `mcp-servers/code-sync/server.py` 中的 `CodeSyncMCP` 类。如果从 MetaSeekOJdev 中剥离，需要确保该依赖可用或进行相应调整。

2. **安全性**: 目前后端 API 没有任何鉴权 (CORS 开放)，仅限本地 `localhost` 使用。如果暴露到公网需加 Token 验证。

3. **配置管理**: 服务器配置保存在本地 json 文件中，包含 SSH 密码等敏感信息，请妥善保管。

## License

[待定]
