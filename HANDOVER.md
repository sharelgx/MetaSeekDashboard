# 项目交接文档 (Project Handover)

## 📋 项目基本信息

**项目名称**: MetaSeek Dashboard (运维仪表盘)  
**项目路径**: `/home/sharelgx/Opsdashboarddesignspec`  
**GitHub 仓库**: https://github.com/sharelgx/MetaSeekDashboard  
**项目类型**: 前后端分离的本地运维管理工具

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

```
React 前端 (localhost:5173) 
    ↓ HTTP API
FastAPI 后端 (localhost:8000)
    ↓ Python 调用
MCP 核心逻辑 (CodeSyncMCP)
    ↓ SSH / Rsync
远程腾讯云服务器
```

### 2.1 前端 (Frontend)
*   **路径**: `/home/sharelgx/Opsdashboarddesignspec/frontend`
*   **技术栈**: 
    - React 18
    - Vite 6.3.5
    - Tailwind CSS 4.1.12
    - Shadcn UI 组件库
    - Lucide Icons
    - Axios (HTTP 客户端)
*   **关键文件**:
    *   `src/app/components/pages/*`: 各个功能页面
        - `Dashboard.tsx`: 仪表盘首页（系统概览）
        - `Deployment.tsx`: 部署控制台（构建和同步）
        - `Services.tsx`: 服务管理页面
        - `Logs.tsx`: 日志监控页面
        - `Login.tsx`: 登录页面（目前为占位）
    *   `src/lib/api.ts`: Axios 封装，处理与后端通信
    *   `src/app/components/ui/api.ts`: API 类型定义
    *   `vite.config.ts`: 配置了 `/api` 代理转发到后端 `8000` 端口
*   **启动命令**: `cd frontend && npm run dev`
*   **访问地址**: http://localhost:5173

### 2.2 后端 (Backend)
*   **路径**: `/home/sharelgx/Opsdashboarddesignspec/backend`
*   **技术栈**: 
    - Python FastAPI
    - Uvicorn (ASGI 服务器)
*   **职责**: 作为 API 网关，接收前端请求，调用底层的运维脚本
*   **关键文件**:
    *   `main.py`: 定义所有 API 路由
        - `/api/status`: 获取服务器状态
        - `/api/servers`: 服务器配置管理
        - `/api/sync`: 代码同步
        - `/api/build`: 前端构建
        - `/api/restart`: 服务重启
        - `/api/fix/scratch`: 修复 Scratch 编辑器
        - `/api/logs`: 获取日志
*   **启动命令**: `cd backend && python main.py`
*   **访问地址**: http://localhost:8000
*   **API 文档**: http://localhost:8000/docs (FastAPI 自动生成)

### 2.3 核心逻辑依赖 (Core Logic Dependency)

⚠️ **重要问题**: 后端代码目前依赖 `CodeSyncMCP` 类，该类原本位于 `/home/sharelgx/MetaSeekOJdev/mcp-servers/code-sync/server.py`。

**当前状态**:
- `backend/main.py` 第 12 行尝试从 `../mcp-servers/code-sync` 导入 `CodeSyncMCP`
- 由于项目已从 MetaSeekOJdev 剥离，该路径不存在
- 代码中有 fallback 机制，会使用一个空的 Mock 类

**解决方案**（需要优先处理）:
1. **方案 A**: 将 `CodeSyncMCP` 类复制到本项目
   - 从 `/home/sharelgx/MetaSeekOJdev/mcp-servers/code-sync/server.py` 复制
   - 创建 `backend/core/` 目录存放
   - 修改 `main.py` 的导入路径

2. **方案 B**: 将 MCP 逻辑重写为独立的模块
   - 在 `backend/core/` 中实现运维逻辑
   - 移除对 MetaSeekOJdev 的依赖

3. **方案 C**: 使用环境变量或配置文件指定 MCP 路径
   - 允许在运行时指定外部 MCP 路径
   - 适用于仍需要访问 MetaSeekOJdev 的场景

## 3. 快速开始 (Quick Start)

### 3.1 环境要求

**前端**:
- Node.js >= 18
- npm 或 pnpm

**后端**:
- Python >= 3.8
- pip

### 3.2 安装依赖

**前端依赖**:
```bash
cd /home/sharelgx/Opsdashboarddesignspec/frontend
npm install
```

**后端依赖**:
```bash
cd /home/sharelgx/Opsdashboarddesignspec/backend
pip install fastapi uvicorn pydantic
```

### 3.3 启动服务

