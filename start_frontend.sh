#!/bin/bash
# 独立启动前端服务脚本

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
FRONTEND_LOG="/tmp/opsdashboard_frontend.log"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================="
echo "启动前端服务"
echo "==========================================${NC}"

# 检查前端目录
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ 前端目录不存在: $FRONTEND_DIR${NC}"
    exit 1
fi

# 检查是否已经运行
if pgrep -f "vite" > /dev/null; then
    echo -e "${GREEN}✅ 前端服务已在运行${NC}"
    echo -e "${BLUE}   访问地址: http://localhost:5173${NC}"
    exit 0
fi

# 检查依赖
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${BLUE}ℹ️  前端依赖未安装，正在安装...${NC}"
    cd "$FRONTEND_DIR"
    npm install
fi

# 启动前端服务
echo -e "${BLUE}ℹ️  启动前端服务...${NC}"
cd "$FRONTEND_DIR"

# 清空日志文件
> "$FRONTEND_LOG"

# 在后台启动前端服务
nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# 等待服务启动
sleep 3

# 检查服务是否启动成功
if pgrep -f "vite" > /dev/null; then
    echo -e "${GREEN}✅ 前端服务启动成功 (PID: $FRONTEND_PID)${NC}"
    echo -e "${BLUE}   访问地址: http://localhost:5173${NC}"
    echo -e "${BLUE}   日志文件: $FRONTEND_LOG${NC}"
    echo ""
    echo -e "${GREEN}前端服务已启动，可以访问 http://localhost:5173${NC}"
    echo -e "${BLUE}前端服务独立运行，不依赖后端和数据库${NC}"
else
    echo -e "${RED}❌ 前端服务启动失败${NC}"
    echo -e "${BLUE}查看日志: tail -f $FRONTEND_LOG${NC}"
    exit 1
fi
