const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 10101; // 改回原来的端口

// 环境配置
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// 日志配置
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const CURRENT_LOG_LEVEL = IS_PRODUCTION ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

// 日志函数
function log(level, ...args) {
    const levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    if (level <= CURRENT_LOG_LEVEL) {
        const timestamp = new Date().toISOString();
        const levelName = levelNames[level];
        const prefix = IS_PRODUCTION ? 
            `[${timestamp}] [${levelName}] [PROD]` : 
            `[${timestamp}] [${levelName}] [DEV]`;
        console.log(prefix, ...args);
    }
}

// 便捷日志方法
const logger = {
    error: (...args) => log(LOG_LEVELS.ERROR, ...args),
    warn: (...args) => log(LOG_LEVELS.WARN, ...args),
    info: (...args) => log(LOG_LEVELS.INFO, ...args),
    debug: (...args) => log(LOG_LEVELS.DEBUG, ...args)
};

// JavaScript文件预处理中间件 - 移除源码映射引用
app.use('/static', (req, res, next) => {
    // 只处理JavaScript文件
    if (req.path.endsWith('.js')) {
        const filePath = path.join(__dirname, 'static', req.path);
        
        // 检查文件是否存在
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                // 文件不存在，继续到下一个中间件
                return next();
            }
            
            // 移除源码映射引用
            const cleanedData = data.replace(/\/\/# sourceMappingURL=.*\.map/g, '');
            
            // 设置正确的内容类型
            res.setHeader('content-type', 'application/javascript; charset=UTF-8');
            res.send(cleanedData);
        });
    } else {
        // 非JS文件，继续处理
        next();
    }
});

// 设置静态资源中间件，将 /static 路径映射到本地的 static 目录
app.use('/static', express.static(path.join(__dirname, 'static')));

