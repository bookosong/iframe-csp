# 图片资源URL替换功能故障排除报告

## 问题描述
用户反映在搜索后跳转的页面中，图片资源不显示。源地址为 `https://metaso.cn/api/file/...` 的图片被错误地替换为 `https://localhost/...`，应该替换为代理服务器地址。

## 解决方案

### 1. 服务端HTML处理增强
在 `processHtmlResponse` 函数中添加了通用的metaso.cn URL替换功能：

```javascript
// === 新增：通用的metaso.cn资源URL替换 ===
// 处理所有指向https://metaso.cn的资源URL，替换为代理服务器地址
function replaceMetasoUrls(html) {
    // 替换HTML中所有的metaso.cn URL为代理服务器URL
    return html.replace(/https:\/\/metaso\.cn(\/[^"'\s>]*)/g, (match, path) => {
        const newUrl = `${PROXY_SERVER_URL}${path}`;
        logger.debug(`URL替换: ${match} -> ${newUrl}`);
        return newUrl;
    });
}

// 应用通用URL替换
const htmlString = $.html();
const replacedHtml = replaceMetasoUrls(htmlString);
if (replacedHtml !== htmlString) {
    $ = cheerio.load(replacedHtml);
    logger.info('已应用通用metaso.cn URL替换');
}
```

### 2. 客户端动态图片拦截
在注入的JavaScript中添加了动态图片URL监听和替换功能：

```javascript
// === 新增：动态图片和资源URL替换 ===
function interceptImageLoading() {
    // 替换现有图片的src属性
    document.querySelectorAll('img[src*="metaso.cn"]').forEach(img => {
        const originalSrc = img.src;
        const newSrc = originalSrc.replace('https://metaso.cn', PROXY_SERVER_URL);
        if (newSrc !== originalSrc) {
            img.src = newSrc;
            authLog('替换图片URL:', originalSrc, '->', newSrc);
        }
    });
    
    // 替换CSS背景图片
    document.querySelectorAll('*').forEach(element => {
        const style = window.getComputedStyle(element);
        const backgroundImage = style.backgroundImage;
        if (backgroundImage && backgroundImage.includes('metaso.cn')) {
            const newBgImage = backgroundImage.replace(/https:\/\/metaso\.cn/g, PROXY_SERVER_URL);
            if (newBgImage !== backgroundImage) {
                element.style.backgroundImage = newBgImage;
                authLog('替换背景图片URL:', backgroundImage, '->', newBgImage);
            }
        }
    });
    
    // 监听新添加的图片元素
    if (window.MutationObserver && !window.__imageObserverInstalled) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // 元素节点
                        // 检查添加的图片元素
                        if (node.tagName === 'IMG' && node.src && node.src.includes('metaso.cn')) {
                            const originalSrc = node.src;
                            const newSrc = originalSrc.replace('https://metaso.cn', PROXY_SERVER_URL);
                            node.src = newSrc;
                            authLog('动态替换图片URL:', originalSrc, '->', newSrc);
                        }
                        
                        // 检查子元素中的图片
                        node.querySelectorAll?.('img[src*="metaso.cn"]')?.forEach(img => {
                            const originalSrc = img.src;
                            const newSrc = originalSrc.replace('https://metaso.cn', PROXY_SERVER_URL);
                            img.src = newSrc;
                            authLog('动态替换子图片URL:', originalSrc, '->', newSrc);
                        });
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        window.__imageObserverInstalled = true;
        authLog('图片URL监听器已安装');
    }
}

// 立即执行图片URL替换
interceptImageLoading();

// 延迟再次执行，确保动态加载的内容也被处理
setTimeout(interceptImageLoading, 2000);
setTimeout(interceptImageLoading, 5000);
```

### 3. 修复常量重赋值问题
将 `processHtmlResponse` 函数中的 `const $` 改为 `let $`，解决了重新赋值cheerio对象的问题。

```javascript
// 修改前
const $ = cheerio.load(html);

// 修改后
let $ = cheerio.load(html);
```

## 功能特点

### 1. 多层次拦截
- **服务端HTML处理**：在HTML响应时直接替换所有metaso.cn的URL
- **客户端实时监听**：使用MutationObserver监听DOM变化，动态替换新添加的图片
- **多种资源类型**：支持img标签的src属性和CSS背景图片

### 2. 智能检测
- **避免重复处理**：通过标记防止重复安装监听器
- **精确匹配**：使用正则表达式精确匹配metaso.cn域名
- **路径保持**：保持原始URL的路径结构，只替换域名

### 3. 全面覆盖
- **API文件**：支持 `/api/file/xxx/figures` 等API动态生成的图片
- **静态资源**：支持各种格式的图片文件 (.jpg, .png, .jpeg等)
- **动态内容**：支持JavaScript动态加载的图片内容

## 测试验证

### 使用方法
1. 启动代理服务器：
   ```bash
   PORT=8080 node metaso-proxy-autosearch.js
   ```

2. 访问测试页面：
   ```
   http://localhost:8080/search?q=图表测试&scope=泥沙知识
   ```

3. 查看服务器日志，确认URL替换功能正常工作

### 日志输出示例
```
[DEBUG] URL替换: https://metaso.cn/api/file/8633750210809888768/figures?type=1&filename=1_0.jpg -> http://localhost:8080/api/file/8633750210809888768/figures?type=1&filename=1_0.jpg
[INFO] 已应用通用metaso.cn URL替换
[INFO] 图片URL监听器已安装
```

## 技术优势

1. **通用性强**：不仅限于特定的图片路径，支持所有metaso.cn域名下的资源
2. **性能优化**：服务端和客户端双重处理，确保资源正确加载
3. **兼容性好**：支持React等单页应用的动态内容更新
4. **扩展性强**：可以轻松扩展支持其他类型的资源

## 总结

通过实施这个解决方案，成功解决了图片资源不显示的问题。现在所有指向 `https://metaso.cn` 的URL都会被正确替换为代理服务器地址 `http://localhost:8080`，确保图片和其他资源能够正常加载显示。

修改完成时间：2025-01-24 04:00:00
