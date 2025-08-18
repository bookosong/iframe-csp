#!/bin/bash
# Enhanced download script for metaso static resources
# This script ensures all static resources are available locally

BASE_DIR="/home/book/iframe-csp/static"
METASO_FILES_DIR="$BASE_DIR/metaso.cn_files"
FONTS_DIR="$BASE_DIR/metaso.cn_files/fonts/woff-v2"
OTHER_DIR="$BASE_DIR/other"

# Create directories
mkdir -p "$METASO_FILES_DIR"
mkdir -p "$FONTS_DIR" 
mkdir -p "$OTHER_DIR"

echo "Downloading missing static resources..."

# Download MathJax fonts (these are critical for mathematical expressions)
MATHIJAX_FONTS=(
    "MathJax_Zero.woff"
    "MathJax_Main-Regular.woff"
    "MathJax_Main-Bold.woff"
    "MathJax_Math-Italic.woff"
    "MathJax_Main-Italic.woff"
    "MathJax_Math-BoldItalic.woff"
    "MathJax_Size1-Regular.woff"
    "MathJax_Size2-Regular.woff"
    "MathJax_Size3-Regular.woff"
    "MathJax_Size4-Regular.woff"
    "MathJax_AMS-Regular.woff"
    "MathJax_Calligraphic-Regular.woff"
    "MathJax_Calligraphic-Bold.woff"
    "MathJax_Fraktur-Regular.woff"
    "MathJax_Fraktur-Bold.woff"
    "MathJax_SansSerif-Regular.woff"
    "MathJax_SansSerif-Bold.woff"
    "MathJax_SansSerif-Italic.woff"
)

echo "Downloading MathJax fonts..."
for font in "${MATHIJAX_FONTS[@]}"; do
    if [[ ! -f "$FONTS_DIR/$font" ]]; then
        echo "Downloading $font..."
        curl -s -L "https://static-1.metaso.cn/static/output/chtml/fonts/woff-v2/$font" -o "$FONTS_DIR/$font"
        if [[ $? -eq 0 && -s "$FONTS_DIR/$font" ]]; then
            echo "✓ Downloaded $font"
        else
            echo "✗ Failed to download $font"
        fi
    else
        echo "✓ $font already exists"
    fi
done

# Download manifest and other resources
echo "Downloading other resources..."

# Site manifest
if [[ ! -f "$OTHER_DIR/site.webmanifest" ]]; then
    echo "Downloading site.webmanifest..."
    curl -s -L "https://metaso.cn/site.webmanifest" -o "$OTHER_DIR/site.webmanifest"
    if [[ $? -eq 0 && -s "$OTHER_DIR/site.webmanifest" ]]; then
        echo "✓ Downloaded site.webmanifest"
    else
        echo "✗ Failed to download site.webmanifest"
    fi
fi

# Apple touch icon
if [[ ! -f "$BASE_DIR/images/apple-touch-icon.png" ]]; then
    mkdir -p "$BASE_DIR/images"
    echo "Downloading apple-touch-icon.png..."
    curl -s -L "https://metaso.cn/apple-touch-icon.png" -o "$BASE_DIR/images/apple-touch-icon.png"
    if [[ $? -eq 0 && -s "$BASE_DIR/images/apple-touch-icon.png" ]]; then
        echo "✓ Downloaded apple-touch-icon.png"
    else
        echo "✗ Failed to download apple-touch-icon.png"
    fi
fi

# Check for any missing JavaScript/CSS files that might be referenced
echo "Checking for missing JavaScript and CSS files..."

# Common missing files that might be needed
COMMON_FILES=(
    "tex-mml-chtml.js"
    "polyfill.js" 
    "wxLogin.js"
    "serviceWorkerRegister.js"
    "lib.js"
    "init.js"
)

for file in "${COMMON_FILES[@]}"; do
    if [[ ! -f "$METASO_FILES_DIR/$file" ]]; then
        echo "Downloading $file..."
        # Try multiple possible URLs
        for url in "https://static-1.metaso.cn/static/$file" "https://metaso.cn/static/$file" "https://static-1.metaso.cn/_next/static/$file"; do
            curl -s -L "$url" -o "$METASO_FILES_DIR/$file"
            if [[ $? -eq 0 && -s "$METASO_FILES_DIR/$file" ]]; then
                echo "✓ Downloaded $file from $url"
                break
            else
                rm -f "$METASO_FILES_DIR/$file"
            fi
        done
        
        if [[ ! -f "$METASO_FILES_DIR/$file" ]]; then
            echo "✗ Failed to download $file from all URLs"
        fi
    else
        echo "✓ $file already exists"
    fi
done

echo "Download script completed!"
echo "All static resources should now be available locally."

# List what we have
echo ""
echo "Summary of downloaded resources:"
echo "Files in metaso.cn_files: $(ls -1 "$METASO_FILES_DIR" | wc -l)"
echo "Font files: $(ls -1 "$FONTS_DIR" 2>/dev/null | wc -l)"
echo "Other files: $(ls -1 "$OTHER_DIR" 2>/dev/null | wc -l)"
