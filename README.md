# Ops Dashboard Design Spec

运维仪表盘项目 - 用于管理和监控服务器配置、部署、日志等。

## 项目架构

- **前端**: React 18 + Vite + Tailwind CSS + Shadcn UI
- **后端**: Python FastAPI + Uvicorn
- **数据库**: PostgreSQL

## 快速开始

### 方式一：独立启动前端（推荐）

前端服务可以独立运行，不依赖后端和数据库：

```bash
# 启动前端服务（独立运行）
bash start_frontend.sh
```

启动后访问：http://localhost:5173

前端会显示启动引导页面，你可以通过页面启动后端和数据库服务。

### 方式二：一键启动所有服务

```bash
# 启动所有服务（PostgreSQL、后端、前端）
bash start.sh
```

### 方式三：分别启动

```bash
# 1. 启动前端（独立运行，不依赖其他服务）
bash start_frontend.sh

# 2. 启动后端和数据库（可选，可通过前端页面启动）
bash start.sh
```

## 服务地址

- **前端**: http://localhost:5173
- **后端API**: http://localhost:8000
- **API文档**: http://localhost:8000/docs
- **数据库**: PostgreSQL (localhost:5432)

## 停止服务

```bash
# 停止所有服务
bash stop.sh

# 仅停止前端
pkill -f vite
```

## 默认登录凭据

- 用户名: `admin` 或 `root`
- 密码: `123456`

## 使用流程

1. **启动前端服务**（独立运行，不依赖其他服务）：
   ```bash
   bash start_frontend.sh
   ```
   访问 http://localhost:5173 查看服务状态

2. **启动项目服务**（PostgreSQL、后端）：
   ```bash
   bash start.sh
   ```
   等待15-30秒，服务启动完成后，前端页面会自动检测并跳转到登录页面

3. **日常使用**：
   - 前端服务应该始终运行（可通过系统服务或开机自启动）
   - 访问 http://localhost:5173 查看服务状态
   - 如果后端未运行，页面会显示启动提示，需要在终端执行 `bash start.sh`

## 系统服务配置（可选）

如果你希望前端服务在系统启动时自动运行，可以创建 systemd 服务：

```bash
# 创建服务文件（需要root权限）
sudo nano /etc/systemd/system/opsdashboard-frontend.service
```

服务文件内容：
```ini
[Unit]
Description=Ops Dashboard Frontend Service
After=network.target

[Service]
Type=simple
User=sharelgx
WorkingDirectory=/home/sharelgx/Opsdashboarddesignspec
ExecStart=/usr/bin/bash /home/sharelgx/Opsdashboarddesignspec/start_frontend.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：
```bash
sudo systemctl enable opsdashboard-frontend.service
sudo systemctl start opsdashboard-frontend.service
```

## 健康检查

```bash
# 检查所有服务状态
bash check_health.sh
```

## 日志文件

- 后端日志: `/tmp/opsdashboard_backend.log`
- 前端日志: `/tmp/opsdashboard_frontend.log`
- 启动脚本日志: `/tmp/startup_script.log`

## 常见问题

### 前端无法访问

1. 检查前端服务是否运行：
   ```bash
   ps aux | grep vite
   ```

2. 如果未运行，启动前端：
   ```bash
   bash start_frontend.sh
   ```

3. 检查端口是否被占用：
   ```bash
   ss -tlnp | grep 5173
   ```

### 后端无法启动

1. 检查PostgreSQL是否运行：
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. 检查后端日志：
   ```bash
   tail -f /tmp/opsdashboard_backend.log
   ```

## 开发说明

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

### 后端开发

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

## 项目结构

```
.
├── frontend/          # 前端代码
├── backend/           # 后端代码
├── start.sh           # 启动所有服务
├── start_frontend.sh  # 仅启动前端（独立运行）
├── stop.sh            # 停止所有服务
└── check_health.sh    # 健康检查
```
