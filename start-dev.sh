#!/bin/bash
# 开发环境启动脚本

echo "=== 启动开发环境代理服务器 ==="
echo "环境: Development"
echo "日志级别: DEBUG"
echo "端口: 10101"
echo ""

# 停止现有进程
pkill -f "metaso-proxy" || true
fuser -k 10101/tcp 
sleep 1

# 设置环境变量并启动
export NODE_ENV=development
nohup node metaso-proxy-v2.2.js > proxy-dev.log 2>&1 &

# 获取进程ID
PROXY_PID=$!
echo "代理服务器已启动 (PID: $PROXY_PID)"
echo "日志文件: proxy-dev.log"
echo "访问地址: http://localhost:10101"
echo ""
echo "查看日志: tail -f proxy-dev.log"
echo "停止服务: pkill -f metaso-proxy"
