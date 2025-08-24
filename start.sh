#!/bin/bash

# metaso-proxy-autosearch 启动脚本
# 支持多种环境配置

echo "🚀 metaso-proxy-autosearch 启动脚本"
echo "================================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 显示帮助信息
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  dev          开发环境启动 (localhost:10101)"
    echo "  prod         生产环境启动 (需要设置环境变量)"
    echo "  test         测试环境启动 (localhost:8080)"
    echo "  docker       显示 Docker 命令示例"
    echo "  help         显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  NODE_ENV     运行环境 (development/production)"
    echo "  PORT         服务器端口 (默认: 10101)"
    echo "  HOST         服务器主机 (默认: localhost)"
    echo "  PROTOCOL     协议类型 (默认: http)"
    echo ""
    echo "示例:"
    echo "  $0 dev                           # 开发环境"
    echo "  $0 prod                          # 生产环境"
    echo "  PORT=8080 $0 dev                 # 自定义端口"
    echo "  HOST=api.example.com $0 prod     # 自定义主机"
}

# Docker 命令示例
show_docker() {
    echo "🐳 Docker 部署示例:"
    echo ""
    echo "1. 构建镜像:"
    echo "   docker build -t metaso-proxy ."
    echo ""
    echo "2. 开发环境运行:"
    echo "   docker run -p 10101:10101 metaso-proxy"
    echo ""
    echo "3. 生产环境运行:"
    echo "   docker run -p 443:443 \\"
    echo "     -e NODE_ENV=production \\"
    echo "     -e PORT=443 \\"
    echo "     -e HOST=proxy.yourdomain.com \\"
    echo "     -e PROTOCOL=https \\"
    echo "     metaso-proxy"
}

# 检查依赖
check_dependencies() {
    if [ ! -f "package.json" ]; then
        echo "❌ 未找到 package.json，请确保在正确的项目目录中运行"
        exit 1
    fi
    
    if [ ! -f "metaso-proxy-autosearch.js" ]; then
        echo "❌ 未找到 metaso-proxy-autosearch.js"
        exit 1
    fi
    
    if [ ! -d "node_modules" ]; then
        echo "📦 正在安装依赖..."
        npm install
    fi
}

# 开发环境启动
start_dev() {
    echo "🛠️  启动开发环境..."
    export NODE_ENV=development
    export PORT=${PORT:-10101}
    export HOST=${HOST:-localhost}
    export PROTOCOL=${PROTOCOL:-http}
    
    echo "配置信息:"
    echo "  环境: $NODE_ENV"
    echo "  端口: $PORT"
    echo "  主机: $HOST"
    echo "  协议: $PROTOCOL"
    echo "  访问地址: $PROTOCOL://$HOST:$PORT"
    echo ""
    
    node metaso-proxy-autosearch.js
}

# 生产环境启动
start_prod() {
    echo "🏭 启动生产环境..."
    
    # 检查必要的环境变量
    if [ -z "$HOST" ] || [ "$HOST" = "localhost" ]; then
        echo "⚠️  警告: 生产环境建议设置 HOST 环境变量为实际域名"
        echo "   例如: HOST=proxy.yourdomain.com"
    fi
    
    if [ -z "$PROTOCOL" ] || [ "$PROTOCOL" = "http" ]; then
        echo "⚠️  警告: 生产环境建议使用 HTTPS"
        echo "   例如: PROTOCOL=https"
    fi
    
    export NODE_ENV=production
    export PORT=${PORT:-443}
    export HOST=${HOST:-localhost}
    export PROTOCOL=${PROTOCOL:-https}
    
    echo "配置信息:"
    echo "  环境: $NODE_ENV"
    echo "  端口: $PORT"
    echo "  主机: $HOST"
    echo "  协议: $PROTOCOL"
    echo "  访问地址: $PROTOCOL://$HOST:$PORT"
    echo ""
    
    node metaso-proxy-autosearch.js
}

# 测试环境启动
start_test() {
    echo "🧪 启动测试环境..."
    export NODE_ENV=development
    export PORT=${PORT:-8080}
    export HOST=${HOST:-localhost}
    export PROTOCOL=${PROTOCOL:-http}
    
    echo "配置信息:"
    echo "  环境: $NODE_ENV (test mode)"
    echo "  端口: $PORT"
    echo "  主机: $HOST"
    echo "  协议: $PROTOCOL"
    echo "  访问地址: $PROTOCOL://$HOST:$PORT"
    echo ""
    
    node metaso-proxy-autosearch.js
}

# 主逻辑
case "$1" in
    "dev"|"development")
        check_dependencies
        start_dev
        ;;
    "prod"|"production")
        check_dependencies
        start_prod
        ;;
    "test")
        check_dependencies
        start_test
        ;;
    "docker")
        show_docker
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    "")
        echo "❓ 请指定启动模式，使用 '$0 help' 查看帮助"
        echo ""
        echo "快速开始:"
        echo "  $0 dev    # 开发环境"
        echo "  $0 prod   # 生产环境"
        ;;
    *)
        echo "❌ 未知选项: $1"
        echo "使用 '$0 help' 查看可用选项"
        exit 1
        ;;
esac
