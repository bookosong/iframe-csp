#!/bin/bash
# Enhanced download script for metaso static resources
# This script ensures all static resources are available locally

BASE_DIR="$(pwd)/static"
METASO_FILES_DIR="$BASE_DIR/metaso.cn_files"
FONTS_DIR="$BASE_DIR/metaso.cn_files/fonts/woff-v2"
OTHER_DIR="$BASE_DIR/other"

# 自动创建常用子目录，避免统计时报错
mkdir -p "$METASO_FILES_DIR" "$FONTS_DIR" "$OTHER_DIR"


# 1. 查找所有本地 HTML/JS/CSS 文件，提取 static-1.metaso.cn 资源链接
RESOURCE_URLS=$(grep -rhoE 'https://static-1.metaso.cn/[^"'"'"'\ >]+' . | sort | uniq)

# 2. 读取补充下载列表（如有）
EXTRA_LIST="extra-urls.txt"
if [[ -f "$EXTRA_LIST" ]]; then
    echo "检测到补充下载列表: $EXTRA_LIST"
    RESOURCE_URLS=$( (echo "$RESOURCE_URLS"; cat "$EXTRA_LIST") | sort | uniq )
fi

echo "共发现 $(echo "$RESOURCE_URLS" | wc -l) 个 unique 静态资源引用（含补充列表）。"

# 3. 递归下载指定目录下所有资源（如有）
RECURSIVE_DIRS=("_next/static/css" "_next/static/chunks" "_next/static/media")
for dir in "${RECURSIVE_DIRS[@]}"; do
    echo "递归拉取目录: $dir ..."
    wget -r -np -nH --cut-dirs=1 -R index.html* -P "$BASE_DIR" "https://static-1.metaso.cn/$dir/"
done

# 下载统计
success_count=0
fail_count=0
fail_list=()

for url in $RESOURCE_URLS; do
    rel_path="${url#https://static-1.metaso.cn/}"
    # 只允许 .js .css .woff .ttf .svg .png .jpg .jpeg .gif .ico .json .map .webp .mp3 .mp4 .wasm
    if [[ ! "$rel_path" =~ \.(js|css|woff2?|ttf|svg|png|jpg|jpeg|gif|ico|json|map|webp|mp3|mp4|wasm)$ ]]; then
        continue
    fi
    # 过滤掉包含变量、模板符号的路径
    if [[ "$rel_path" =~ [\{\}\[\]\$\`\'\"] ]]; then
        continue
    fi
    rel_path_no_leading_slash="${rel_path#/}"
    local_path="$BASE_DIR/$rel_path_no_leading_slash"
    local_dir=$(dirname "$local_path")
    if [[ ! -f "$local_path" ]]; then
        echo "缺失: $rel_path_no_leading_slash，正在下载..."
        mkdir -p "$local_dir"
        # 下载失败重试 2 次
        for try in 1 2 3; do
            curl -s -L "$url" -o "$local_path"
            if [[ $? -eq 0 && -s "$local_path" ]]; then
                echo "✓ 下载成功 $rel_path_no_leading_slash (第$try次)"
                ((success_count++))
                break
            else
                rm -f "$local_path"
                if [[ $try -eq 3 ]]; then
                    echo "✗ 下载失败 $rel_path_no_leading_slash (已重试3次)"
                    ((fail_count++))
                    fail_list+=("$rel_path_no_leading_slash")
                fi
            fi
        done
    else
        echo "✓ 已存在 $rel_path_no_leading_slash"
    fi
done

echo ""
echo "自动静态资源检查与下载完成！"
echo "--------------------------------------"
echo "下载成功: $success_count 个"
echo "下载失败: $fail_count 个"
if [[ $fail_count -gt 0 ]]; then
    echo "失败列表:"
    for f in "${fail_list[@]}"; do
        echo "  $f"
    done
fi

echo ""
echo "Summary of downloaded resources:"
echo "Files in metaso.cn_files: $(ls -1 \"$METASO_FILES_DIR\" 2>/dev/null | wc -l)"
echo "Font files: $(ls -1 \"$FONTS_DIR\" 2>/dev/null | wc -l)"
echo "Other files: $(ls -1 \"$OTHER_DIR\" 2>/dev/null | wc -l)"