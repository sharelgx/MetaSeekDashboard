# 脚本更新说明

## 更新内容

所有启动脚本已更新为**自动使用 sudo 密码**，无需手动输入密码。

### 更新的脚本列表

1. ✅ `start.sh` - 主启动脚本
2. ✅ `backend/setup_database.sh` - 数据库初始化脚本
3. ✅ `backend/start_postgresql.sh` - PostgreSQL启动脚本
4. ✅ `check_health.sh` - 健康检查脚本
5. ✅ `backend/diagnose_database.sh` - 数据库诊断脚本

### 实现方式

所有脚本都添加了以下代码：

```bash
# Sudo密码（用于自动执行sudo命令）
SUDO_PASSWORD="123456"

# Sudo命令包装函数
sudo_cmd() {
    echo "$SUDO_PASSWORD" | sudo -S "$@" 2>/dev/null
}
```

所有 `sudo` 命令都已替换为 `sudo_cmd`，例如：
- `sudo service postgresql start` → `sudo_cmd service postgresql start`
- `sudo -u postgres psql ...` → `sudo_cmd -u postgres psql ...`

### 使用方法

现在可以直接运行脚本，无需输入密码：

```bash
# 一键启动所有服务（包括PostgreSQL）
bash start.sh

# 初始化数据库
cd backend && bash setup_database.sh

# 启动PostgreSQL
cd backend && bash start_postgresql.sh

# 健康检查
bash check_health.sh

# 数据库诊断
cd backend && bash diagnose_database.sh
```

### 安全性说明

⚠️ **注意**：密码已硬编码在脚本中，仅适用于本地开发环境。

如果需要在生产环境使用，建议：
1. 使用环境变量：`export SUDO_PASSWORD="your_password"`
2. 修改脚本读取环境变量：`SUDO_PASSWORD="${SUDO_PASSWORD:-123456}"`
3. 或配置 sudoers 文件，允许特定命令无需密码

### 测试

所有脚本已通过语法检查，可以正常使用。
