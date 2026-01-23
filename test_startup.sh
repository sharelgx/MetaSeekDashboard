#!/bin/bash
# 完整的启动测试脚本

echo "=========================================="
echo "项目启动回归测试"
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

test_count=0
pass_count=0
fail_count=0

test_item() {
    local name="$1"
    local command="$2"
    ((test_count++))
    
    echo -n "测试 $test_count: $name ... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 通过${NC}"
        ((pass_count++))
        return 0
    else
        echo -e "${RED}❌ 失败${NC}"
        ((fail_count++))
        return 1
    fi
}

echo "1. 停止现有服务..."
bash stop.sh > /dev/null 2>&1
sleep 2

echo ""
echo "2. 检查服务是否已停止..."
test_item "后端服务已停止" "! pgrep -f 'python3.*main.py'"
test_item "前端服务已停止" "! pgrep -f 'vite'"

echo ""
echo "3. 启动项目..."
bash start.sh > /tmp/test_startup.log 2>&1 &
START_PID=$!
sleep 8  # 等待服务启动

echo ""
echo "4. 检查服务启动状态..."
test_item "PostgreSQL运行" "pg_isready -h localhost -p 5432"
test_item "后端服务运行" "curl -s http://localhost:8000/ | grep -q 'Ops Dashboard'"
test_item "前端服务运行" "curl -s http://localhost:5173/ | grep -q 'html'"

echo ""
echo "5. 测试API接口..."
test_item "健康检查API" "curl -s http://localhost:8000/api/health/postgresql | grep -q 'running'"
test_item "服务器列表API" "curl -s http://localhost:8000/api/servers | grep -q 'servers'"
test_item "启动API" "curl -s -X POST http://localhost:8000/api/startup/start | grep -q 'success'"

echo ""
echo "6. 测试数据库连接..."
test_item "数据库连接" "cd backend && python3 -c 'from database import check_database_connection; exit(0 if check_database_connection() else 1)'"

echo ""
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "总测试数: $test_count"
echo -e "${GREEN}通过: $pass_count${NC}"
if [ $fail_count -gt 0 ]; then
    echo -e "${RED}失败: $fail_count${NC}"
    echo ""
    echo "查看启动日志: tail -50 /tmp/test_startup.log"
    exit 1
else
    echo -e "${GREEN}所有测试通过！${NC}"
    exit 0
fi