// 404 fallback for missing static files - try to fetch from original server
app.use('/static', (req, res, next) => {
    const filePath = req.path;
    console.log(`Missing static file: ${filePath}`);
    
    // Handle source map requests - return 404 to suppress source map errors
    if (filePath.endsWith('.map') || filePath.includes('.map')) {
        console.log(`Source map request ignored: ${filePath}`);
        return res.status(404).send('Source map not available');
    }
    
    // Try to map to original URL
    let originalUrl = '';
    if (filePath.startsWith('/metaso.cn_files/')) {
        const filename = filePath.replace('/metaso.cn_files/', '');
        
        // Handle different file patterns
        if (filename.startsWith('usermaven/')) {
            originalUrl = `https://static-1.metaso.cn/${filename}`;
        } else if (filename.includes('.png') || filename.includes('.jpg') || filename.includes('.jpeg')) {
            // Media files
            originalUrl = `https://static-1.metaso.cn/_next/static/media/${filename}`;
        } else if (filename.includes('-') && filename.endsWith('.js')) {
            // Chunk files with hashes
            originalUrl = `https://static-1.metaso.cn/_next/static/chunks/pages/${filename}`;
        } else if (filename.endsWith('.js')) {
            // Other JS files
            originalUrl = `https://static-1.metaso.cn/_next/static/chunks/${filename}`;
        } else if (filename.endsWith('.css')) {
            // CSS files
            originalUrl = `https://static-1.metaso.cn/_next/static/css/${filename}`;
        } else {
            // Generic fallback
            originalUrl = `https://static-1.metaso.cn/_next/static/${filename}`;
        }
    }
    
    if (originalUrl) {
        console.log(`Proxying missing file from: ${originalUrl}`);
        // Proxy the request to the original server
        const https = require('https');
        https.get(originalUrl, (proxyRes) => {
            // Set appropriate content type
            let contentType = proxyRes.headers['content-type'] || 'application/javascript';
            
            // Modify JavaScript files to remove source map references
            if (contentType.includes('javascript') || originalUrl.endsWith('.js')) {
                let data = '';
                proxyRes.on('data', chunk => {
                    data += chunk;
                });
                proxyRes.on('end', () => {
                    // Remove source map references to prevent 404 errors
                    const cleanedData = data.replace(/\/\/# sourceMappingURL=.*\.map/g, '');
                    res.setHeader('content-type', contentType);
                    res.send(cleanedData);
                });
            } else {
                // For non-JS files, pipe directly
                res.setHeader('content-type', contentType);
                proxyRes.pipe(res);
            }
        }).on('error', (err) => {
            logger.debug('已移除CSP meta标签');
            res.status(404).send('File not found');
        });
    } else {
        res.status(404).send('File not found');
    }
});

// HTML处理函数
function processHtmlResponse(html, requestPath) {
 
    try {
        const $ = cheerio.load(html);
        
        logger.info(`处理HTML请求: ${requestPath}`);
        
    // 移除CSP的meta标签
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();
    $('meta[name="content-security-policy"]').remove();
    logger.debug('已移除CSP meta标签');

    // 彻底移除左侧菜单栏（LeftMenu相关class/id）
    $('[class*="LeftMenu"], [id*="LeftMenu"], .LeftMenu, #LeftMenu').remove();
    logger.info('已彻底移除LeftMenu相关侧边栏DOM');

        // 隐藏广告链接（微信广告地址）
        // 1. 隐藏所有a标签（精确和模糊匹配）
        $('a[href="https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"], a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]').each(function() {
            $(this).css('display', 'none');
        });
        // 2. 隐藏所有含该链接的data-href
        $('[data-href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]').each(function() {
            $(this).css('display', 'none');
        });
        // 3. 隐藏所有包含该链接文本的元素
        $('*').filter(function(){
            return $(this).text().includes('https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg');
        }).each(function() {
            $(this).css('display', 'none');
        });
        // 4. 隐藏所有包含该链接的父容器（如广告块div）
        $('a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]').each(function(){
            $(this).parent().css('display', 'none');
        });
        // 5. 针对 SystemMessage_message-content__jqSud 广告div直接删除（只要包含目标链接或广告文案）
        $('div.SystemMessage_message-content__jqSud').each(function() {
            var $div = $(this);
            var $a = $div.find('a[href="https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]');
            if ($a.length && $a.text().includes('3分钱，秘塔搜索 API 上线')) {
                $div.remove();
                return;
            }
            if ($div.text().includes('3分钱，秘塔搜索 API 上线')) {
                $div.remove();
            }
        });
        logger.info('已删除微信广告DOM及其容器');

    // 在<head>插入meta授权token，便于前端检测
    $('head').prepend('<meta name="authorization" content="Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE">');
    logger.info('已插入meta授权token');
        
        // 优化页面标题和meta信息
        $('title').each((index, element) => {
            const title = $(element).text();
            if (title.includes('秘塔AI搜索')) {
                $(element).text(title.replace('秘塔AI搜索', '安全监测'));
                logger.debug('已修改页面标题');
            }
        });
        
        // 修改meta标签中的描述
        $('meta[name="description"]').each((index, element) => {
            const content = $(element).attr('content');
            if (content && content.includes('秘塔AI搜索')) {
                $(element).attr('content', content.replace('秘塔AI搜索', '安全监测'));
                logger.debug('已修改meta描述');
            }
        });
        
        // 隐藏特定的meta标签 - "没有广告，直达结果"
        $('meta').each((index, element) => {
            const content = $(element).attr('content');
            if (content && content.includes('没有广告，直达结果')) {
                $(element).remove();
                logger.debug('已移除广告相关meta标签');
            }
        });
        
        // 修改文字“没有广告，直达结果”为“本地搜索”后隐藏
        $('[class*="SearchHome_sub-title__4foku MuiBox-root css-0"]').each(function() {
            const el = $(this);
            el.contents().filter(function() {
                return this.type === 'text' && this.data && this.data.includes('没有广告，直达结果');
            }).each(function() {
                // 替换为“本地搜索”
                const newText = this.data.replace('没有广告，直达结果', '本地搜索');
                const hidden = $('<span style="display:none !important"></span>').text(newText);
                $(this).replaceWith(hidden);
            });
        });

        // 隐藏apple-touch-icon - 设置尺寸为0
        $('link[rel="apple-touch-icon"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('apple-touch-icon.png')) {
                // 通过添加自定义属性来标记需要隐藏的图标
                $(element).attr('data-hidden', 'true');
                logger.debug('已标记apple-touch-icon为隐藏');
            }
        });
        
        // 为所有页面注入授权脚本，确保二级三级页面也保持登录状态
        logger.info(`处理页面: ${requestPath}，注入通用授权脚本...`);
        
        // 优化：将授权信息设置脚本和预隐藏样式提前插入<head>最前面，确保最早生效
        const earlyHideStyle = `
<style id="early-hide-ad-style">
div.SystemMessage_message-content__jqSud,
a[href="https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
[data-href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
[href*="3分钱，秘塔搜索 API 上线"],
[title*="3分钱，秘塔搜索 API 上线"],
*:contains("3分钱，秘塔搜索 API 上线"),
*:contains("没有广告，直达结果")
{ display: none !important; }
</style>
`;
        const earlyAuthScript = `
<script>
(function(){
    try {
        localStorage.setItem('uid', '68775c6659a307e8ac864bf6');
        localStorage.setItem('sid', 'e5874318e9ee41788605c88fbe43ab19');
        localStorage.setItem('token', 'mk-4A9944E6F3917711EFCF7B772BC3A5AE');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', Date.now().toString());
        document.cookie = 'uid=68775c6659a307e8ac864bf6; path=/; domain=localhost; SameSite=Lax';
        document.cookie = 'sid=e5874318e9ee41788605c88fbe43ab19; path=/; domain=localhost; SameSite=Lax';
        document.cookie = 'isLoggedIn=true; path=/; domain=localhost; SameSite=Lax';
        document.cookie = 'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE; path=/; domain=localhost; SameSite=Lax';
    } catch(e) {}
    // 劫持fetch和XMLHttpRequest，强制带Authorization
    const AUTH_TOKEN = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
    if (window.fetch) {
        const _fetch = window.fetch;
        window.fetch = function(input, init) {
            let newInit = Object.assign({}, init);
            // 处理 Request 对象
            if (input instanceof Request) {
                newInit.headers = new Headers(input.headers);
                newInit.headers.set('Authorization', AUTH_TOKEN);
                return _fetch(input, newInit);
            }
            // 处理普通 URL
            newInit.headers = new Headers(newInit.headers || {});
            newInit.headers.set('Authorization', AUTH_TOKEN);
            return _fetch(input, newInit);
        };
    }
    // XMLHttpRequest
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function() {
        this._shouldInjectAuth = true;
        return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        if (this._shouldInjectAuth) {
            try { this.setRequestHeader('Authorization', AUTH_TOKEN); } catch(e) {}
        }
        return _send.apply(this, arguments);
    };
})();
</script>
`;
        $('head').prepend(earlyHideStyle + earlyAuthScript);
        // 其余授权脚本和拦截器逻辑保持原有位置
        // ...existing code...
        
        // 禁用服务端CSS注入，避免影响React hydration
        // 微信元素隐藏将在客户端React hydration完成后处理
        logger.info('跳过服务端CSS注入以避免React hydration冲突');
        
    // 增强服务端注入CSS选择器和!important，提升对动态class/id的适配
        const pageOptimizationCSS = `
        <style id="page-optimization-css">
        /* 强化页面优化样式 - 服务端注入避免React hydration冲突 */
        .sidebar, .side-bar, .left-sidebar, .right-sidebar,
        [class*="sidebar"], [class*="side-bar"], [id*="sidebar"], [id*="side-bar"],
        aside, nav[class*="side"], .navigation-sidebar, .app-sidebar, .main-sidebar,
        .layout-sidebar, .page-sidebar, .content-sidebar, .drawer, .side-panel,
        [class*="LeftMenu"], [id*="LeftMenu"], .LeftMenu, #LeftMenu, .left-menu, [class*="LeftMenu_content"], [class*="LeftMenu_footer"],
        [class*="LeftMenu_header"], [class*="LeftMenu_logo-btn"], [class*="LeftMenu_menu-container"],
        [class*="LeftMenu_menu"], [class*="LeftMenu_sidebar-action"], [class*="LeftMenu_back-btn"],
        [class*="sidebar" i], [id*="sidebar" i], [class*="side" i], [id*="side" i],
        [class*="menu" i][class*="left" i], [class*="panel" i][class*="side" i]
        { display: none !important; width: 0 !important; height: 0 !important; opacity: 0 !important; visibility: hidden !important; position: absolute !important; left: -9999px !important; overflow: hidden !important; z-index: -9999 !important; }
        a[href="https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
        a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"], a[href*="AKYOZfBM_Ph0OiIj_8lCeg"],
        [data-href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"], [href*="3分钱，秘塔搜索 API 上线"],
        [title*="3分钱，秘塔搜索 API 上线"], *:contains("3分钱，秘塔搜索 API 上线"), *:contains("没有广告，直达结果")
        { display: none !important; width: 0 !important; height: 0 !important; opacity: 0 !important; visibility: hidden !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important; }
        </style>
        <script>
        // 客户端兜底隐藏和删除广告、隐藏“没有广告，直达结果”
        (function(){
            // 隐藏“没有广告，直达结果”
            function hideTextInSearchHomeSub() {
                var nodes = document.querySelectorAll('[class*="SearchHome_sub-title__4foku MuiBox-root css-0"]');
                nodes.forEach(function(node) {
                    hideTextRecursive(node);
                });
            }
            function hideTextRecursive(node) {
                if (!node) return;
                if (node.nodeType === 3 && node.nodeValue && node.nodeValue.indexOf('没有广告，直达结果') !== -1) {
                    var span = document.createElement('span');
                    span.style.display = 'none';
                    span.textContent = node.nodeValue;
                    if (node.parentNode) node.parentNode.replaceChild(span, node);
                    return;
                }
                if (node.childNodes && node.childNodes.length) {
                    Array.prototype.slice.call(node.childNodes).forEach(hideTextRecursive);
                }
            }
            // 删除广告div
            function removeAdDivs() {
                var adDivs = document.querySelectorAll('div.SystemMessage_message-content__jqSud');
                adDivs.forEach(function(div) {
                    var a = div.querySelector('a[href="https://mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]');
                    if ((a && a.textContent.includes('3分钱，秘塔搜索 API 上线')) || div.textContent.includes('3分钱，秘塔搜索 API 上线')) {
                        div.remove();
                    }
                });
            }
            function runAndSchedule() {
                hideTextInSearchHomeSub();
                removeAdDivs();
                setTimeout(runAndSchedule, 1000);
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', runAndSchedule);
            } else {
                runAndSchedule();
            }
            // 兜底：页面变动时也处理
            var observer = new MutationObserver(function(){
                hideTextInSearchHomeSub();
                removeAdDivs();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        })();
        </script>
        `;
    $('head').append(pageOptimizationCSS);
    logger.info('已注入页面优化CSS');
        
        // 将HTML中引用的静态资源路径替换为本地路径，并优化加载策略
        let replacedCount = 0;
        const processedResources = new Set(); // 防止重复处理
        const preloadResources = []; // 收集需要预加载的资源
        
        // 辅助函数：从URL中提取文件名
        function extractFilename(url) {
            if (!url) return null;
            // 匹配已存在的 metaso.cn_files/ 路径
            if (url.includes('metaso.cn_files/')) {
                return url.split('metaso.cn_files/')[1];
            }
            return null;
        }
        
        // 辅助函数：处理资源并收集预加载信息
        function processResource(originalUrl, filename, resourceType, priority = 'medium') {
            if (!filename || processedResources.has(filename)) {
                return null; // 防止重复处理
            }
            
            const localPath = '/static/metaso.cn_files/' + filename;
            processedResources.add(filename);
            replacedCount++;
            
            // 收集需要预加载的资源
            preloadResources.push({
                href: localPath,
                as: resourceType,
                priority: priority
            });
            
            logger.debug(`处理${resourceType}: ${originalUrl} -> ${localPath}`);
            return localPath;
        }
        
        // 处理CSS文件 - 高优先级预加载
        $('link[rel="stylesheet"]').each((index, element) => {
            const href = $(element).attr('href');
            const filename = extractFilename(href);
            const localPath = processResource(href, filename, 'style', 'high');
            if (localPath) {
                $(element).attr('href', localPath);
            }
        });
        
        // 处理JS文件 - 中等优先级预加载
        $('script[src]').each((index, element) => {
            const src = $(element).attr('src');
            const filename = extractFilename(src);
            const localPath = processResource(src, filename, 'script', 'medium');
            if (localPath) {
                $(element).attr('src', localPath);
            }
        });
        
        // 处理图片 - 低优先级预加载
        $('img[src]').each((index, element) => {
            const src = $(element).attr('src');
            const filename = extractFilename(src);
            const localPath = processResource(src, filename, 'image', 'low');
            if (localPath) {
                $(element).attr('src', localPath);
            }
        });
        
        // 检查现有的preload链接，避免重复
        const existingPreloads = new Set();
        $('link[rel="preload"]').each((index, element) => {
            const href = $(element).attr('href');
            const filename = extractFilename(href);
            if (filename) {
                const localPath = '/static/metaso.cn_files/' + filename;
                $(element).attr('href', localPath);
                existingPreloads.add(localPath);
                processedResources.add(filename);
                replacedCount++;
                logger.debug(`更新现有Preload: ${href} -> ${localPath}`);
            }
        });
        
        // 在head中添加预加载链接 - 按优先级排序
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        const sortedResources = preloadResources
            .filter(resource => !existingPreloads.has(resource.href))
            .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        
        // 添加预加载链接到head开头，确保早期加载
        sortedResources.forEach(resource => {
            const preloadLink = `<link rel="preload" href="${resource.href}" as="${resource.as}" crossorigin="anonymous">`;
            $('head').prepend(preloadLink);
        });
        
        logger.info(`已替换 ${replacedCount} 个静态资源路径`);
        logger.info(`添加了 ${sortedResources.length} 个预加载链接`);
        
        
        return $.html();
        
    } catch (error) {
        console.error('HTML处理错误:', error);
        return html; // 返回原始HTML
    }
}

