const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 10101; // 改回原来的端口

// UID和SID生成函数
function generateUID() {
    // 生成类似MongoDB ObjectId的24字符十六进制字符串
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return timestamp + randomBytes;
}

function generateSID() {
    // 生成32字符的十六进制会话ID
    return crypto.randomBytes(16).toString('hex');
}

// 生成全局UID和SID（服务器启动时生成一次）
const GLOBAL_UID = generateUID();
const GLOBAL_SID = generateSID();

console.log('🔐 Generated authentication credentials:');
console.log('UID:', GLOBAL_UID);
console.log('SID:', GLOBAL_SID);

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

// 支持根目录的HTML文件访问
app.get('/*.html', (req, res, next) => {
    const fileName = req.path.substring(1); // 移除开头的 /
    const filePath = path.join(__dirname, fileName);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // 文件不存在，继续到代理
            return next();
        }
        
        // 文件存在，直接返回
        res.sendFile(filePath);
    });
});

// 简化的自动搜索路由
app.get('/autosearch', (req, res) => {
    const query = req.query.q;
    
    logger.info('=== 简化自动搜索请求 ===');
    logger.info(`查询词: ${query}`);
    
    if (!query) {
        logger.warn('缺少查询参数q');
        return res.status(400).json({ 
            error: '缺少查询参数q', 
            usage: '/autosearch?q=查询词'
        });
    }
    
    // 简单检查是否包含搜索意图关键词
    const searchIntentKeywords = [
        // 基础查询词
        '是什么', '如何', '怎么', '什么是', '为什么', '怎样',
        '什么叫', '哪里', '何时', '谁是', '多少', '几',
        
        // 搜索相关词汇
        '搜索', '查找', '查询', '寻找', '检索', '找', '搜',
        
        // 特定主题词汇
        '人工智能', 'AI', '机器学习', '深度学习', '神经网络',
        '科技', '技术', '互联网', '计算机', '编程', '代码',
        '历史', '文化', '教育', '科学', '医学', '经济',
        '政治', '社会', '环境', '地理', '数学', '物理',
        '化学', '生物', '天文', '心理学', '哲学', '艺术',
        '文学', '音乐', '电影', '体育', '旅游', '美食',
        '健康', '养生', '金融', '投资', '创业', '管理',
        
        // 疑问词
        '？', '?', '吗', '呢', '嘛'
    ];
    
    const hasSearchIntent = searchIntentKeywords.some(keyword => 
        query.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (!hasSearchIntent) {
        logger.info(`查询词 "${query}" 不包含搜索意图，返回主页`);
        return res.redirect('/');
    }
    
    // 有搜索意图，重定向到搜索页面
    const searchId = crypto.randomBytes(12).toString('hex');
    const searchUrl = `/search/${searchId}?q=${encodeURIComponent(query)}`;
    
    logger.info(`检测到搜索意图，重定向到: ${searchUrl}`);
    res.redirect(searchUrl);
});

// 处理HTML响应的函数
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
        $('head').prepend(earlyHideStyle);
        
        const earlyAuthScript = `
<script>
(function(){
    try {
        localStorage.setItem('uid', '${GLOBAL_UID}');
        localStorage.setItem('sid', '${GLOBAL_SID}');
        localStorage.setItem('token', 'mk-4A9944E6F3917711EFCF7B772BC3A5AE');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', Date.now().toString());
        document.cookie = 'uid=${GLOBAL_UID}; path=/; domain=localhost; SameSite=Lax';
        document.cookie = 'sid=${GLOBAL_SID}; path=/; domain=localhost; SameSite=Lax';
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
        $('head').prepend(earlyAuthScript);
        
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
        // 客户端兜底隐藏和删除广告、隐藏"没有广告，直达结果"
        (function(){
            // 隐藏"没有广告，直达结果"
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
        
        return $.html();
    } catch (error) {
        logger.error('HTML处理错误:', error);
        return html;
    }
}

// 主页路由 - 代理到metaso.cn
app.use('/', proxy('https://metaso.cn', {
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        // 移除阻止iframe的头部
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        return headers;
    },
    
    userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
        const contentType = proxyRes.headers['content-type'] || '';
        console.log('\n=== 处理响应数据 ===');
        console.log('请求路径:', userReq.path);
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
                // JSON响应：注入token字段并替换静态资源URL
                let json = proxyResData.toString('utf8').replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
                try {
                    let obj = JSON.parse(json);
                    obj.token = 'mk-4A9944E6F3917711EFCF7B772BC3A5AE';
                    return JSON.stringify(obj);
                } catch(e) {
                    return json;
                }
            } else if (contentType.includes('text') || contentType.includes('javascript') || contentType.includes('css') || contentType.includes('xml')) {
                // 对所有文本类型响应都做URL替换
                body = proxyResData.toString('utf8');
                body = body.replace(/https?:\/\/static-1\.metaso\.cn\//g, '/static/');
            }
        } catch (e) {
            console.error('URL替换错误:', e);
        }
        
        return body;
    }
}));

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`=== metaso.cn 简化代理服务器已启动 ===`);
    logger.info(`监听端口: ${PORT}`);
    logger.info(`访问地址: http://localhost:${PORT}`);
    logger.info(`自动搜索: http://localhost:${PORT}/autosearch?q=人工智能`);
    logger.info(`======================================`);
});

module.exports = app;