**启动后端**（终端 1）:
```bash
cd /home/sharelgx/Opsdashboarddesignspec/backend
python main.py
# 服务将运行在 http://0.0.0.0:8000
```

**启动前端**（终端 2）:
```bash
cd /home/sharelgx/Opsdashboarddesignspec/frontend
npm run dev
# 服务将运行在 http://localhost:5173
```

**访问应用**: 打开浏览器访问 **http://localhost:5173**

### 3.4 验证安装

1. 检查后端: 访问 http://localhost:8000/docs 应该看到 FastAPI 文档
2. 检查前端: 访问 http://localhost:5173 应该看到登录页面或仪表盘
3. 检查 API 连接: 前端应该能正常调用后端 API（查看浏览器控制台）

## 4. 项目结构 (Project Structure)

```
/home/sharelgx/Opsdashboarddesignspec/
├── frontend/                    # React 前端应用
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── pages/      # 功能页面
│   │   │   │   ├── ui/         # UI 组件库
│   │   │   │   └── Sidebar.tsx
│   │   │   └── App.tsx
│   │   ├── lib/
│   │   │   └── api.ts          # API 客户端
│   │   └── styles/             # 样式文件
│   ├── package.json
│   └── vite.config.ts
├── backend/                     # FastAPI 后端
│   └── main.py                 # API 入口文件
├── docs/                        # 项目文档
│   └── DESIGN_OpsDashboard.md  # 设计规范文档
├── .gitignore
├── HANDOVER.md                 # 本交接文档
└── README.md                   # 项目说明
```

## 5. 已完成工作 (Completed Features)

### ✅ 已实现功能

1. **界面迁移**: 
   - 成功将 Figma 设计稿代码运行起来
   - 修复了 React 依赖问题
   - 实现了完整的 UI 组件库

2. **API 对接**:
   - **概览页 (Dashboard)**: 真实显示服务器 IP、SSH 状态、服务列表状态
   - **部署页 (Deployment)**: 
     - 支持 "Vue Admin" 和 "React Client" 的本地构建调用
     - 支持 "All/Backend/Frontend" 的代码同步
   - **服务页 (Services)**: 实现了 "重启后端"、"修复 Scratch" 的真实调用
   - **日志页 (Logs)**: 实现了日志文件的实时 tail 读取（支持 5s 自动刷新）

3. **配置管理**: 
   - 前端支持添加/切换服务器配置
   - 配置保存到本地 JSON 文件

4. **项目剥离**: 
   - 已从 MetaSeekOJdev 完全剥离
   - 独立的 Git 仓库
   - 已推送到 GitHub

### 🚧 待解决问题 (Known Issues)

1. **MCP 依赖缺失** ⚠️ **高优先级**
   - 后端依赖 `CodeSyncMCP`` 类，但该类的路径不存在
   - 当前使用 Mock 类，所有运维功能无法正常工作
   - **需要立即解决**（见 2.3 节解决方案）

2. **单文件同步**: 
   - 前端 "同步单个文件" 功能目前仅有 UI
   - 后端 API 尚未完全支持细粒度的单文件路径校验

3. **构建日志流**: 
   - 目前构建过程是阻塞的，日志会在构建完成后一次性返回
   - 建议改为 WebSocket 推送实时日志，提升用户体验

4. **安全性**: 
   - 目前后端 API 没有任何鉴权（CORS 开放）
   - 仅限本地 `localhost` 使用
   - 如果暴露到公网需加 Token 验证

5. **错误处理**: 
   - 部分 API 调用的错误处理不够完善
   - 需要添加更友好的错误提示

## 6. 开发指南 (Development Guide)

### 6.1 添加新的 API 端点

1. 在 `backend/main.py` 中添加路由:
```python
@app.post("/api/your-endpoint")
async def your_endpoint(request: YourRequest):
    return mcp.your_method(request.params)
```

2. 在 `frontend/src/lib/api.ts` 中添加 API 调用函数:
```typescript
export const yourApiCall = async (params: YourParams) => {
  const response = await axios.post('/api/your-endpoint', params);
  return response.data;
};
```

3. 在 `frontend/src/app/components/ui/api.ts` 中添加类型定义（如需要）

4. 在前端组件中调用:
```typescript
import { yourApiCall } from '@/lib/api';
const result = await yourApiCall(params);
```

### 6.2 添加新的页面

1. 在 `frontend/src/app/components/pages/` 创建新组件
2. 在 `frontend/src/app/App.tsx` 中添加路由
3. 在 `frontend/src/app/components/Sidebar.tsx` 中添加导航链接

### 6.3 调试技巧

**前端调试**:
- 使用浏览器开发者工具查看网络请求
- 检查 `http://localhost:5173` 的控制台输出
- Vite 支持热重载，修改代码后自动刷新