// 处理CORS预检请求
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

// 搜索功能路由 - 完全模拟metaso.cn的真实搜索流程
app.get('/search/:id', async (req, res) => {
    const searchId = req.params.id;
    const query = req.query.q;
    
    logger.info(`=== 完整模拟metaso.cn搜索流程 ===`);
    logger.info(`搜索ID: ${searchId}`);
    logger.info(`查询词: ${query}`);
    
    if (!query) {
        return res.status(400).json({ 
            error: '缺少查询参数q', 
            usage: '/search/ID?q=查询词' 
        });
    }
    
    try {
        // 初始化搜索会话
        const systemSearchId = uuidv4();
        logger.info(`生成系统搜索ID: ${systemSearchId}`);
        
        // 完全模拟metaso.cn的搜索流程
        const searchResult = await performMetasoSearchFlow(systemSearchId, query);
        
        if (searchResult.success) {
            logger.info(`搜索流程完成，最终URL: ${searchResult.finalUrl}`);
            
            // 处理最终搜索结果页面
            const processedHtml = processHtmlResponse(searchResult.html, `/search/${searchId}`);
            const enhancedHtml = injectSearchEnhancement(processedHtml, searchId, systemSearchId, query, searchResult.finalUrl);
            
            // 返回结果
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Frame-Options', 'ALLOWALL');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(enhancedHtml);
            
            logger.info(`搜索完成: "${query}" [用户ID:${searchId}]`);
        } else {
            throw new Error(searchResult.error || '搜索流程失败');
        }
        
    } catch (error) {
        logger.error('搜索处理错误:', error);
        res.status(500).json({
            error: '搜索处理错误',
            message: error.message,
            query: query,
            searchId: searchId
        });
    }
});

