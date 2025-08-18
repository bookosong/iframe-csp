#!/bin/bash
# 代理服务器管理脚本

case "$1" in
    "dev"|"development")
        echo "启动开发环境..."
        ./start-dev.sh
        ;;
    "prod"|"production")
        echo "启动生产环境..."
        ./start-prod.sh
        ;;
    "stop")
        echo "停止代理服务器..."
        pkill -f "metaso-proxy" || true
        echo "代理服务器已停止"
        ;;
    "status")
        echo "检查代理服务器状态..."
        if pgrep -f "metaso-proxy" > /dev/null; then
            echo "✓ 代理服务器正在运行"
            echo "进程信息:"
            ps aux | grep metaso-proxy | grep -v grep
        else
            echo "✗ 代理服务器未运行"
        fi
        ;;
    "logs")
        if [ -f "proxy-dev.log" ]; then
            echo "=== 开发环境日志 ==="
            tail -10 proxy-dev.log
            echo ""
        fi
        if [ -f "proxy-prod.log" ]; then
            echo "=== 生产环境日志 ==="
            tail -10 proxy-prod.log
        fi
        ;;
    *)
        echo "用法: $0 {dev|prod|stop|status|logs}"
        echo ""
        echo "命令说明:"
        echo "  dev     - 启动开发环境 (详细日志)"
        echo "  prod    - 启动生产环境 (简洁日志)"
        echo "  stop    - 停止服务器"
        echo "  status  - 查看运行状态"
        echo "  logs    - 查看日志"
        echo ""
        echo "示例:"
        echo "  $0 dev     # 开发环境启动"
        echo "  $0 prod    # 生产环境启动"
        echo "  $0 stop    # 停止服务"
        echo "  $0 status  # 查看状态"
        exit 1
        ;;
esac
