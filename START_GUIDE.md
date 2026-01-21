# 项目启动指南

## 快速启动

### 方式一：使用统一启动脚本（推荐）

```bash
# 1. 健康检查
bash check_health.sh

# 2. 启动所有服务（包括PostgreSQL）
bash start.sh

# 3. 停止所有服务
bash stop.sh
```

### 方式二：手动启动

#### 1. 启动 PostgreSQL 数据库

**WSL2/Linux 环境：**

```bash
# 方法1: 使用 service（需要sudo权限）
sudo service postgresql start

# 方法2: 使用 pg_ctl（需要sudo权限）
sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start

# 验证是否启动成功
pg_isready -h localhost -p 5432
```

**如果PostgreSQL未安装：**

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
```

#### 2. 初始化数据库

```bash
cd backend
bash setup_database.sh
```

或者手动执行：

```bash
# 创建数据库
sudo -u postgres psql -c "CREATE DATABASE opsdashboard;"

# 初始化表结构
cd backend
python3 init_db.py
```

#### 3. 启动后端服务

```bash
cd backend
python3 main.py
# 或使用启动脚本
bash start_backend.sh
```

后端服务将运行在：**http://localhost:8000**

#### 4. 启动前端服务

```bash
cd frontend
npm run dev
```

前端服务将运行在：**http://localhost:5173**

## 常见启动脚本

### 项目根目录脚本

| 脚本 | 功能 | 说明 |
|------|------|------|
| `check_health.sh` | 健康检查 | 检查项目所有依赖和服务状态 |
| `start.sh` | 统一启动 | 启动PostgreSQL、后端、前端服务 |
| `stop.sh` | 统一停止 | 停止所有运行的服务 |

### 后端目录脚本

| 脚本 | 功能 | 说明 |
|------|------|------|
| `start_backend.sh` | 启动后端 | 检查依赖并启动FastAPI服务 |
| `setup_database.sh` | 数据库初始化 | 启动PostgreSQL、创建数据库、初始化表 |
| `start_postgresql.sh` | 启动PostgreSQL | 多种方式尝试启动PostgreSQL |

## 服务端口

- **前端**: http://localhost:5173
- **后端API**: http://localhost:8000
- **API文档**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432

## 健康检查

运行健康检查脚本查看项目状态：

```bash
bash check_health.sh
```

检查项包括：
- ✅ 项目结构
- ✅ 后端依赖（Python包）
- ✅ 前端依赖（Node.js包）
- ✅ PostgreSQL服务状态
- ✅ 数据库连接
- ✅ 服务运行状态

## 故障排查

### PostgreSQL 无法启动

1. **检查PostgreSQL是否安装**
   ```bash
   dpkg -l | grep postgresql
   ```

2. **检查数据目录权限**
   ```bash
   ls -la /var/lib/postgresql/12/main
   ```

3. **查看PostgreSQL日志**
   ```bash
   tail -f /var/log/postgresql/postgresql-12-main.log
   ```

4. **手动启动（需要sudo）**
   ```bash
   sudo service postgresql start
   # 或
   sudo -u postgres /usr/lib/postgresql/12/bin/pg_ctl -D /var/lib/postgresql/12/main start
   ```

### 数据库连接失败

1. **检查PostgreSQL是否运行**
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. **检查数据库是否存在**
   ```bash
   sudo -u postgres psql -c "\l" | grep opsdashboard
   ```

3. **重新初始化数据库**
   ```bash
   cd backend
   bash setup_database.sh
   ```

### 后端服务无法启动

1. **检查Python依赖**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **检查端口是否被占用**
   ```bash
   lsof -i :8000
   # 或
   ss -tlnp | grep 8000
   ```

3. **查看后端日志**
   ```bash
   tail -f /tmp/opsdashboard_backend.log
   ```

### 前端服务无法启动

1. **检查Node.js依赖**
   ```bash
   cd frontend
   npm install
   ```

2. **检查端口是否被占用**
   ```bash
   lsof -i :5173
   # 或
   ss -tlnp | grep 5173
   ```

3. **查看前端日志**
   ```bash
   tail -f /tmp/opsdashboard_frontend.log
   ```

## 环境要求

- **Python**: >= 3.8
- **Node.js**: >= 18
- **PostgreSQL**: >= 12
- **操作系统**: Linux/WSL2

## 默认登录凭据

- 用户名: `admin` 或 `root`
- 密码: `123456`

## 相关文档

- [PostgreSQL配置指南](backend/POSTGRESQL_SETUP.md)
- [数据库迁移文档](backend/DATABASE_MIGRATION.md)
- [SSH连接指南](backend/SSH_CONNECTION_GUIDE.md)
- [项目设计文档](docs/DESIGN_OpsDashboard.md)