**后端调试**:
- 查看终端输出（`python main.py` 的运行窗口）
- 访问 `http://localhost:8000/docs` 测试 API
- 使用 FastAPI 的自动文档进行接口测试

**API 连接问题**:
- 确认后端运行在 `8000` 端口
- 确认前端代理配置正确（`vite.config.ts`）
- 检查 CORS 设置

## 7. 关键文件索引 (File Index)

| 路径 | 说明 |
| :--- | :--- |
| `frontend/vite.config.ts` | 前端代理配置，解决跨域问题 |
| `frontend/src/lib/api.ts` | 前端 API 客户端封装 |
| `frontend/src/app/components/ui/api.ts` | 前端 API 类型定义 |
| `frontend/src/app/components/pages/*` | 各个功能页面组件 |
| `backend/main.py` | 后端 API 入口，定义所有路由 |
| `docs/DESIGN_OpsDashboard.md` | UI/UX 设计规范文档 |

## 8. 给接手 AI 的提示 (Prompt for Next AI)

> **你好！这是一个基于 React + FastAPI 的本地运维工具项目。**
> 
> **项目位置**: `/home/sharelgx/Opsdashboarddesignspec`
> 
> **当前状态**:
> - 前端代码在 `frontend/` 目录，使用 React + Vite
> - 后端代码在 `backend/` 目录，使用 FastAPI
> - 项目已从 MetaSeekOJdev 剥离，但后端仍依赖 `CodeSyncMCP` 类（路径不存在）
> 
> **优先任务**:
> 1. **解决 MCP 依赖问题**（最重要）: 后端 `main.py` 第 12 行尝试导入 `CodeSyncMCP`，但路径不存在。需要：
>    - 从 `/home/sharelgx/MetaSeekOJdev/mcp-servers/code-sync/server.py` 复制 `CodeSyncMCP` 类
>    - 或重写为独立模块
>    - 修改 `backend/main.py` 的导入路径
> 
> 2. **验证功能**: 修复依赖后，测试各个功能页面是否正常工作
> 
> **开发流程**:
> - 前端: `cd frontend && npm run dev` (运行在 5173 端口)
> - 后端: `cd backend && python main.py` (运行在 8000 端口)
> - 前端通过 Vite 代理访问后端 API（见 `vite.config.ts`）
> 
> **注意事项**:
> - `frontend/vite.config.ts` 中配置了 `/api` 代理转发到后端
> - 如果需要修改运维逻辑，先在 `CodeSyncMCP` 中添加方法，然后在 `backend/main.py` 暴露接口，最后在前端调用
> - 所有 API 路由都在 `backend/main.py` 中定义
> - 前端 API 调用封装在 `frontend/src/lib/api.ts` 中
> 
> **参考文档**:
> - `docs/DESIGN_OpsDashboard.md`: UI/UX 设计规范
> - `README.md`: 项目基本说明
> - `HANDOVER.md`: 本交接文档

## 9. 常见问题 (FAQ)

**Q: 后端启动后，API 调用返回错误？**  
A: 检查 `CodeSyncMCP` 是否正确导入。如果导入失败，会使用 Mock 类，所有功能都无法正常工作。

**Q: 前端无法连接到后端？**  
A: 
1. 确认后端运行在 `http://localhost:8000`
2. 检查 `vite.config.ts` 中的代理配置
3. 查看浏览器控制台的网络请求

**Q: 如何添加新的服务器配置？**  
A: 在前端"设置"页面添加，配置会保存到本地 JSON 文件。

**Q: 构建功能不工作？**  
A: 需要确保 `CodeSyncMCP.build_react_frontend()` 等方法已实现，且能访问到 MetaSeekOJdev 项目路径。

## 10. 下一步计划 (Next Steps)

1. ✅ 项目剥离完成
2. ⚠️ **解决 MCP 依赖问题**（高优先级）
3. 🔄 完善错误处理和用户反馈
4. 🔄 实现 WebSocket 实时日志流
5. 🔄 添加 API 鉴权机制
6. 🔄 完善单文件同步功能
7. 🔄 添加单元测试和集成测试

---

**最后更新**: 2025-01-21  
**项目状态**: 🟡 开发中（MCP 依赖待解决）  
**维护者**: 待指定