// 完全模拟metaso.cn搜索流程的核心函数
async function performMetasoSearchFlow(searchId, query) {
    // 初始化cookie管理器
    let cookies = {
        'uid': '68775c6659a307e8ac864bf6',
        'sid': 'e5874318e9ee41788605c88fbe43ab19',
        'isLoggedIn': 'true',
        'token': 'mk-4A9944E6F3917711EFCF7B772BC3A5AE'
    };
    
    const basHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://metaso.cn/',
        'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',
        'X-User-ID': '68775c6659a307e8ac864bf6',
        'X-Session-ID': 'e5874318e9ee41788605c88fbe43ab19'
    };
    
    function getCookieString() {
        return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    
    function updateCookiesFromResponse(response) {
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            setCookieHeaders.forEach(cookie => {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                if (name && value) {
                    cookies[name.trim()] = value.trim();
                    logger.debug(`更新cookie: ${name.trim()}=${value.trim()}`);
                }
            });
        }
    }
    
    try {
        // 步骤1: 访问 https://metaso.cn/search/[id]?_rsc=1p5af
        logger.info('步骤1: 访问初始搜索页面 _rsc=1p5af');
        const step1Result = await makeRequest(`https://metaso.cn/search/${searchId}?_rsc=1p5af`, {
            method: 'GET',
            headers: {
                ...basHeaders,
                'Accept': 'text/x-component',
                'Cookie': getCookieString()
            }
        });
        
        updateCookiesFromResponse(step1Result.response);
        logger.debug(`步骤1完成，数据长度: ${step1Result.data.length}`);
        
        // 步骤2: 访问 https://metaso.cn/search/[id]?_rsc=e6vkl 获取tid
        logger.info('步骤2: 访问搜索页面 _rsc=e6vkl 获取tid');
        const step2Result = await makeRequest(`https://metaso.cn/search/${searchId}?_rsc=e6vkl`, {
            method: 'GET',
            headers: {
                ...basHeaders,
                'Accept': 'text/x-component',
                'Cookie': getCookieString()
            }
        });
        
        updateCookiesFromResponse(step2Result.response);
        
        // 检查是否获取到tid
        const tidFromCookie = cookies.tid;
        if (!tidFromCookie) {
            // 如果没有从cookie获取到tid，生成一个
            cookies.tid = uuidv4();
            logger.warn(`未从cookie获取到tid，生成新的: ${cookies.tid}`);
        } else {
            logger.info(`获取到tid: ${tidFromCookie}`);
        }
        
        logger.debug(`步骤2完成，数据长度: ${step2Result.data.length}`);
        
        // 步骤3: POST https://metaso.cn/api/searchV2 执行搜索
        logger.info('步骤3: 执行搜索API调用');
        const searchPayload = JSON.stringify({
            query: query,
            searchMode: 'basic',
            source: 'web'
        });
        
        // 添加可能需要的额外cookies
        if (!cookies.JSESSIONID) {
            cookies.JSESSIONID = generateSessionId();
        }
        if (!cookies.__eventn_id_UMO2dYNwFz) {
            cookies.__eventn_id_UMO2dYNwFz = generateEventId();
        }
        
        const step3Result = await makeRequest('https://metaso.cn/api/searchV2', {
            method: 'POST',
            headers: {
                ...basHeaders,
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(searchPayload),
                'Origin': 'https://metaso.cn',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': getCookieString()
            },
            body: searchPayload
        });
        
        updateCookiesFromResponse(step3Result.response);
        logger.info(`步骤3完成，搜索API响应: ${step3Result.response.statusCode}`);
        
        let searchApiData = null;
        try {
            searchApiData = JSON.parse(step3Result.data);
            logger.debug('搜索API返回数据:', searchApiData);
        } catch (e) {
            logger.warn('搜索API响应不是JSON格式');
        }
        
        // 步骤4: 访问中间结果页面 (可能有多次跳转)
        logger.info('步骤4: 访问中间结果页面');
        const intermediateId = uuidv4();
        const step4Result = await makeRequest(`https://metaso.cn/search/${intermediateId}?q=${encodeURIComponent(query)}&_rsc=16hus`, {
            method: 'GET',
            headers: {
                ...basHeaders,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cookie': getCookieString(),
                'newdataid': 'true'  // 根据抓包分析添加的header
            }
        });
        
        updateCookiesFromResponse(step4Result.response);
        logger.debug(`步骤4完成，数据长度: ${step4Result.data.length}`);
        
        // 步骤5: 访问最终结果页面
        logger.info('步骤5: 访问最终结果页面');
        const finalSearchId = generateFinalSearchId(); // 生成类似 8645379897288306688 的数字ID
        const finalUrl = `https://metaso.cn/search/${finalSearchId}?q=${encodeURIComponent(query)}`;
        
        const finalResult = await makeRequest(finalUrl, {
            method: 'GET',
            headers: {
                ...basHeaders,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cookie': getCookieString()
            }
        });
        
        updateCookiesFromResponse(finalResult.response);
        logger.info(`步骤5完成，最终结果页面长度: ${finalResult.data.length}`);
        
        return {
            success: true,
            html: finalResult.data,
            finalUrl: finalUrl,
            finalSearchId: finalSearchId,
            cookies: cookies
        };
        
    } catch (error) {
        logger.error('搜索流程执行失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// HTTP请求辅助函数
function makeRequest(url, options) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    data: data,
                    response: res
                });
            });
        });
        
        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

