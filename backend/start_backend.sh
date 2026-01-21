#!/bin/bash
# 后端服务启动脚本

cd "$(dirname "$0")"

echo "正在启动后端服务..."
echo "工作目录: $(pwd)"

# 检查 Python 是否可用
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 python3"
    exit 1
fi

# 检查依赖
echo "检查依赖..."
python3 -c "import fastapi" 2>/dev/null || {
    echo "警告: fastapi 未安装，尝试安装..."
    pip3 install fastapi uvicorn pydantic
}

# 启动服务
echo "启动后端服务在 http://0.0.0.0:8000"
python3 main.py
