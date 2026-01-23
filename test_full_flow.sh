#!/bin/bash
# 完整流程测试：从启动到访问

echo "=========================================="
echo "完整流程回归测试"
echo "=========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "步骤 1: 停止所有服务..."
bash stop.sh > /dev/null 2>&1
sleep 2

echo "步骤 2: 启动项目..."
bash start.sh > /tmp/full_test.log 2>&1 &
sleep 10  # 等待服务完全启动

echo ""
echo "步骤 3: 验证服务状态..."
echo ""

# 检查PostgreSQL
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL 运行正常${NC}"
else
    echo -e "${RED}❌ PostgreSQL 未运行${NC}"
    exit 1
fi

# 检查后端
if curl -s http://localhost:8000/ | grep -q "Ops Dashboard"; then
    echo -e "${GREEN}✅ 后端服务运行正常${NC}"
else
    echo -e "${RED}❌ 后端服务未运行${NC}"
    exit 1
fi

# 检查前端
if curl -s http://localhost:5173/ | grep -q "html"; then
    echo -e "${GREEN}✅ 前端服务运行正常${NC}"
else
    echo -e "${RED}❌ 前端服务未运行${NC}"
    exit 1
fi

echo ""
echo "步骤 4: 测试API接口..."
echo ""

# 测试健康检查
HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/health/postgresql)
if echo "$HEALTH_RESPONSE" | grep -q "running"; then
    echo -e "${GREEN}✅ 健康检查API正常${NC}"
else
    echo -e "${RED}❌ 健康检查API失败: $HEALTH_RESPONSE${NC}"
    exit 1
fi

# 测试服务器列表
SERVERS_RESPONSE=$(curl -s http://localhost:8000/api/servers)
if echo "$SERVERS_RESPONSE" | grep -q "servers"; then
    echo -e "${GREEN}✅ 服务器列表API正常${NC}"
else
    echo -e "${RED}❌ 服务器列表API失败${NC}"
    exit 1
fi

# 测试登录
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/api/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"123456"}')
if echo "$LOGIN_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✅ 登录API正常${NC}"
else
    echo -e "${RED}❌ 登录API失败${NC}"
    exit 1
fi

echo ""
echo "步骤 5: 测试数据库连接..."
if cd backend && python3 -c "from database import check_database_connection; exit(0 if check_database_connection() else 1)" 2>/dev/null; then
    echo -e "${GREEN}✅ 数据库连接正常${NC}"
else
    echo -e "${RED}❌ 数据库连接失败${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 所有测试通过！项目运行正常！${NC}"
echo "=========================================="
echo ""
echo "访问地址:"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
echo ""
echo "默认登录:"
echo "  用户名: admin"
echo "  密码: 123456"
echo ""
