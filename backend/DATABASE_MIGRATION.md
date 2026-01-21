# 数据库迁移说明

## 问题说明

在切换到 PostgreSQL 数据库存储之前，服务器配置是保存在**内存**中的。这意味着：

1. ✅ **现在**：配置保存在 PostgreSQL 数据库中，重启服务不会丢失
2. ❌ **之前**：配置保存在内存中，服务重启后丢失

## 当前状态

- ✅ PostgreSQL 数据库已配置并运行
- ✅ 数据库表已创建
- ✅ 后端服务已连接到数据库
- ⚠️  之前内存中的配置已丢失（这是正常的，因为内存数据无法恢复）

## 解决方案

**需要重新添加服务器配置**，这次配置会永久保存到数据库中。

### 验证数据库存储是否正常

1. 在前端添加一个测试服务器配置
2. 重启后端服务：`pkill -f "python3 main.py" && cd backend && python3 main.py &`
3. 检查配置是否还在：访问前端页面，配置应该还在

### 检查数据库中的配置

```bash
# 方法1: 通过 Python 脚本
cd backend
python3 -c "
from database import SessionLocal
from models import ServerConfig
db = SessionLocal()
servers = db.query(ServerConfig).filter(ServerConfig.is_active == True).all()
print(f'数据库中的配置数量: {len(servers)}')
for s in servers:
    print(f'  - {s.server_id}: {s.name} ({s.host})')
db.close()
"

# 方法2: 通过 API
curl http://localhost:8000/api/servers | python3 -m json.tool
```

## 重要提示

✅ **从现在开始，所有配置都会永久保存到数据库**
✅ **重启服务、重启 PostgreSQL、甚至重启系统，配置都不会丢失**
✅ **除非手动删除数据库或删除配置，否则数据会一直保存**

## 故障排查

如果配置保存后仍然丢失：

1. 检查 PostgreSQL 是否运行：`pg_isready -h localhost -p 5432`
2. 检查后端日志：`tail -50 /tmp/backend.log`
3. 检查数据库连接：`cd backend && python3 -c "from database import check_database_connection; check_database_connection()"`
