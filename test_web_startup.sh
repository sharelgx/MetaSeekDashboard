#!/bin/bash
# 测试网页端启动脚本功能

echo "=========================================="
echo "网页端启动脚本功能测试"
echo "=========================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 步骤1: 确保后端服务运行
echo "步骤1: 启动后端服务..."
cd backend
nohup python3 main.py > /tmp/opsdashboard_backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 后端服务已启动 (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ 后端服务启动失败${NC}"
    exit 1
fi

# 步骤2: 停止所有服务（模拟未启动状态）
echo ""
echo "步骤2: 停止所有服务（模拟未启动状态）..."
bash stop.sh > /dev/null 2>&1
sleep 2

SERVICE_COUNT=$(ps aux | grep -E "(python3.*main.py|vite)" | grep -v grep | wc -l)
if [ "$SERVICE_COUNT" -eq 1 ]; then
    echo -e "${GREEN}✅ 服务已停止（仅后端运行）${NC}"
else
    echo -e "${YELLOW}⚠️  服务状态: $SERVICE_COUNT 个进程${NC}"
fi

# 步骤3: 通过API调用启动脚本
echo ""
echo "步骤3: 通过API调用启动脚本..."
RESPONSE=$(curl -s -X POST http://localhost:8000/api/startup/start \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:5173")

echo "API响应: $RESPONSE"

SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$SUCCESS" ]; then
    echo -e "${GREEN}✅ API调用成功${NC}"
    PID=$(echo "$RESPONSE" | grep -o '"pid":[0-9]*' | cut -d: -f2)
    echo "   启动脚本PID: $PID"
else
    echo -e "${RED}❌ API调用失败${NC}"
    echo "   响应: $RESPONSE"
    exit 1
fi

# 步骤4: 等待服务启动
echo ""
echo "步骤4: 等待服务启动（最多30秒）..."
MAX_WAIT=30
WAITED=0
SUCCESS_COUNT=0

while [ $WAITED -lt $MAX_WAIT ]; do
    sleep 2
    WAITED=$((WAITED + 2))
    
    # 检查服务
    BACKEND_OK=0
    FRONTEND_OK=0
    POSTGRES_OK=0
    
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        BACKEND_OK=1
    fi
    
    if curl -s http://localhost:5173/ > /dev/null 2>&1; then
        FRONTEND_OK=1
    fi
    
    if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        POSTGRES_OK=1
    fi
    
    SUCCESS_COUNT=$((BACKEND_OK + FRONTEND_OK + POSTGRES_OK))
    
    echo "   [$WAITED秒] 后端: $([ $BACKEND_OK -eq 1 ] && echo '✅' || echo '❌') | 前端: $([ $FRONTEND_OK -eq 1 ] && echo '✅' || echo '❌') | PostgreSQL: $([ $POSTGRES_OK -eq 1 ] && echo '✅' || echo '❌')"
    
    if [ $SUCCESS_COUNT -eq 3 ]; then
        echo -e "${GREEN}✅ 所有服务已启动！${NC}"
        break
    fi
done

# 步骤5: 验证最终状态
echo ""
echo "步骤5: 验证最终状态..."
FINAL_COUNT=$(ps aux | grep -E "(python3.*main.py|vite)" | grep -v grep | wc -l)

if [ $SUCCESS_COUNT -eq 3 ]; then
    echo -e "${GREEN}✅ 测试通过！所有服务正常运行${NC}"
    echo "   运行中的服务进程: $FINAL_COUNT"
    echo "   后端: http://localhost:8000"
    echo "   前端: http://localhost:5173"
    echo "   PostgreSQL: localhost:5432"
    exit 0
else
    echo -e "${RED}❌ 测试失败！部分服务未启动${NC}"
    echo "   运行中的服务进程: $FINAL_COUNT"
    echo "   后端: $([ $BACKEND_OK -eq 1 ] && echo '✅' || echo '❌')"
    echo "   前端: $([ $FRONTEND_OK -eq 1 ] && echo '✅' || echo '❌')"
    echo "   PostgreSQL: $([ $POSTGRES_OK -eq 1 ] && echo '✅' || echo '❌')"
    exit 1
fi
