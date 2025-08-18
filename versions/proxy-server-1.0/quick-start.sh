#!/bin/bash

# metaso.cn 代理服务器 v1.0 - 快速启动脚本
# 使用方法: ./quick-start.sh [start|stop|restart|status|setup]

set -e  # 遇到错误立即退出

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/metaso-proxy.log"
PID_FILE="$SCRIPT_DIR/metaso-proxy.pid"
PORT=10101

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印彩色信息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    print_info "检查系统依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js >= 14.0"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    print_info "Node.js 版本: $node_version"
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_error "npm 未安装"
        exit 1
    fi
    
    # 检查端口占用
    if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
        print_warning "端口 $PORT 已被占用"
        return 1
    fi
    
    print_success "依赖检查通过"
    return 0
}

# 安装 npm 依赖
install_dependencies() {
    print_info "安装 npm 依赖..."
    
    if [ ! -f "$SCRIPT_DIR/package.json" ]; then
        print_error "package.json 文件不存在"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
    npm install
    
    print_success "依赖安装完成"
}

# 下载静态资源
setup_resources() {
    print_info "设置静态资源..."
    
    if [ ! -f "$SCRIPT_DIR/scripts/download-resources.js" ]; then
        print_error "下载脚本不存在: scripts/download-resources.js"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
    node scripts/download-resources.js
    
    # 验证下载结果
    local file_count=$(find static/metaso.cn_files/ -type f 2>/dev/null | wc -l)
    if [ "$file_count" -lt 50 ]; then
        print_warning "静态资源文件数量较少: $file_count 个，可能下载不完整"
    else
        print_success "静态资源设置完成: $file_count 个文件"
    fi
}

# 启动服务
start_service() {
    print_info "启动 metaso.cn 代理服务器..."
    
    # 检查是否已在运行
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        print_warning "服务已在运行，PID: $(cat "$PID_FILE")"
        return 0
    fi
    
    cd "$SCRIPT_DIR"
    
    # 启动服务 (后台运行)
    nohup node metaso-proxy.js > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # 等待服务启动
    sleep 3
    
    # 检查服务状态
    if kill -0 "$pid" 2>/dev/null; then
        print_success "服务启动成功"
        print_info "PID: $pid"
        print_info "端口: $PORT"
        print_info "日志: $LOG_FILE"
        print_info "访问地址: http://localhost:$PORT"
        
        # 简单的健康检查
        if command -v curl &> /dev/null; then
            sleep 2
            if curl -f -s "http://localhost:$PORT" > /dev/null 2>&1; then
                print_success "服务健康检查通过 ✓"
            else
                print_warning "服务健康检查失败，请查看日志"
            fi
        fi
    else
        print_error "服务启动失败，请查看日志: $LOG_FILE"
        exit 1
    fi
}

# 停止服务
stop_service() {
    print_info "停止 metaso.cn 代理服务器..."
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            rm -f "$PID_FILE"
            print_success "服务已停止"
        else
            print_warning "服务未在运行"
            rm -f "$PID_FILE"
        fi
    else
        # 尝试通过进程名杀死
        pkill -f "node metaso-proxy.js" && print_success "服务已强制停止" || print_warning "未找到运行中的服务"
    fi
}

# 重启服务
restart_service() {
    print_info "重启 metaso.cn 代理服务器..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
check_status() {
    print_info "检查服务状态..."
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            print_success "服务正在运行"
            print_info "PID: $pid"
            print_info "端口: $PORT"
            
            # 检查端口监听
            if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
                print_success "端口 $PORT 正在监听"
            else
                print_warning "端口 $PORT 未在监听"
            fi
            
            # 检查最近日志
            if [ -f "$LOG_FILE" ]; then
                print_info "最近日志 (最后5行):"
                tail -5 "$LOG_FILE"
            fi
            
        else
            print_error "PID 文件存在但进程未运行"
            rm -f "$PID_FILE"
        fi
    else
        print_warning "服务未在运行 (PID文件不存在)"
        
        # 检查是否有遗留进程
        if pgrep -f "node metaso-proxy.js" > /dev/null; then
            print_warning "发现遗留进程，建议执行: ./quick-start.sh stop"
        fi
    fi
}

# 显示帮助信息
show_help() {
    echo "metaso.cn 代理服务器 v1.0 - 快速启动脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [命令]"
    echo ""
    echo "可用命令:"
    echo "  setup     - 安装依赖并下载静态资源 (首次运行必需)"
    echo "  start     - 启动代理服务器"
    echo "  stop      - 停止代理服务器"
    echo "  restart   - 重启代理服务器"
    echo "  status    - 查看服务状态"
    echo "  logs      - 查看实时日志"
    echo "  test      - 测试服务功能"
    echo "  help      - 显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 setup     # 首次部署"
    echo "  $0 start     # 启动服务"
    echo "  $0 status    # 检查状态"
    echo "  $0 test      # 功能测试"
    echo ""
    echo "访问地址: http://localhost:$PORT"
    echo "测试页面: file://$(pwd)/iframe-test.html"
}

# 查看实时日志
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        print_info "显示实时日志 (按 Ctrl+C 退出):"
        tail -f "$LOG_FILE"
    else
        print_warning "日志文件不存在: $LOG_FILE"
    fi
}

# 测试服务功能
test_service() {
    print_info "测试服务功能..."
    
    if ! command -v curl &> /dev/null; then
        print_error "curl 命令不可用，请安装 curl"
        exit 1
    fi
    
    # 测试主页
    print_info "测试主页访问..."
    if curl -f -s -I "http://localhost:$PORT" | grep -q "HTTP/1.1 200"; then
        print_success "主页访问正常 ✓"
    else
        print_error "主页访问失败 ✗"
        return 1
    fi
    
    # 测试静态资源
    print_info "测试静态资源..."
    if curl -f -s -I "http://localhost:$PORT/static/metaso.cn_files/44be927df5c0115a.css" | grep -q "HTTP/1.1 200"; then
        print_success "静态资源访问正常 ✓"
    else
        print_warning "静态资源访问可能有问题 ⚠"
    fi
    
    # 测试 CSP 头移除
    print_info "测试 CSP 头移除..."
    local headers=$(curl -s -I "http://localhost:$PORT")
    if echo "$headers" | grep -qi "content-security-policy"; then
        print_warning "CSP 头可能未完全移除 ⚠"
    else
        print_success "CSP 头移除正常 ✓"
    fi
    
    # 测试 X-Frame-Options
    if echo "$headers" | grep -qi "x-frame-options.*allowall"; then
        print_success "X-Frame-Options 设置正常 ✓"
    else
        print_warning "X-Frame-Options 可能未正确设置 ⚠"
    fi
    
    print_success "功能测试完成"
}

# 主程序
main() {
    case "${1:-help}" in
        "setup")
            check_dependencies
            install_dependencies
            setup_resources
            print_success "设置完成！现在可以运行: $0 start"
            ;;
        "start")
            check_dependencies || true  # 允许端口占用的情况
            start_service
            ;;
        "stop")
            stop_service
            ;;
        "restart")
            restart_service
            ;;
        "status")
            check_status
            ;;
        "logs")
            show_logs
            ;;
        "test")
            test_service
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 运行主程序
main "$@"
