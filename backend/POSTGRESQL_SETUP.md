# PostgreSQL 数据库配置指南

## 1. 启动 PostgreSQL 服务

在 WSL2 中，需要手动启动 PostgreSQL：

```bash
# 方法1: 使用 service 命令（如果可用）
sudo service postgresql start

# 方法2: 使用 pg_ctl（推荐）
sudo -u postgres /usr/lib/postgresql/*/bin/pg_ctl -D /var/lib/postgresql/*/main start

# 方法3: 检查 PostgreSQL 是否在运行
sudo -u postgres psql -c "SELECT version();"
```

## 2. 创建数据库

```bash
# 以 postgres 用户身份创建数据库
sudo -u postgres psql -c "CREATE DATABASE opsdashboard;"

# 或者创建用户和数据库
sudo -u postgres psql << EOF
CREATE USER opsdashboard_user WITH PASSWORD 'your_password';
CREATE DATABASE opsdashboard OWNER opsdashboard_user;
GRANT ALL PRIVILEGES ON DATABASE opsdashboard TO opsdashboard_user;
EOF
```

## 3. 配置数据库连接

编辑 `backend/database.py` 或设置环境变量：

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsdashboard"
# 或者使用自定义用户
export DATABASE_URL="postgresql://opsdashboard_user:your_password@localhost:5432/opsdashboard"
```

## 4. 初始化数据库表

```bash
cd backend
python3 init_db.py
```

## 5. 验证连接

```bash
python3 -c "from database import engine; engine.connect(); print('连接成功！')"
```

## 故障排查

### 问题1: Connection refused
- 检查 PostgreSQL 是否运行: `sudo -u postgres psql -c "SELECT 1;"`
- 检查端口: `netstat -tlnp | grep 5432`

### 问题2: 认证失败
- 检查 `pg_hba.conf` 配置
- 确保用户有权限访问数据库

### 问题3: 数据库不存在
- 运行步骤2创建数据库
