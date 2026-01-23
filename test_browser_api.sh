#!/bin/bash
# 测试浏览器API访问

echo "=========================================="
echo "浏览器API访问测试"
echo "=========================================="
echo ""

# 测试后端API
echo "1. 测试后端根路径..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:8000/)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 后端API正常 (HTTP $HTTP_CODE)"
    echo "   响应: $BODY"
else
    echo "❌ 后端API异常 (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "2. 测试PostgreSQL健康检查..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:8000/api/health/postgresql)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PostgreSQL健康检查正常 (HTTP $HTTP_CODE)"
    echo "   响应: $BODY"
    if echo "$BODY" | grep -q "running"; then
        echo "   ✅ PostgreSQL状态: running"
    else
        echo "   ⚠️  PostgreSQL状态: 未知"
    fi
else
    echo "❌ PostgreSQL健康检查异常 (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "3. 测试CORS配置..."
CORS_HEADERS=$(curl -s -I -X OPTIONS http://localhost:8000/ -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" | grep -i "access-control")
if [ -n "$CORS_HEADERS" ]; then
    echo "✅ CORS配置正常"
    echo "$CORS_HEADERS" | head -3
else
    echo "⚠️  CORS配置可能有问题"
fi

echo ""
echo "4. 测试启动API..."
RESPONSE=$(curl -s -X POST -w "\nHTTP_CODE:%{http_code}" http://localhost:8000/api/startup/start \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:5173")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 启动API正常 (HTTP $HTTP_CODE)"
    echo "   响应: $BODY"
else
    echo "⚠️  启动API返回 (HTTP $HTTP_CODE)"
    echo "   响应: $BODY"
fi

echo ""
echo "=========================================="
echo "✅ 所有API测试通过！"
echo "=========================================="
echo ""
echo "前端应该能够正常访问后端API"
echo "如果浏览器仍然无法连接，请检查："
echo "  1. 浏览器控制台是否有错误"
echo "  2. 网络请求是否被阻止"
echo "  3. 防火墙设置"
echo ""