// 生成Session ID
function generateSessionId() {
    return Array.from({length: 32}, () => 
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
    ).join('');
}

// 生成Event ID  
function generateEventId() {
    return Array.from({length: 10}, () => 
        Math.random().toString(36).substr(2, 1)
    ).join('');
}

// 生成最终搜索ID（数字格式）
function generateFinalSearchId() {
    // 生成类似 8645379897288306688 的19位数字ID
    return '86' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

// 注入搜索增强脚本，支持真实搜索结果显示
function injectSearchEnhancement(html, userSearchId, systemSearchId, query, finalUrl) {
    logger.debug(`注入搜索增强脚本: 用户ID=${userSearchId}, 系统ID=${systemSearchId}, 查询="${query}"`);
    
    const enhancementScript = `
    <script>
    // metaso.cn搜索流程增强脚本
    (function() {
        console.log('=== metaso搜索增强脚本启动 ===');
        console.log('用户搜索ID: ${userSearchId}');
        console.log('系统搜索ID: ${systemSearchId}');
        console.log('查询词: ${query}');
        console.log('最终URL: ${finalUrl}');
        
        // 确保搜索结果正确显示
        function ensureSearchResults() {
            const searchContainer = document.querySelector('[data-testid="search-results"]') || 
                                  document.querySelector('.search-results') ||
                                  document.querySelector('#search-results') ||
                                  document.querySelector('.results');
                                  
            if (searchContainer) {
                console.log('找到搜索结果容器');
                
                // 确保搜索词显示正确
                const searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], .search-input');
                searchInputs.forEach(input => {
                    if (input.value !== '${query}') {
                        input.value = '${query}';
                        console.log('更新搜索输入框');
                    }
                });
                
                // 触发搜索结果渲染
                const event = new CustomEvent('searchCompleted', {
                    detail: {
                        query: '${query}',
                        searchId: '${systemSearchId}',
                        finalUrl: '${finalUrl}'
                    }
                });
                document.dispatchEvent(event);
                
            } else {
                console.log('未找到搜索结果容器，继续监控...');
                setTimeout(ensureSearchResults, 1000);
            }
        }
        
        // 监控页面变化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ensureSearchResults);
        } else {
            ensureSearchResults();
        }
        
        // 使用MutationObserver监控动态内容加载
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    ensureSearchResults();
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // iframe通信支持
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'metaso_search_completed',
                data: {
                    query: '${query}',
                    searchId: '${userSearchId}',
                    systemId: '${systemSearchId}',
                    finalUrl: '${finalUrl}',
                    timestamp: Date.now()
                }
            }, '*');
            
            console.log('向父窗口发送搜索完成消息');
        }
        
        console.log('=== metaso搜索增强脚本初始化完成 ===');
    })();
    </script>
    `;
    
    // 在</body>前插入增强脚本
    if (html.includes('</body>')) {
        return html.replace('</body>', enhancementScript + '</body>');
    } else {
        return html + enhancementScript;
    }
}

// 创建代理中间件，目标为 https://metaso.cn
app.use('/', proxy('https://metaso.cn', {
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        console.log('\\n=== 处理响应头 ' + userReq.path + ' ===');
        console.log('原始响应头:', Object.keys(headers));
        
        // 删除阻止iframe嵌入的响应头
        const removedHeaders = [];
        if (headers['content-security-policy']) {
            delete headers['content-security-policy'];
            removedHeaders.push('content-security-policy');
        }
        if (headers['content-security-policy-report-only']) {
            delete headers['content-security-policy-report-only'];
            removedHeaders.push('content-security-policy-report-only');
        }
        if (headers['x-frame-options']) {
            delete headers['x-frame-options'];
            removedHeaders.push('x-frame-options');
        }
        if (headers['x-content-type-options']) {
            delete headers['x-content-type-options'];
            removedHeaders.push('x-content-type-options');
        }
        
        console.log('已移除响应头:', removedHeaders);
        
        // 添加允许iframe的头
        headers['x-frame-options'] = 'ALLOWALL';
        
        // 添加CORS头，解决跨域问题
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['access-control-allow-headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
        headers['access-control-allow-credentials'] = 'true';
        
        console.log('最终响应头:', Object.keys(headers));
        return headers;
    },
    
    // 处理HTML响应
    userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
        const contentType = proxyRes.headers['content-type'] || '';
        console.log('\n=== 处理响应数据 ALL first ' + userReq.path + ' ==='+userReq.url);
        console.log('Content-Type:', contentType);
        console.log('数据大小:', proxyResData.length);

        // 统一对所有响应类型做 static-1.metaso.cn → /static/ 替换，彻底本地化
        let body = proxyResData;
        try {
            if (contentType.includes('text/html')) {
                // HTML响应：先做静态资源替换，再彻底移除侧边栏/广告并插入token
                let html = proxyResData.toString('utf8').replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
                html = processHtmlResponse(html, userReq.path);
                return html;
            } else if (contentType.includes('json')) {
                // JSON响应：注入token字段
                let json = proxyResData.toString('utf8').replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
                try {
                    let obj = JSON.parse(json);
                    obj.token = 'mk-4A9944E6F3917711EFCF7B772BC3A5AE';
                    obj.data='"q": "谁是这个世界上最美丽的女人", "scope": "webpage";'
                    return JSON.stringify(obj);
                } catch(e) {
                    return json;
                }
            } else if (contentType.includes('text') || contentType.includes('javascript') || contentType.includes('css') || contentType.includes('xml')) {
                body = proxyResData.toString('utf8');
                body = body.replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
            }
        } catch (e) {
            // ignore
        }
        return body;
    },
    
    // 代理请求选项
    proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
        // 设置合适的请求头
        proxyReqOpts.headers = proxyReqOpts.headers || {};
        proxyReqOpts.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        proxyReqOpts.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        proxyReqOpts.headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
        
        // 对 /search/ 请求，始终带上认证信息和本地静态资源拦截
        if (srcReq.path.includes('/search/')) {
            // 认证信息
            proxyReqOpts.headers['Authorization'] = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
            proxyReqOpts.headers['X-User-ID'] = '68775c6659a307e8ac864bf6';
            proxyReqOpts.headers['X-Session-ID'] = 'e5874318e9ee41788605c88fbe43ab19';
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            // Cookie 认证
            const authCookies = [
                'uid=68775c6659a307e8ac864bf6',
                'sid=e5874318e9ee41788605c88fbe43ab19',
                'isLoggedIn=true',
                'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE'
            ];
            proxyReqOpts.headers['Cookie'] = authCookies.join('; ');
            // 保证 referer/origin 指向本站，防止源站校验失败
            proxyReqOpts.headers['Referer'] = 'https://metaso.cn/';
            proxyReqOpts.headers['Origin'] = 'https://metaso.cn';

        /*// 自动解析带网络参数的地址，转为POST到API
            const url = require('url');
            const querystring = require('querystring');
            const parsedUrl = url.parse(srcReq.url, true);
            // 只处理带参数的 /search/ 请求
            if (parsedUrl.query && Object.keys(parsedUrl.query).length > 0) {
                // 构造POST数据，支持常见参数
                let postData = {
                    q: parsedUrl.query.q || '',
                    scope: parsedUrl.query.scope || 'webpage',
                    includeSummary: parsedUrl.query.includeSummary === 'true' ? true : false,
                    size: parsedUrl.query.size || '10',
                    includeRawContent: parsedUrl.query.includeRawContent === 'true' ? true : false,
                    conciseSnippet: parsedUrl.query.conciseSnippet === 'true' ? true : false
                };
                // 允许传递额外参数
                for (const k in parsedUrl.query) {
                    if (!(k in postData)) postData[k] = parsedUrl.query[k];
                }
                proxyReqOpts.method = 'POST';
                proxyReqOpts.path = '/api/v1/search';
                proxyReqOpts.headers['Content-Type'] = 'application/json';
                proxyReqOpts.body = JSON.stringify(postData);
                // express-http-proxy 需要buffer
                proxyReqOpts.buffer = Buffer.from(proxyReqOpts.body);
                // 日志
                console.log('自动POST到API:', proxyReqOpts.path, proxyReqOpts.body);
            } else {
                // 无参数，按原逻辑GET
                proxyReqOpts.href = 'https://metaso.cn/' + srcReq.path;
                console.log('已为/search/请求query ' + srcReq.path + srcReq.url);
            }*/

        } else if (srcReq.path.includes('/api/') || srcReq.path.includes('/login/')) {
            // 其他API同原逻辑
            proxyReqOpts.headers['Authorization'] = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
            proxyReqOpts.headers['X-User-ID'] = '68775c6659a307e8ac864bf6';
            proxyReqOpts.headers['X-Session-ID'] = 'e5874318e9ee41788605c88fbe43ab19';
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            const authCookies = [
                'uid=68775c6659a307e8ac864bf6',
                'sid=e5874318e9ee41788605c88fbe43ab19',
                'isLoggedIn=true',
                'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE'
            ];
            proxyReqOpts.headers['Cookie'] = authCookies.join('; ');
            console.log('已为API请求 ' + srcReq.path + ' 添加认证信息 (Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE)');
        }

        console.log('\n=== 代理请求 ' + srcReq.path + ' ===');
        
        return proxyReqOpts;
    }
}));

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`=== metaso.cn 代理服务器已启动 ===`);
    logger.info(`环境: ${IS_PRODUCTION ? 'Production' : 'Development'}`);
    logger.info(`日志级别: ${IS_PRODUCTION ? 'INFO' : 'DEBUG'}`);
    logger.info(`监听端口: ${PORT}`);
    logger.info(`访问地址: http://localhost:${PORT}`);
    logger.info(`静态资源: http://localhost:${PORT}/static/`);
    logger.info(`代理目标: https://metaso.cn`);
    logger.info(`==============================`);
    
    logger.info('功能说明:');
    logger.info('- ✓ 移除CSP和X-Frame-Options头');
    logger.info('- ✓ 删除微信登录相关元素');
    logger.info('- ✓ 注入localStorage授权信息');
    logger.info('- ✓ 静态资源本地化服务');
    logger.info('- ✓ iframe兼容性处理');
    logger.info('- ✓ 所有页面登录状态保持');
    logger.info('- ✓ API请求CORS拦截');
    
    if (!IS_PRODUCTION) {
        logger.debug('测试命令:');
        logger.debug(`curl http://localhost:${PORT} -I`);
        logger.debug(`curl http://localhost:${PORT}/static/metaso.cn_files/06379910118566c4.css -I`);
    }
});

app.on('error', (err) => {
    logger.error('服务器错误:', err);
});

module.exports = app;
