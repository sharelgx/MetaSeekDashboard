# 数据库分离说明

## 背景

监控项目（Opsdashboard）和MetaSeekOJ项目之前共享同一个PostgreSQL实例，导致：
- 重启PostgreSQL会影响两个项目
- 无法独立管理数据库
- 存在相互影响的风险

## 解决方案

**监控项目现在使用SQLite数据库，完全独立于MetaSeekOJ的PostgreSQL**

### 优势

1. ✅ **完全独立**：不受MetaSeekOJ的PostgreSQL影响
2. ✅ **零配置**：无需额外服务，开箱即用
3. ✅ **易于管理**：数据库文件在项目目录，易于备份和迁移
4. ✅ **适合场景**：监控项目数据量小（只有服务器配置），SQLite完全够用

### 数据库配置

#### 默认配置（SQLite）

监控项目默认使用SQLite，无需任何配置：

```bash
# 数据库文件位置
/home/sharelgx/Opsdashboarddesignspec/opsdashboard.db
```

#### 可选配置（PostgreSQL）

如果需要使用PostgreSQL（独立实例），可以设置环境变量：

```bash
export DATABASE_TYPE=postgresql
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/opsdashboard"
# 注意：使用不同的端口（5433）避免与MetaSeekOJ冲突
```

### 数据迁移

如果之前使用PostgreSQL存储了数据，可以运行迁移脚本：

```bash
cd backend
python3 migrate_to_sqlite.py
```

### 验证

检查当前使用的数据库类型：

```bash
cd backend
python3 -c "from database import DATABASE_TYPE, DATABASE_URL; print(f'类型: {DATABASE_TYPE}'); print(f'连接: {DATABASE_URL}')"
```

### 重要提示

- ✅ **监控项目不再管理PostgreSQL服务**
- ✅ **服务管理页面已移除PostgreSQL**
- ✅ **MetaSeekOJ的PostgreSQL不受影响**
- ✅ **两个项目现在完全独立**
