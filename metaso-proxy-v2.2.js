// 简单自定义 logger
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.debug('[DEBUG]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};
const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const app = express();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = 10101; // 改回原来的端口

// 智能解析 /search/:id 路由，短ID自动POST获取新ID并重定向，长ID直接代理
app.get('/search/:id', async (req, res, next) => {
    let searchId = req.params.id;
    let queryStr = req.url.split('?')[1] || '';
    let queryObj = {};
    // 支持分号和&混合参数
    if (queryStr) {
        queryStr.split(/[;&]/).forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) queryObj[k.trim()] = decodeURIComponent(v.trim());
        });
    }
    // 兼容 ?q=xxx;scope=yyy 这种格式
    
    if (queryObj.q && typeof queryObj.q === 'string' && queryObj.q.includes(';')) {
        queryObj.q.split(';').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) queryObj[k.trim()] = v.trim();
        });
    }
    // 长ID直接代理
    if (searchId && searchId.length >= '8646326301509578752'.length) {
        return next();
    }
    // 短ID，模拟前端行为，POST获取新ID
    if (!queryObj.q || typeof queryObj.q !== 'string' || !queryObj.q.length) {
        return res.status(400).send('缺少q参数');
    }
    let postData = {
        id: uuidv4(),
        q: queryObj.q,
        scope: queryObj.scope || 'webpage',
        includeSummary: queryObj.includeSummary === 'true',
        size: queryObj.size || '10',
        includeRawContent: queryObj.includeRawContent === 'true',
        conciseSnippet: queryObj.conciseSnippet === 'true'
    };
    for (const k in queryObj) {
        if (!(k in postData)) postData[k] = queryObj[k];
    }
    try {
        const apiRes = await axios.post('https://metaso.cn/api/v1/search', postData, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',
                'Content-Type': 'application/json',
            }
        });
        console.log('metaso.cn/search/ API 返回:', JSON.stringify(apiRes.data));
        let realId = apiRes.data && (apiRes.data.id || (apiRes.data.data && apiRes.data.data.id));
        if (!realId) {
            return res.status(502).send('API未返回有效ID: ' + JSON.stringify(apiRes.data));
        }
        // 保留原参数，重定向到新ID
        const url = require('url');
        let redirectUrl = url.format({
            pathname: `/search/${realId}`,
            query: queryObj
        });
        return res.redirect(302, redirectUrl);
    } catch (err) {
        return res.status(502).send('API查询失败');
    }
 });

// ...existing code...

// HTML处理函数
function processHtmlResponse(html, requestPath) {
    try {
        // ...existing code...

// /static 路由：本地优先，找不到自动回源远程静态资源
const sendLocalOrProxy = async (req, res) => {
    // 修正本地路径拼接，去掉 req.path 开头的 /
    const relPath = req.path.replace(/^\//, '');
    const localPath = path.join(__dirname, 'static', relPath);
    console.log('[STATIC] 请求:', req.path);
    console.log('[STATIC] 本地查找:', localPath);
    if (fs.existsSync(localPath)) {
        console.log('[STATIC] 命中本地，直接返回');
        return res.sendFile(localPath);
    }
    // 自动回源并保存到本地
    const remoteUrl = 'https://static-1.metaso.cn' + req.path;
    console.log('[STATIC] 本地未命中，回源并尝试下载:', remoteUrl);
    try {
        const response = await axios.get(remoteUrl, { responseType: 'arraybuffer', validateStatus: null });
        console.log('[STATIC] 回源状态:', response.status, '类型:', response.headers['content-type']);
        // 只在响应为200且内容有效时才写入本地
        if (
            response.status >= 200 && response.status < 300 &&
            response.headers['content-type'] && !response.headers['content-type'].includes('text/html') &&
            response.data && response.data.length > 0
        ) {
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, response.data);
            res.set('Content-Type', response.headers['content-type'] || 'application/octet-stream');
            console.log('[STATIC] 回源成功，已保存到本地并返回');
            return res.sendFile(localPath);
        } else {
            console.log('[STATIC] 回源失败，远程返回非静态资源、404或内容为空');
            return res.status(404).send('Not found');
        }
    } catch (e) {
        console.log('[STATIC] 回源异常:', e.message, e.response?.status);
        return res.status(404).send('Not found');
    }
};
app.use('/static', (req, res) => {
    // 忽略 source map
    if (req.path.endsWith('.map') || req.path.includes('.map')) {
        return res.status(404).send('Source map not available');
    }
    return sendLocalOrProxy(req, res);
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
        
        // 辅助函数：判断是否为 metaso.cn_files 资源
        function isMetasoFile(url) {
            return url && url.includes('metaso.cn_files/');
        }

        // 只替换 metaso.cn_files/ 资源为本地路径，其他如 /static/_next/static/ 路径保持不变
        function toLocalMetasoPath(url) {
            if (!url) return url;
            if (isMetasoFile(url)) {
                // 只保留 metaso.cn_files/ 后的部分
                const idx = url.indexOf('metaso.cn_files/');
                return '/static/' + url.slice(idx);
            }
            return url;
        }

        // 处理CSS文件 - 高优先级预加载
        $('link[rel="stylesheet"]').each((index, element) => {
            const href = $(element).attr('href');
            const localPath = toLocalMetasoPath(href);
            if (localPath !== href) {
                $(element).attr('href', localPath);
                preloadResources.push({ href: localPath, as: 'style', priority: 'high' });
                replacedCount++;
            }
        });

        // 处理JS文件 - 中等优先级预加载
        $('script[src]').each((index, element) => {
            const src = $(element).attr('src');
            const localPath = toLocalMetasoPath(src);
            if (localPath !== src) {
                $(element).attr('src', localPath);
                preloadResources.push({ href: localPath, as: 'script', priority: 'medium' });
                replacedCount++;
            }
        });

        // 处理图片 - 低优先级预加载
        $('img[src]').each((index, element) => {
            const src = $(element).attr('src');
            const localPath = toLocalMetasoPath(src);
            if (localPath !== src) {
                $(element).attr('src', localPath);
                preloadResources.push({ href: localPath, as: 'image', priority: 'low' });
                replacedCount++;
            }
        });

        // 检查现有的preload链接，避免重复
        const existingPreloads = new Set();
        $('link[rel="preload"]').each((index, element) => {
            const href = $(element).attr('href');
            const localPath = toLocalMetasoPath(href);
            if (localPath !== href) {
                $(element).attr('href', localPath);
                existingPreloads.add(localPath);
                replacedCount++;
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

// 创建代理中间件，目标为 https://metaso.cn
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

        // 只对 HTML 响应做 processHtmlResponse，其他类型直接返回原始内容
        if (contentType.includes('text/html')) {
            try {
                let html = proxyResData.toString('utf8').replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
                html = processHtmlResponse(html, userReq.path);
                return html;
            } catch (e) {
                console.error('HTML处理错误:', e);
                return proxyResData;
            }
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
            // 只做静态资源路径替换
            let body = proxyResData.toString('utf8');
            body = body.replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
            return body;
        }
        // 其他类型直接返回原始内容（Buffer）
        return proxyResData;
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

              
            return proxyReqOpts;
        }     
          
        // 对其他请求，保持默认请求头
        return proxyReqOpts;
    }
}));
// 启动服务器
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
    }
});

app.on('error', (err) => {
    logger.error('服务器错误:', err);
});


module.exports = app;
