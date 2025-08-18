#!/bin/bash

# 字体文件下载脚本
# 从metaso.cn下载所需的字体文件到本地

echo "=== 开始下载字体文件 ==="

# 创建字体文件目录
mkdir -p static/metaso.cn_files/output/chtml/fonts/woff-v2

# 字体文件列表（从metaso.cn.html中提取）
FONT_FILES=(
    "MathJax_Zero.woff"
    "MathJax_Main-Regular.woff"
    "MathJax_Main-Bold.woff"
    "MathJax_Math-Italic.woff"
    "MathJax_Main-Italic.woff"
    "MathJax_Math-Regular.woff"
    "MathJax_Size1-Regular.woff"
    "MathJax_Size2-Regular.woff"
    "MathJax_Size3-Regular.woff"
    "MathJax_Size4-Regular.woff"
    "MathJax_Script-Regular.woff"
    "MathJax_Fraktur-Regular.woff"
    "MathJax_SansSerif-Regular.woff"
    "MathJax_SansSerif-Bold.woff"
    "MathJax_SansSerif-Italic.woff"
    "MathJax_Monospace-Regular.woff"
    "MathJax_Typewriter-Regular.woff"
    "MathJax_Caligraphic-Regular.woff"
    "MathJax_Caligraphic-Bold.woff"
)

# 基础URL
BASE_URL="https://static-1.metaso.cn/static/output/chtml/fonts/woff-v2"
TARGET_DIR="static/metaso.cn_files/output/chtml/fonts/woff-v2"

# 下载函数
download_font() {
    local font_file=$1
    local url="${BASE_URL}/${font_file}"
    local target="${TARGET_DIR}/${font_file}"
    
    if [ -f "$target" ]; then
        echo "✓ 字体文件已存在: $font_file"
        return 0
    fi
    
    echo "⬇ 下载字体文件: $font_file"
    if curl -s -L "$url" -o "$target"; then
        if [ -f "$target" ] && [ -s "$target" ]; then
            echo "✓ 下载成功: $font_file ($(du -h "$target" | cut -f1))"
            return 0
        else
            echo "❌ 下载失败: $font_file (文件为空)"
            rm -f "$target"
            return 1
        fi
    else
        echo "❌ 下载失败: $font_file (网络错误)"
        rm -f "$target"
        return 1
    fi
}

# 统计变量
total_files=${#FONT_FILES[@]}
success_count=0
failed_count=0

# 下载所有字体文件
for font_file in "${FONT_FILES[@]}"; do
    if download_font "$font_file"; then
        ((success_count++))
    else
        ((failed_count++))
    fi
done

echo ""
echo "=== 下载完成 ==="
echo "总文件数: $total_files"
echo "成功下载: $success_count"
echo "下载失败: $failed_count"

# 检查下载的文件
echo ""
echo "=== 本地字体文件列表 ==="
if [ -d "$TARGET_DIR" ]; then
    ls -la "$TARGET_DIR"/*.woff 2>/dev/null || echo "没有找到字体文件"
else
    echo "字体目录不存在"
fi

# 测试字体文件访问
echo ""
echo "=== 测试字体文件访问 ==="
if [ -f "${TARGET_DIR}/MathJax_Main-Regular.woff" ]; then
    echo "✓ 字体文件可以正常访问"
    echo "测试URL: http://localhost:10101/static/metaso.cn_files/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff"
else
    echo "❌ 主要字体文件不存在"
fi

echo ""
echo "如果需要手动测试字体访问，请使用："
echo "curl -I http://localhost:10101/static/metaso.cn_files/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff"
