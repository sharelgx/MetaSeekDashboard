#!/bin/bash
# PostgreSQL 数据库初始化脚本

# Sudo密码（用于自动执行sudo命令）
SUDO_PASSWORD="123456"

# Sudo命令包装函数
sudo_cmd() {
    echo "$SUDO_PASSWORD" | sudo -S "$@" 2>/dev/null
}

echo "=========================================="
echo "PostgreSQL 数据库初始化脚本"
echo "=========================================="
echo ""

# 检查 PostgreSQL 是否运行
echo "1. 检查 PostgreSQL 服务状态..."
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "   ✅ PostgreSQL 服务正在运行"
else
    echo "   ⚠️  PostgreSQL 服务未运行"
    echo "   请执行以下命令启动服务:"
    echo "   sudo service postgresql start"
    echo ""
    echo "   正在自动启动 PostgreSQL..."
    if sudo_cmd service postgresql start; then
        sleep 2
        if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
            echo "   ✅ PostgreSQL 已启动"
        else
            echo "   ❌ PostgreSQL 启动失败，请手动启动"
            exit 1
        fi
    else
        echo "   ❌ PostgreSQL 启动失败，请手动启动"
        exit 1
    fi
fi

echo ""
echo "2. 检查数据库是否存在..."
DB_EXISTS=$(sudo_cmd -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='opsdashboard'" 2>/dev/null)
if [ "$DB_EXISTS" = "1" ]; then
    echo "   ✅ 数据库 'opsdashboard' 已存在"
else
    echo "   ⚠️  数据库 'opsdashboard' 不存在，正在创建..."
    sudo_cmd -u postgres psql -c "CREATE DATABASE opsdashboard;" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "   ✅ 数据库创建成功"
    else
        echo "   ❌ 数据库创建失败"
        exit 1
    fi
fi

echo ""
echo "3. 初始化数据库表..."
cd "$(dirname "$0")"
python3 init_db.py
if [ $? -eq 0 ]; then
    echo "   ✅ 数据库表初始化成功"
else
    echo "   ❌ 数据库表初始化失败"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ 数据库初始化完成！"
echo "=========================================="
echo ""
echo "现在可以重启后端服务以使用数据库存储配置："
echo "  pkill -f 'python3 main.py'"
echo "  cd backend && python3 main.py &"
