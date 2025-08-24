// 加载环境变量 (如果 .env 文件存在)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv 不是必需的，如果没有安装就跳过
    console.log('dotenv not found, using environment variables or defaults');
}

const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10101;
const HOST = process.env.HOST || 'localhost';
const PROTOCOL = process.env.PROTOCOL || 'http';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'mk-4A9944E6F3917711EFCF7B772BC3A5AE';

// 动态构建代理服务器URL - 智能处理标准端口
function buildProxyServerUrl() {
    const isStandardPort = 
        (PROTOCOL === 'http' && PORT == 80) ||
        (PROTOCOL === 'https' && PORT == 443);
    
    if (isStandardPort) {
        return `${PROTOCOL}://${HOST}`;
    } else {
        return `${PROTOCOL}://${HOST}:${PORT}`;
    }
}

const PROXY_SERVER_URL = buildProxyServerUrl();

function generateSID() {
    // 生成32字符的十六进制会话ID
    return crypto.randomBytes(16).toString('hex');
}
// 生成全局UID和SID（服务器启动时生成一次）
const GLOBAL_UID = '68775c6659a307e8ac864bf6';
const GLOBAL_SID = generateSID();

console.log('🔐 Generated authentication credentials:');
console.log('UID:', GLOBAL_UID);
console.log('SID:', GLOBAL_SID);

// 环境配置
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// 服务器配置 - 支持环境变量
// PORT: 服务器端口 (默认: 10101)
// HOST: 服务器主机名 (默认: localhost, 生产环境建议使用域名)
// PROTOCOL: 协议类型 (默认: http, 生产环境建议使用 https)
// 
// 使用示例:
// 开发环境: PORT=10101 HOST=localhost PROTOCOL=http npm start
// 生产环境: PORT=443 HOST=yourdomain.com PROTOCOL=https npm start

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
    
    // 检查文件是否存在
    if (fs.existsSync(filePath)) {
        logger.info(`Serving root HTML file: ${fileName}`);
        res.sendFile(filePath);
    } else {
        logger.warn(`Root HTML file not found: ${fileName}`);
        next(); // 继续到下一个中间件
    }
});


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
    if (filePath.startsWith('/metaso_files/')) {
        const filename = filePath.replace('/metaso_files/', '');
        
        // Handle different file patterns
        if (filename.startsWith('usermaven/')) {
            originalUrl = `https://static-1.metaso.cn/${filename}`;
        } else if (filename.includes('.png') || filename.includes('.jpg') || filename.includes('.jpeg')) {
            // Media files
            originalUrl = `https://static-1.metaso.cn/_next/static/media/${filename}`;
        } else if (filename.startsWith('layout-') || filename.startsWith('page-')) {
            // Layout and page files - try multiple possible paths
            const possiblePaths = [
                `https://static-1.metaso.cn/_next/static/chunks/app/${filename}`,
                `https://static-1.metaso.cn/_next/static/chunks/app/(pages)/(menu-attached)/(home)/@desktop/${filename}`,
                `https://static-1.metaso.cn/_next/static/chunks/app/(pages)/(menu-attached)/(home)/@h5/${filename}`,
                `https://static-1.metaso.cn/_next/static/chunks/${filename}`
            ];
            originalUrl = possiblePaths[0]; // 尝试第一个，如果失败会尝试其他的
        } else if (filename.includes('-') && filename.endsWith('.js')) {
            // Chunk files with hashes
            originalUrl = `https://static-1.metaso.cn/_next/static/chunks/${filename}`;
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
            console.log(`Failed to fetch ${originalUrl}:`, err.message);
            res.status(404).send('File not found');
        });
    } else {
        res.status(404).send('File not found');
    }
});

// HTML处理函数
function processHtmlResponse(html, requestPath) {
    try {
        let $ = cheerio.load(html);
        
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
        $('head').prepend('<meta name="authorization" content="Bearer ' + AUTH_TOKEN + '">');
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
        
        // 超级React安全的授权脚本 - 零DOM干扰策略
        const universalAuthScript = `
            <script>
                // 环境检测
                const isProduction = ${IS_PRODUCTION};
                const logPrefix = isProduction ? '[PROD]' : '[DEV]';
                
                function authLog(...args) {
                    if (!isProduction) {
                      // console.log(logPrefix, '=== 超级React安全授权脚本 (页面: ${requestPath}) ===', ...args);
                    }
                }
                
                authLog('脚本开始执行 - 零DOM干扰模式');
                
                // React Hooks 安全性保护
                // 确保React hooks在任何情况下都能正确调用
                if (typeof window !== 'undefined') {
                    // 特殊处理React错误 #418 和 #423
                    const originalError = window.Error;
                    window.Error = function(...args) {
                        const error = new originalError(...args);
                        // 拦截特定的React hydration错误
                        if (error.message && 
                            (error.message.includes('Minified React error #418') || 
                             error.message.includes('Minified React error #423') ||
                             error.message.includes('Request aborted') ||
                             error.name === 'AxiosError')) {
                            authLog('拦截React/Axios错误:', error.message);
                            // 返回一个无害的错误对象
                            const safeError = new originalError('React/Axios error intercepted and handled');
                            safeError.name = 'HandledReactError';
                            return safeError;
                        }
                        return error;
                    };
                    
                    // 全局错误处理器 - 特别处理React和Axios错误
                    window.addEventListener('error', function(event) {
                        if (event.error && event.error.message) {
                            const message = event.error.message;
                            
                            // 拦截React hydration错误 #418/#423 和 Axios错误
                            if (message.includes('Minified React error #418') || 
                                message.includes('Minified React error #423') ||
                                message.includes('Request aborted') ||
                                message.includes('ECONNABORTED') ||
                                event.error.name === 'AxiosError') {
                                authLog('全局拦截React/Axios错误:', message);
                                event.preventDefault();
                                event.stopPropagation();
                                return false;
                            }
                            
                            // 处理hooks错误
                            if (message.includes('Hooks can only be called') || 
                                message.includes('Invalid hook call')) {
                                authLog('检测到React hooks错误，确保条件调用安全性');
                                event.preventDefault();
                                return false;
                            }
                        }
                    }, true); // 使用capture phase
                    
                    // 拦截未处理的Promise rejection
                    window.addEventListener('unhandledrejection', function(event) {
                        if (event.reason && event.reason.message) {
                            const message = event.reason.message;
                            if (message.includes('Minified React error #418') || 
                                message.includes('Minified React error #423') ||
                                message.includes('Request aborted') ||
                                message.includes('ECONNABORTED') ||
                                (event.reason.name && event.reason.name === 'AxiosError')) {
                                authLog('拦截未处理的React/Axios Promise错误:', message);
                                event.preventDefault();
                                return false;
                            }
                        }
                    });
                    
                    // 防止React hooks被意外阻断
                    const originalAddEventListener = window.addEventListener;
                    window.addEventListener = function(type, listener, options) {
                        try {
                            return originalAddEventListener.call(this, type, listener, options);
                        } catch (e) {
                            authLog('addEventListener错误（已处理）:', e.message);
                            return;
                        }
                    };
                }
                
                // 设置正确的UID和SID - 这些操作不会影响React DOM
                const uid = '` + GLOBAL_UID + `';
                const sid = '` + GLOBAL_SID + `';
                const authToken = '` + AUTH_TOKEN + `';
                
                // 立即设置授权信息 - 在React渲染之前完成
                try {
                    localStorage.setItem('uid', uid);
                    localStorage.setItem('sid', sid);
                    localStorage.setItem('token', authToken);
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('loginTime', Date.now().toString());
                    
                    // 设置cookies
                    document.cookie = 'uid=' + uid + '; path=/; domain=` + HOST + `; SameSite=Lax';
                    document.cookie = 'sid=' + sid + '; path=/; domain=` + HOST + `; SameSite=Lax';
                    document.cookie = 'isLoggedIn=true; path=/; domain=` + HOST + `; SameSite=Lax';
                    document.cookie = 'token=' + authToken + '; path=/; domain=` + HOST + `; SameSite=Lax';
                    
                    authLog('授权信息已设置');
                } catch (e) {
                    console.error(logPrefix, '设置授权信息失败:', e);
                }
                
                // API请求拦截 - 立即安装，确保所有请求都被拦截
                function setupInterceptors() {
                    try {
                        // 检查是否已经设置过拦截器
                        if (window.__authInterceptorsInstalled) {
                            authLog('拦截器已安装，跳过');
                            return;
                        }
                        
                        authLog('立即安装API拦截器...');
                        
                        // 资源加载缓存 - 防止重复请求
                        window.__resourceCache = window.__resourceCache || new Map();
                        
                        // 强制拦截所有fetch请求到metaso.cn
                        if (window.fetch && !window.__fetchIntercepted) {
                            const originalFetch = window.fetch;
                            window.fetch = function(url, options) {
                                // 拦截所有到metaso.cn的请求
                                if (typeof url === 'string' && url.includes('metaso.cn')) {
                                    let newUrl = url.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
                                    
                                    // === 新增：处理scope和kits参数 ===
                                    try {
                                        const urlObj = new URL(newUrl);
                                        const scope = sessionStorage.getItem('metaso_search_scope');
                                        const kits = sessionStorage.getItem('metaso_search_kits');
                                        
                                        if (scope && scope !== '全网') {
                                            urlObj.searchParams.set('scope', scope);
                                        }
                                        if (kits && kits !== '极速·思考') {
                                            urlObj.searchParams.set('kits', kits);
                                        }
                                        newUrl = urlObj.toString();
                                        authLog('拦截fetch请求 (含scope/kits):', url, '->', newUrl);
                                    } catch (e) {
                                        authLog('处理URL参数失败:', e);
                                        authLog('拦截fetch请求:', url, '->', newUrl);
                                    }
                                    
                            // 确保请求头包含必要的认证信息
                            const newOptions = {
                                ...options,
                                headers: {
                                    ...options?.headers,
                                    'Accept': 'application/json, text/plain, */*',
                                    'Content-Type': options?.headers?.['Content-Type'] || 'application/json',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    // 添加正确的认证相关头部
                                    'Authorization': 'Bearer ` + AUTH_TOKEN + `',
                                    'X-User-ID': '` + GLOBAL_UID + `',
                                    'X-Session-ID': '` + GLOBAL_SID + `'
                                },
                                credentials: 'include'
                            };                                    return originalFetch(newUrl, newOptions).catch(error => {
                                        authLog('Fetch请求失败:', error);
                                        throw error;
                                    });
                                }
                                return originalFetch(url, options);
                            };
                            window.__fetchIntercepted = true;
                            authLog('Fetch拦截器已安装');
                        }
                        
                        // 强制拦截所有XMLHttpRequest到metaso.cn
                        if (window.XMLHttpRequest && !window.__xhrIntercepted) {
                            const originalXHR = window.XMLHttpRequest;
                            function InterceptedXHR() {
                                const xhr = new originalXHR();
                                const originalOpen = xhr.open;
                                const originalSend = xhr.send;
                                
                                xhr.open = function(method, url, async, user, password) {
                                    // 拦截所有到metaso.cn的请求
                                    if (typeof url === 'string' && url.includes('metaso.cn')) {
                                        let newUrl = url.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
                                        
                                        // === 新增：处理scope和kits参数 ===
                                        try {
                                            const urlObj = new URL(newUrl);
                                            const scope = sessionStorage.getItem('metaso_search_scope');
                                            const kits = sessionStorage.getItem('metaso_search_kits');
                                            
                                            if (scope && scope !== '全网') {
                                                urlObj.searchParams.set('scope', scope);
                                            }
                                            if (kits && kits !== '极速·思考') {
                                                urlObj.searchParams.set('kits', kits);
                                            }
                                            newUrl = urlObj.toString();
                                            authLog('拦截XHR请求 (含scope/kits):', url, '->', newUrl);
                                        } catch (e) {
                                            authLog('处理XHR URL参数失败:', e);
                                            authLog('拦截XHR请求:', url, '->', newUrl);
                                        }
                                        
                                        // 设置认证头部
                                        xhr.setRequestHeader = function(name, value) {
                                            return originalXHR.prototype.setRequestHeader.call(this, name, value);
                                        };
                                        
                                        const result = originalOpen.call(this, method, newUrl, async !== false, user, password);
                                        
                        // 添加认证头部
                        try {
                            this.setRequestHeader('Authorization', 'Bearer ` + AUTH_TOKEN + `');
                            this.setRequestHeader('X-User-ID', '` + GLOBAL_UID + `');
                            this.setRequestHeader('X-Session-ID', '` + GLOBAL_SID + `');
                            this.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                        } catch (e) {
                            authLog('设置XHR头部失败:', e);
                        }                                        return result;
                                    }
                                    return originalOpen.call(this, method, url, async, user, password);
                                };
                                
                                xhr.send = function(data) {
                                    // 添加错误处理
                                    const originalOnError = xhr.onerror;
                                    xhr.onerror = function(e) {
                                        authLog('XHR错误:', e);
                                        if (originalOnError) originalOnError.call(this, e);
                                    };
                                    
                                    const originalOnLoad = xhr.onload;
                                    xhr.onload = function() {
                                        authLog('XHR成功:', this.status, this.responseURL);
                                        if (originalOnLoad) originalOnLoad.call(this);
                                    };
                                    
                                    return originalSend.call(this, data);
                                };
                                
                                return xhr;
                            }
                            
                            InterceptedXHR.prototype = originalXHR.prototype;
                            window.XMLHttpRequest = InterceptedXHR;
                            window.__xhrIntercepted = true;
                            authLog('XHR拦截器已安装');
                        }
                        
                        // 拦截Axios如果存在
                        if (window.axios && !window.__axiosIntercepted) {
                            // 请求拦截器
                            window.axios.interceptors.request.use(
                                function (config) {
                                    if (config.url && config.url.includes('metaso.cn')) {
                                        config.url = config.url.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
                                        config.headers = {
                                            ...config.headers,
                                            'Authorization': 'Bearer ` + AUTH_TOKEN + `',
                                            'X-User-ID': '` + GLOBAL_UID + `',
                                            'X-Session-ID': '` + GLOBAL_SID + `'
                                        };
                                        authLog('拦截Axios请求:', config.url);
                                    }
                                    return config;
                                },
                                function (error) {
                                    return Promise.reject(error);
                                }
                            );
                            
                            window.__axiosIntercepted = true;
                            authLog('Axios拦截器已安装');
                        }
                        
                        window.__authInterceptorsInstalled = true;
                        authLog('所有API拦截器安装完成');
                        
                        // === 新增：动态图片和资源URL替换 ===
                        // 拦截图片加载，替换metaso.cn的URL
                        function interceptImageLoading() {
                            // 替换现有图片的src属性
                            document.querySelectorAll('img[src*="metaso.cn"]').forEach(img => {
                                const originalSrc = img.src;
                                const newSrc = originalSrc.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
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
                                    const newBgImage = backgroundImage.replace(/https:\/\/metaso\.cn/g, '` + PROXY_SERVER_URL + `');
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
                                                    const newSrc = originalSrc.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
                                                    node.src = newSrc;
                                                    authLog('动态替换图片URL:', originalSrc, '->', newSrc);
                                                }
                                                
                                                // 检查子元素中的图片
                                                node.querySelectorAll?.('img[src*="metaso.cn"]')?.forEach(img => {
                                                    const originalSrc = img.src;
                                                    const newSrc = originalSrc.replace('https://metaso.cn', '` + PROXY_SERVER_URL + `');
                                                    img.src = newSrc;
                                                    authLog('动态替换子图片URL:', originalSrc, '->', newSrc);
                                                });
                                            }
                                        });
                                    });
                                });
                                
                                // 确保document.body存在再开始观察
                                if (document.body) {
                                    observer.observe(document.body, {
                                        childList: true,
                                        subtree: true
                                    });
                                } else {
                                    // 如果body还未加载，等待DOM完成后再观察
                                    document.addEventListener('DOMContentLoaded', function() {
                                        if (document.body) {
                                            observer.observe(document.body, {
                                                childList: true,
                                                subtree: true
                                            });
                                        }
                                    });
                                }
                                window.__imageObserverInstalled = true;
                                authLog('图片URL监听器已安装');
                            }
                        }
                        
                        // 立即执行图片URL替换
                        interceptImageLoading();
                        
                        // 延迟再次执行，确保动态加载的内容也被处理
                        setTimeout(interceptImageLoading, 2000);
                        setTimeout(interceptImageLoading, 5000);
                        
                    } catch (e) {
                        console.error(logPrefix, '安装拦截器失败:', e);
                    }
                }
                
                // 立即设置拦截器 - 在任何请求发生之前
                setupInterceptors();
                
                // React Hydration 安全延迟机制
                let reactHydrationComplete = false;
                
                // 检测React hydration完成的多重策略
                function waitForReactHydration() {
                    return new Promise((resolve) => {
                        let checkCount = 0;
                        const maxChecks = 10; // 增加到10秒
                        
                        function checkHydration() {
                            checkCount++;
                            authLog('React hydration检查 #' + checkCount);
                            
                            // 多重React环境检测
                            const hasReact = window.React || 
                                             window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || 
                                             document.querySelector('[data-reactroot]') ||
                                             document.querySelector('[data-react-class]') ||
                                             document.querySelector('._app') ||
                                             window.__NEXT_DATA__;
                            
                            if (hasReact) {
                                authLog('检测到React环境，类型:', {
                                    React: !!window.React,
                                    DevTools: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
                                    ReactRoot: !!document.querySelector('[data-reactroot]'),
                                    NextData: !!window.__NEXT_DATA__
                                });
                                
                                // React环境下，等待DOM稳定
                                const stabilityWait = Math.max(5000 - (checkCount * 100), 2000);
                                authLog('React环境下等待DOM稳定，延迟:', stabilityWait + 'ms');
                                
                                setTimeout(() => {
                                    // 最终检查 - 确保没有正在进行的React操作
                                    const hasReactActivity = document.querySelector('[data-reactroot] *[data-react-pending]') ||
                                                             document.querySelector('[data-react-loading]');
                                    
                                    if (!hasReactActivity) {
                                        authLog('React hydration安全检查通过');
                                        reactHydrationComplete = true;
                                        resolve();
                                    } else {
                                        authLog('检测到React活动，继续等待...');
                                        setTimeout(checkHydration, 200);
                                    }
                                }, stabilityWait);
                                return;
                            }
                            
                            // 如果检查次数超过限制，继续执行
                            if (checkCount >= maxChecks) {
                                authLog('未检测到React环境或检查超时，继续执行');
                                reactHydrationComplete = true;
                                resolve();
                                return;
                            }
                            
                            // 继续检查
                            setTimeout(checkHydration, 100);
                        }
                        
                        checkHydration();
                    });
                }
                
                // 也在DOM ready时再次尝试安装（防止被覆盖）
                document.addEventListener('DOMContentLoaded', function() {
                    if (!window.__authInterceptorsInstalled) {
                        authLog('DOMContentLoaded时重新安装拦截器...');
                        setupInterceptors();
                    }
                    
                    // 开始等待React hydration
                    waitForReactHydration().then(() => {
                        authLog('React hydration检查完成，可以安全执行DOM操作');
                    });
                });
                
                // 在window load时也确保拦截器存在
                window.addEventListener('load', function() {
                    if (!window.__authInterceptorsInstalled) {
                        authLog('Window load时重新安装拦截器...');
                        setupInterceptors();
                    }
                    
                    // 确保React hydration完成
                    if (!reactHydrationComplete) {
                        waitForReactHydration().then(() => {
                            authLog('Window load后React hydration确认完成');
                        });
                    }
                });
                
                // 资源优化 - 禁用DOM操作，避免React hydration冲突
                // 注意：移除了所有DOM元素删除操作，因为它们会导致React hydration错误 #418/#423
                function optimizeResourcesAfterLoad() {
                    authLog('资源优化（仅监控模式，无DOM操作）...');
                    try {
                        // 仅监控重复资源，不进行删除操作
                        const preloadLinks = document.querySelectorAll('link[rel="preload"]');
                        const seenResources = new Set();
                        let duplicatePreloads = 0;
                        
                        preloadLinks.forEach(link => {
                            const href = link.getAttribute('href');
                            if (seenResources.has(href)) {
                                duplicatePreloads++;
                                authLog('检测到重复preload（不删除）:', href);
                            } else {
                                seenResources.add(href);
                            }
                        });
                        
                        // 仅监控重复的CSS链接，不删除
                        const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
                        const seenCSS = new Set();
                        let duplicateCSS = 0;
                        
                        cssLinks.forEach(link => {
                            const href = link.getAttribute('href');
                            if (seenCSS.has(href)) {
                                duplicateCSS++;
                                authLog('检测到重复CSS（不删除）:', href);
                            } else {
                                seenCSS.add(href);
                            }
                        });
                        
                        // 仅监控重复的script标签，不删除
                        const scripts = document.querySelectorAll('script[src]');
                        const seenScripts = new Set();
                        let duplicateScripts = 0;
                        
                        scripts.forEach(script => {
                            const src = script.getAttribute('src');
                            if (seenScripts.has(src)) {
                                duplicateScripts++;
                                authLog('检测到重复script（不删除）:', src);
                            } else {
                                seenScripts.add(src);
                            }
                        });
                        
                        authLog('资源监控完成 - 重复项: preload(' + duplicatePreloads + '), css(' + duplicateCSS + '), script(' + duplicateScripts + ')');
                    } catch (e) {
                        authLog('资源监控失败:', e);
                    }
                }
                
                // 在页面完全加载后执行资源监控，确保React hydration完全稳定
                window.addEventListener('load', function() {
                    // 等待React hydration完成后再执行资源监控
                    const executeResourceOptimization = () => {
                        if (reactHydrationComplete) {
                            setTimeout(optimizeResourcesAfterLoad, 1000); // React稳定后再等3秒
                        } else {
                            // 如果React还未完成hydration，继续等待
                            setTimeout(executeResourceOptimization, 1000);
                        }
                    };
                    
                    executeResourceOptimization();
                });
                
                // iframe处理
                if (window.self !== window.top) {
                    authLog('iframe环境检测');
                    try {
                        window.addEventListener('beforeunload', function(e) {
                            e.preventDefault();
                            return null;
                        }, { passive: false });
                    } catch (e) {
                        authLog('iframe处理失败:', e);
                    }
                }
                
                // 完全移除DOM操作，避免React hydration冲突
                // WeChat元素隐藏改为通过CSS预处理完成，不在客户端处理
                
                authLog('脚本初始化完成 - 零DOM干扰模式');
            </script>
        `;
        $('head').append(universalAuthScript);
        logger.info(`已为页面 ${requestPath} 注入通用授权脚本`);
        
        // 修改文字"没有广告，直达结果"为"本地搜索"后隐藏
        $('[class*="SearchHome_sub-title__4foku MuiBox-root css-0"]').each(function() {
            const el = $(this);
            el.contents().filter(function() {
                return this.type === 'text' && this.data && this.data.includes('没有广告，直达结果');
            }).each(function() {
                // 替换为"本地搜索"
                const newText = this.data.replace('没有广告，直达结果', '本地搜索');
                const hidden = $('<span style="display:none !important"></span>').text(newText);
                $(this).replaceWith(hidden);
            });
        });

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
        localStorage.setItem('uid', '${GLOBAL_UID}');
        localStorage.setItem('sid', '${GLOBAL_SID}');
        localStorage.setItem('token', '${AUTH_TOKEN}');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', Date.now().toString());
        document.cookie = 'uid=${GLOBAL_UID}; path=/; domain=${HOST}; SameSite=Lax';
        document.cookie = 'sid=${GLOBAL_SID}; path=/; domain=${HOST}; SameSite=Lax';
        document.cookie = 'isLoggedIn=true; path=/; domain=${HOST}; SameSite=Lax';
        document.cookie = 'token=${AUTH_TOKEN}; path=/; domain=${HOST}; SameSite=Lax';
    } catch(e) {}
    // 劫持fetch和XMLHttpRequest，强制带Authorization
    const AUTH_TOKEN = 'Bearer ${AUTH_TOKEN}';
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
        [class*="menu" i][class*="left" i], [class*="panel" i][class*="side" i],
        .wechat-login-container, #wechat-login, [class*="wechat"], [id*="wechat"],
        img[src*="qrcode"], [class*="qrcode"], [id*="qrcode"]
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
            // 删除微信登录相关元素
            function removeWeChatElements() {
                var wechatElements = document.querySelectorAll('.wechat-login-container, #wechat-login, [class*="wechat"], [id*="wechat"], img[src*="qrcode"], [class*="qrcode"], [id*="qrcode"]');
                wechatElements.forEach(function(el) {
                    el.remove();
                });
            }
            function runAndSchedule() {
                hideTextInSearchHomeSub();
                removeAdDivs();
                removeWeChatElements();
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
                removeWeChatElements();
            });
            // 确保document.body存在再开始观察
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                // 如果body还未加载，等待DOM完成后再观察
                document.addEventListener('DOMContentLoaded', function() {
                    if (document.body) {
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                });
            }
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
            
            // 匹配 static-1.metaso.cn 的资源
            if (url.includes('static-1.metaso.cn/_next/static/')) {
                // CSS文件格式: 44be927df5c0115a.css (16位哈希)
                let match = url.match(/\/([a-f0-9]{16}\.css)$/);
                if (match) return match[1];
                
                // JS文件格式: 23362-2bb0da0da92b2600.js (数字-16位哈希)
                match = url.match(/\/(\d+-[a-f0-9]{16}\.js)$/);
                if (match) return match[1];
                
                // 其他JS文件格式: main-app-20a8b302c38c77ce.js
                match = url.match(/([a-z\-]+-[a-f0-9]{16}\.js)$/);
                if (match) return match[1];
                
                // Media files: app-qrcode.f8820aee.png
                match = url.match(/\/media\/(.+)$/);
                if (match) return match[1];
            }
            
            // 匹配 static-1.metaso.cn 的usermaven等其他资源
            if (url.includes('static-1.metaso.cn/usermaven/')) {
                return url.split('static-1.metaso.cn/')[1]; // 返回 usermaven/lib.js
            }
            
            // 也匹配其他 static-1.metaso.cn 资源
            if (url.includes('static-1.metaso.cn/static/')) {
                const match = url.match(/\/static\/(.+)$/);
                if (match) {
                    // 对于 static/ 目录下的文件，保持原始路径结构
                    return match[1];
                }
            }
            return null;
        }
        
        // 辅助函数：处理资源并收集预加载信息
        function processResource(originalUrl, filename, resourceType, priority = 'medium') {
            if (!filename || processedResources.has(filename)) {
                return null; // 防止重复处理
            }
            
            const localPath = '/static/metaso_files/' + filename;
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
        
        
        // 处理所有指向https://metaso.cn的资源URL，智能替换为代理服务器地址
        function replaceMetasoUrls(html) {
            // 定义需要代理转发的动态API路径（不进行本地化）
            const dynamicApiPaths = [
                '/api/',           // 所有API请求
                '/upload/',        // 上传相关
                '/download/',      // 下载相关
                '/stream/',        // 流媒体相关
                '/socket.io/',     // WebSocket相关
                '/auth/',          // 认证相关
                '/oauth/',         // OAuth相关
                '/callback/',      // 回调相关
                '/webhook/',       // Webhook相关
                '/proxy/',         // 代理相关
                '/admin/',         // 管理相关
                '/dashboard/',     // 仪表板相关
                '/health/',        // 健康检查
                '/metrics/',       // 监控指标
                '/status/'         // 状态相关
            ];
            
            // 替换HTML中所有的metaso.cn URL为代理服务器URL
            return html.replace(/https:\/\/metaso\.cn(\/[^"'\s>]*)/g, (match, path) => {
                // 检查是否为动态API路径
                const isDynamicApi = dynamicApiPaths.some(apiPath => path.startsWith(apiPath));
                
                let newUrl;
                if (isDynamicApi) {
                    // 动态API请求：保持通过代理服务器转发
                    newUrl = `${PROXY_SERVER_URL}${path}`;
                    logger.debug(`动态API URL替换: ${match} -> ${newUrl}`);
                } else {
                    // 静态资源：尝试本地化，如果不存在则回退到代理
                    const filename = extractFilename(path);
                    if (filename && isStaticResource(path)) {
                        // 尝试本地静态资源路径
                        const localPath = `/static/metaso_files/${filename}`;
                        newUrl = `${PROXY_SERVER_URL}${localPath}`;
                        logger.debug(`静态资源URL替换: ${match} -> ${newUrl}`);
                    } else {
                        // 其他资源通过代理转发
                        newUrl = `${PROXY_SERVER_URL}${path}`;
                        logger.debug(`通用URL替换: ${match} -> ${newUrl}`);
                    }
                }
                
                return newUrl;
            });
        }
        
        // 辅助函数：判断是否为静态资源
        function isStaticResource(path) {
            const staticExtensions = [
                '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
                '.woff', '.woff2', '.ttf', '.eot', '.otf',
                '.mp4', '.webm', '.ogg', '.mp3', '.wav',
                '.pdf', '.txt', '.xml', '.json'
            ];
            
            const lowerPath = path.toLowerCase();
            return staticExtensions.some(ext => lowerPath.includes(ext)) ||
                   lowerPath.includes('/_next/static/') ||
                   lowerPath.includes('/static/') ||
                   lowerPath.includes('/assets/') ||
                   lowerPath.includes('/images/') ||
                   lowerPath.includes('/fonts/') ||
                   lowerPath.includes('/css/') ||
                   lowerPath.includes('/js/');
        }
        
        // 应用通用URL替换
        const htmlString = $.html();
        const replacedHtml = replaceMetasoUrls(htmlString);
        if (replacedHtml !== htmlString) {
            $ = cheerio.load(replacedHtml);
            logger.info('已应用通用metaso.cn URL替换');
        }
        
        // 检查现有的preload链接，避免重复
        const existingPreloads = new Set();
        $('link[rel="preload"]').each((index, element) => {
            const href = $(element).attr('href');
            const filename = extractFilename(href);
            if (filename) {
                const localPath = '/static/metaso_files/' + filename;
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
        
        // 添加React安全的iframe兼容性脚本
        const iframeScript = `
            <script>
                // React安全的iframe兼容性脚本
                (function() {
                    console.log('=== React安全iframe兼容性脚本 ===');
                    
                    // 延迟执行，避免干扰React初始化
                    function safeIframeInit() {
                        try {
                            // 抑制Source Map错误 - 不影响React
                            const originalConsoleError = console.error;
                            console.error = function(...args) {
                                const message = args.join(' ');
                                // 跳过Source Map相关错误
                                if (message.includes('Source map error') || 
                                    message.includes('sourceMappingURL') ||
                                    message.includes('.map')) {
                                    return; // 不显示这些错误
                                }
                                // 调用原始console.error，不需要return
                                originalConsoleError.apply(console, args);
                            };
                            
                            
                            // 确保页面在iframe中正常工作 - 仅在需要时执行
                            if (window.top !== window.self) {
                                console.log('页面在iframe中运行，启用兼容性处理');
                                
                                // 延迟处理，避免与React冲突
                                setTimeout(() => {
                                    try {
                                        // 尝试阻止可能的framebusting代码
                                        Object.defineProperty(window.top, 'location', {
                                            get: function() { return window.location; },
                                            set: function(val) { window.location = val; }
                                        });
                                        console.log('已设置location劫持');
                                    } catch(e) {
                                        console.log('location劫持失败:', e.message);
                                    }
                                    
                                    // 重写可能的反iframe代码
                                    window.top = window.self;
                                    window.parent = window.self;
                                }, 1000); // 延迟1秒，确保React已经初始化
                            }
                            
                            // 重写window.open为当前窗口导航
                            const originalOpen = window.open;
                            window.open = function(url, name, features) {
                                console.log('拦截window.open调用:', url);
                                if (url) {
                                    window.location.href = url;
                                }
                                return window;
                            };
                            
                            console.log('React安全iframe兼容性脚本初始化完成');
                            
                        } catch (e) {
                            console.log('iframe兼容性脚本执行失败:', e);
                        }
                    }
                    
                    // 启动iframe兼容性脚本
                    safeIframeInit();
                })();
            </script>
        `;
        $('head').append(iframeScript);
        console.log('已注入iframe兼容性脚本');
        
        // === 新增：通用scope参数设置脚本 ===
        // 这个脚本在所有页面都会执行，确保scope参数被正确设置
        const scopeSetupScript = `
            <script>
                // 通用scope和kits参数设置脚本
                (function() {
                    'use strict';
                    
                    // 获取URL参数 - 增强调试信息
                    console.log('🔧 [ParameterSetup] 当前URL:', window.location.href);
                    console.log('🔧 [ParameterSetup] 搜索参数:', window.location.search);
                    
                    // === 优先从cookie获取参数，然后使用URL参数 ===
                    function getCookieValue(name) {
                        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
                        return match ? decodeURIComponent(match[2]) : null;
                    }
                    
                    const urlParams = new URLSearchParams(window.location.search);
                    
                    // === 检查是否需要清除cookie参数 ===
                    const isHomePage = (window.location.pathname === '/' || window.location.pathname === '');
                    const hasNoParams = !window.location.search || window.location.search === '';
                    
                    if (isHomePage && hasNoParams) {
                        // 清除之前保存的scope和kits cookie
                        document.cookie = 'metaso_search_scope=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                        document.cookie = 'metaso_search_kits=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                        console.log('🧹 [ParameterSetup] 已清除cookie参数（根路径无参数访问）');
                        return; // 根路径无参数时直接返回，不进行任何参数设置
                    }
                    
                    // 获取参数值
                    const urlScope = urlParams.get('scope');
                    const urlKits = urlParams.get('kits');
                    const cookieScope = getCookieValue('metaso_search_scope');
                    const cookieKits = getCookieValue('metaso_search_kits');
                    
                    // 只有在有scope相关参数时才进行ScopeSetup
                    if (urlScope || cookieScope) {
                        console.log('🔧 [ScopeSetup] 开始设置scope参数');
                        
                        const scope = urlScope || cookieScope;
                        console.log('🔧 [ScopeSetup] URL scope:', urlScope);
                        console.log('🔧 [ScopeSetup] Cookie scope:', cookieScope);
                        console.log('🔧 [ScopeSetup] 最终scope:', scope);
                        
                        // 保存目标参数供客户端自动搜索脚本使用
                        if (scope) {
                            sessionStorage.setItem('metaso_search_scope_target', scope);
                            console.log('🎯 [ScopeSetup] 已保存目标scope参数:', scope);
                        }
                        
                        // 设置scope参数
                        if (scope && scope !== '全网') {
                            sessionStorage.setItem('metaso_search_scope', scope);
                            document.cookie = 'metaso_search_scope=' + encodeURIComponent(scope) + '; path=/; SameSite=Lax';
                            console.log('💾 [ScopeSetup] 已保存scope参数:', scope);
                        } else if (scope === '全网') {
                            // 明确设置为全网时，清除之前的设置
                            sessionStorage.removeItem('metaso_search_scope');
                            document.cookie = 'metaso_search_scope=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            console.log('🗑️ [ScopeSetup] 已清除scope参数（设置为全网）');
                        }
                        
                        console.log('✅ [ScopeSetup] scope参数设置完成');
                    } else {
                        console.log('⏭️ [ScopeSetup] 跳过scope参数设置（无相关参数）');
                    }
                    
                    // 只有在有kits相关参数时才进行kitsSetup
                    if (urlKits || cookieKits) {
                        console.log('🔧 [kitsSetup] 开始设置kits参数');
                        
                        const kits = urlKits || cookieKits;
                        console.log('🔧 [kitsSetup] URL kits:', urlKits);
                        console.log('🔧 [kitsSetup] Cookie kits:', cookieKits);
                        console.log('🔧 [kitsSetup] 最终kits:', kits);
                        
                        // 保存目标参数供客户端自动搜索脚本使用
                        if (kits) {
                            sessionStorage.setItem('metaso_search_kits_target', kits);
                            console.log('🎯 [kitsSetup] 已保存目标kits参数:', kits);
                        }
                        
                        // 设置kits参数
                        if (kits && kits !== '极速·思考') {
                            sessionStorage.setItem('metaso_search_kits', kits);
                            document.cookie = 'metaso_search_kits=' + encodeURIComponent(kits) + '; path=/; SameSite=Lax';
                            console.log('💾 [kitsSetup] 已保存kits参数:', kits);
                        } else if (kits === '极速·思考') {
                            // 明确设置为默认值时，清除之前的设置
                            sessionStorage.removeItem('metaso_search_kits');
                            document.cookie = 'metaso_search_kits=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            console.log('🗑️ [kitsSetup] 已清除kits参数（设置为默认值）');
                        }
                        
                        console.log('✅ [kitsSetup] kits参数设置完成');
                    } else {
                        console.log('⏭️ [kitsSetup] 跳过kits参数设置（无相关参数）');
                    }
                })();
            </script>
        `;
        $('head').append(scopeSetupScript);
        console.log('已注入通用参数设置脚本（scope和kits）');
        
        // 精确自动搜索脚本 v3.0 - 基于真实用户行为流程
        const autoSearchScript = `
            <script>
                // 精确自动搜索脚本 v3.0
                (function() {
                    'use strict';
                    
                    const SCRIPT_VERSION = '3.0';
                    const DEBUG_PREFIX = '🎯 [PreciseAutoSearch-v' + SCRIPT_VERSION + ']';
                    

                    
                    // 全局配置
                    const CONFIG = {
                        maxWaitTime: 10000,           // 最大等待时间 10秒
                        retryInterval: 500,           // 重试间隔 500ms
                        inputDelay: 100,              // 每个字符输入间隔
                        actionDelay: 800,             // 动作间隔
                        debugMode: true               // 调试模式
                    };
                    
                    // 日志函数
                    function log(message, data = null) {
                        if (CONFIG.debugMode) {
                            console.log(DEBUG_PREFIX + ' ' + message, data || '');
                        }
                    }
                    
                    function error(message, err = null) {
                        console.error(DEBUG_PREFIX + ' ❌ ' + message, err || '');
                    }
                    
                    // 获取搜索查询参数（包括自动搜索参数）
                    function getSearchQuery() {
                        const urlParams = new URLSearchParams(window.location.search);
                        const qParam = urlParams.get('q');
                        
                        if (qParam) {
                            log('从URL参数获取查询:', qParam);
                            return qParam;
                        }
                        
                        // 默认返回 'AI'
                        log('使用默认查询: AI');
                        return 'AI';
                        
                    }
                    
                    // 检查是否应该执行自动搜索（包括后台搜索）
                    function shouldExecuteAutoSearch() {
                        const urlParams = new URLSearchParams(window.location.search);
                        const hasQParam = urlParams.get('q');
                        
                        // 如果有q参数，允许执行
                        if (hasQParam) {
                            log('检测到搜索参数，允许执行自动搜索', { hasQParam });
                            return true;
                        }
                        
                        // 检查是否已执行过
                        if (sessionStorage.getItem('preciseAutoSearchExecuted_v3')) {
                            log('跳过: 已执行过自动搜索');
                            return false;
                        }
                        
                        const path = window.location.pathname;
                        const search = window.location.search;
                        
                        // === 新增：明确排除subject页面和其他特殊页面 ===
                        if (path.startsWith('/subject/')) {
                            log('跳过: subject页面不执行自动搜索', { path });
                            return false;
                        }
                        
                        if (path.startsWith('/admin/') || path.startsWith('/api/') || path.startsWith('/dashboard/')) {
                            log('跳过: 管理页面或API页面不执行自动搜索', { path });
                            return false;
                        }
                        
                        // === 新增：明确排除根路径首页的自动搜索 ===
                        // 只有在明确有搜索意图（q参数）时才执行自动搜索
                        const isHomePage = (path === '/' || path === '');
                        if (isHomePage && !hasQParam) {
                            log('跳过: 根路径首页无搜索参数，不执行自动搜索', { path, hasQParam });
                            return false;
                        }
                        
                        const isSearchPage = path.includes('/search/');
                        
                        // 只有真实的URL查询参数才算有搜索查询，不使用默认值
                        const hasSearchQuery = hasQParam !== null;
                        
                        // 不在结果页面（避免在结果页面重复执行）
                        const notInResults = !search.includes('q=') || search.includes('/search/id');
                        
                        const shouldExecute = (isHomePage || isSearchPage) && hasSearchQuery && notInResults;
                        
                        log('执行条件检查:', {
                            path: path,
                            isHomePage: isHomePage,
                            isSearchPage: isSearchPage,
                            hasSearchQuery: hasSearchQuery,
                            notInResults: notInResults,
                            shouldExecute: shouldExecute,
                            hasQParam: hasQParam
                        });
                        
                        return shouldExecute;
                    }
                    
                    // 增强的元素查找
                    function findElement(selectors, maxAttempts = 30) {
                        return new Promise((resolve, reject) => {
                            let attempts = 0;
                            
                            function tryFind() {
                                attempts++;

                                
                                for (let i = 0; i < selectors.length; i++) {
                                    const selector = selectors[i];
                                    const elements = document.querySelectorAll(selector);
                                    

                                    
                                    if (elements.length > 0) {
                                        // 选择第一个可见且可用的元素
                                        for (let j = 0; j < elements.length; j++) {
                                            const element = elements[j];
                                            const rect = element.getBoundingClientRect();
                                            //return first element
                                            const isVisible = true;  
                                            
                                            if (isVisible) {
                                                resolve(element);
                                                return;
                                            }
                                        }
                                    }
                                }
                                
                                if (attempts < maxAttempts) {
                                    setTimeout(tryFind, 200); // 每200ms尝试一次
                                } else {
                                    // console.error('❌ [AutoSearch-Enhanced] 查找超时，未找到合适的元素');
                                    reject(new Error('元素未找到'));
                                }
                            }
                            
                            tryFind();
                        });
                    }
                    
                    // 增强的输入模拟 - 专门针对React受控组件优化
                    function setInputValue(element, value) {
                        // console.log('📝 [AutoSearch-Enhanced] 开始设置输入值: "' + value + '"');
                        
                        try {
                            // 方法1: 直接设置React的内部属性
                            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value') ||
                                              Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                            if (valueSetter && valueSetter.set) {
                                valueSetter.set.call(element, value);
                            } else {
                                element.value = value;
                            }
                            
                            // 方法2: 聚焦元素
                            element.focus();
                            
                            // 方法3: 模拟真实用户输入 - 逐字符输入
                            element.value = ''; // 先清空
                            for (let i = 0; i < value.length; i++) {
                                const char = value[i];
                                element.value += char;
                                
                                // 触发逐字符输入事件
                                const inputEvent = new InputEvent('input', {
                                    bubbles: true,
                                    cancelable: true,
                                    inputType: 'insertText',
                                    data: char
                                });
                                
                                // 设置事件的target和currentTarget
                                Object.defineProperty(inputEvent, 'target', { value: element, writable: false });
                                Object.defineProperty(inputEvent, 'currentTarget', { value: element, writable: false });
                                
                                element.dispatchEvent(inputEvent);
                                
                                // 键盘事件
                                const keyDownEvent = new KeyboardEvent('keydown', {
                                    bubbles: true,
                                    cancelable: true,
                                    key: char,
                                    code: 'Key' + char.toUpperCase(),
                                    keyCode: char.charCodeAt(0)
                                });
                                element.dispatchEvent(keyDownEvent);
                                
                                const keyUpEvent = new KeyboardEvent('keyup', {
                                    bubbles: true,
                                    cancelable: true,
                                    key: char,
                                    code: 'Key' + char.toUpperCase(),
                                    keyCode: char.charCodeAt(0)
                                });
                                element.dispatchEvent(keyUpEvent);
                            }
                            
                            // 方法4: 触发React专用事件
                            const reactChangeEvent = new Event('change', { 
                                bubbles: true, 
                                cancelable: true 
                            });
                            element.dispatchEvent(reactChangeEvent);
                            
                            // 方法5: 触发最终的input事件确保React状态同步
                            const finalInputEvent = new InputEvent('input', {
                                bubbles: true,
                                cancelable: true,
                                inputType: 'insertText'
                            });
                            Object.defineProperty(finalInputEvent, 'target', { value: element, writable: false });
                            Object.defineProperty(finalInputEvent, 'currentTarget', { value: element, writable: false });
                            element.dispatchEvent(finalInputEvent);
                            
                            // 方法6: 触发blur和focus来确保状态更新
                            element.blur();
                            setTimeout(() => {
                                element.focus();
                                
                                // 最后再次触发input事件
                                const lastInputEvent = new InputEvent('input', {
                                    bubbles: true,
                                    cancelable: true
                                });
                                element.dispatchEvent(lastInputEvent);
                                
                            }, 100);
                            
                        } catch (error) {
                            // Fallback: 简单设置
                            element.value = value;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }

                    
                    // === 新增：设置搜索参数（scope 和 kits）===
                    async function setupSearchParams(query) {
                        try {
                            console.log('🔧 [SearchParams] 开始设置搜索参数');
                            
                            // 获取URL参数 - 确保正确解码中文字符
                            const urlParams = new URLSearchParams(window.location.search);
                            let scope = urlParams.get('scope');
                            let kits = urlParams.get('kits');
                            
                            console.log('🔧 [SearchParams] 原始URL参数:', { 
                                scope: scope, 
                                kits: kits, 
                                search: window.location.search,
                                href: window.location.href 
                            });
                            
                            // 如果当前URL没有scope参数，尝试从sessionStorage获取
                            if (!scope) {
                                scope = sessionStorage.getItem('metaso_search_scope_target');
                                console.log('🔍 [SearchParams] 从sessionStorage获取scope:', scope);
                            }
                            
                            if (!kits) {
                                kits = sessionStorage.getItem('metaso_search_kits_target');
                                console.log('🔍 [SearchParams] 从sessionStorage获取kits:', kits);
                            }
                            
                            // 设置默认值
                            if (!scope) scope = '全网';
                            if (!kits) kits = '极速·思考';
                            
                            // 确保参数正确解码（URLSearchParams已经自动解码，但保险起见再次处理）
                            try {
                                if (scope !== '全网') {
                                    scope = decodeURIComponent(scope);
                                }
                                if (kits !== '极速·思考') {
                                    kits = decodeURIComponent(kits);
                                }
                            } catch (e) {
                                console.warn('⚠️ [SearchParams] 参数解码失败，使用原始值:', e.message);
                            }
                            
                            console.log('🔧 [SearchParams] 参数设置 (解码后):', { scope, kits, originalURL: window.location.search });
                            
                            // === 保存参数到sessionStorage和Cookie，供API拦截器使用 ===
                            if (scope && scope !== '全网') {
                                sessionStorage.setItem('metaso_search_scope', scope);
                                document.cookie = 'metaso_search_scope=' + encodeURIComponent(scope) + '; path=/; SameSite=Lax';
                                console.log('💾 [SearchParams] 保存scope到sessionStorage和Cookie:', scope);
                            } else {
                                sessionStorage.removeItem('metaso_search_scope');
                                document.cookie = 'metaso_search_scope=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            }
                            
                            if (kits && kits !== '极速·思考') {
                                sessionStorage.setItem('metaso_search_kits', kits);
                                document.cookie = 'metaso_search_kits=' + encodeURIComponent(kits) + '; path=/; SameSite=Lax';
                                console.log('💾 [SearchParams] 保存kits到sessionStorage和Cookie:', kits);
                            } else {
                                sessionStorage.removeItem('metaso_search_kits');
                                document.cookie = 'metaso_search_kits=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            }
                            
                            // === 修改当前页面URL，包含scope和kits参数 ===
                            try {
                                const currentUrl = new URL(window.location.href);
                                if (scope && scope !== '全网') {
                                    currentUrl.searchParams.set('scope', scope);
                                }
                                if (kits && kits !== '极速·思考') {
                                    currentUrl.searchParams.set('kits', kits);
                                }
                                
                                // 使用replaceState避免刷新页面
                                window.history.replaceState({}, '', currentUrl.toString());
                                console.log('🔄 [SearchParams] 更新URL参数:', currentUrl.toString());
                            } catch (e) {
                                console.warn('⚠️ [SearchParams] URL更新失败:', e);
                            }
                            
                            // 等待搜索范围元素加载
                            await setupScope(scope);
                            
                            // 等待搜索方法元素加载 - 添加错误处理
                            try {
                                await setupKits(kits);
                            } catch (kitsError) {
                                console.warn('⚠️ [SearchParams] kits设置失败，但继续执行:', kitsError.message);
                                // 不抛出异常，继续执行
                            }
                            
                            console.log('✅ [SearchParams] 搜索参数设置完成');
                            
                        } catch (error) {
                            console.error('❌ [SearchParams] 设置失败:', error);
                        }
                    }
                    
                    // 设置搜索范围 (scope) - 直接赋值方式
                    async function setupScope(scope) {
                        try {
                            console.log('🔧 [SearchParams] 设置搜索范围:', scope);
                            console.log('🔧 [SearchParams] scope类型和编码信息:', {
                                scope: scope,
                                type: typeof scope,
                                length: scope ? scope.length : 0,
                                encoded: encodeURIComponent(scope || ''),
                                charCodes: scope ? scope.split('').map(c => c.charCodeAt(0)) : []
                            });
                            
                            // 如果是默认值"全网"，跳过设置
                            if (!scope || scope === '全网') {
                                console.log('✅ [SearchParams] 使用默认搜索范围: 全网');
                                return;
                            }
                            
                            // === 使用直接赋值方式设置scope，避免模拟点击 ===
                            console.log('🎯 [SearchParams] 开始直接赋值设置scope...');
                            
                            // 方法1: 直接设置URL参数和存储
                            try {
                                // 设置URL参数
                                const currentUrl = new URL(window.location.href);
                                currentUrl.searchParams.set('scope', scope);
                                window.history.replaceState({}, '', currentUrl.toString());
                                
                                // 设置sessionStorage
                                sessionStorage.setItem('metaso_search_scope_direct', scope);
                                sessionStorage.setItem('metaso_current_scope', scope);
                                
                                // 设置cookie
                                document.cookie = 'metaso_search_scope=' + encodeURIComponent(scope) + '; path=/; SameSite=Lax';
                                document.cookie = 'current_scope=' + encodeURIComponent(scope) + '; path=/; SameSite=Lax';
                                
                                console.log('💾 [SearchParams] 直接存储scope参数完成:', scope);
                            } catch (error) {
                                console.warn('⚠️ [SearchParams] 直接存储失败:', error);
                            }
                            
                            // 方法2: 尝试直接修改React组件的props和state
                            try {
                                console.log('🔧 [SearchParams] 尝试直接修改React组件状态...');
                                
                                // 查找React根节点
                                const reactRoots = [
                                    document.getElementById('__next'),
                                    document.querySelector('[data-reactroot]'),
                                    document.querySelector('#root'),
                                    document.body.firstElementChild
                                ].filter(Boolean);
                                
                                for (const root of reactRoots) {
                                    try {
                                        // 获取React实例
                                        const reactKey = Object.keys(root).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalInstance'));
                                        if (reactKey) {
                                            const reactInstance = root[reactKey];
                                            console.log('🔍 [SearchParams] 找到React实例');
                                            
                                            // 尝试查找搜索相关的组件
                                            const findScopeComponent = (fiber) => {
                                                if (!fiber) return null;
                                                
                                                // 查找包含scope相关props的组件
                                                if (fiber.memoizedProps && (
                                                    fiber.memoizedProps.scope ||
                                                    fiber.memoizedProps.searchScope ||
                                                    fiber.memoizedProps.domain ||
                                                    (fiber.memoizedProps.children && JSON.stringify(fiber.memoizedProps).includes('scope'))
                                                )) {
                                                    return fiber;
                                                }
                                                
                                                // 递归查找子组件
                                                let found = findScopeComponent(fiber.child);
                                                if (found) return found;
                                                
                                                return findScopeComponent(fiber.sibling);
                                            };
                                            
                                            const scopeComponent = findScopeComponent(reactInstance);
                                            if (scopeComponent && scopeComponent.memoizedProps) {
                                                console.log('🎯 [SearchParams] 找到scope组件，尝试直接赋值...');
                                                
                                                // 直接修改props
                                                if (scopeComponent.memoizedProps.scope !== undefined) {
                                                    scopeComponent.memoizedProps.scope = scope;
                                                }
                                                if (scopeComponent.memoizedProps.searchScope !== undefined) {
                                                    scopeComponent.memoizedProps.searchScope = scope;
                                                }
                                                if (scopeComponent.memoizedProps.domain !== undefined) {
                                                    scopeComponent.memoizedProps.domain = scope;
                                                }
                                                
                                                console.log('✅ [SearchParams] React组件props直接赋值完成');
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('⚠️ [SearchParams] React组件操作失败:', e.message);
                                    }
                                }
                            } catch (error) {
                                console.warn('⚠️ [SearchParams] React组件修改失败:', error);
                            }
                            
                            // 方法3: 直接修改表单数据和输入框
                            try {
                                console.log('🔧 [SearchParams] 尝试直接修改表单数据...');
                                
                                // 查找可能的scope输入框或选择框
                                const scopeInputSelectors = [
                                    'input[name="scope"]',
                                    'input[name="domain"]',
                                    'input[name="searchScope"]',
                                    'input[data-scope]',
                                    'select[name="scope"]',
                                    'select[name="domain"]',
                                    '[data-testid*="scope"]',
                                    '[data-testid*="domain"]'
                                ];
                                
                                for (const selector of scopeInputSelectors) {
                                    const elements = document.querySelectorAll(selector);
                                    for (const element of elements) {
                                        try {
                                            if (element.tagName === 'INPUT' || element.tagName === 'SELECT') {
                                                const oldValue = element.value;
                                                element.value = scope;
                                                
                                                // 触发change事件
                                                element.dispatchEvent(new Event('input', { bubbles: true }));
                                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                                
                                                console.log('🔄 [SearchParams] 直接修改' + element.tagName + ': "' + oldValue + '" → "' + scope + '"');
                                            }
                                        } catch (e) {
                                            console.warn('⚠️ [SearchParams] 表单元素修改失败:', e.message);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn('⚠️ [SearchParams] 表单数据修改失败:', error);
                            }
                            
                            // 方法4: 直接修改显示文本和按钮状态
                            try {
                                console.log('🔧 [SearchParams] 尝试直接修改UI显示...');
                                
                                // 修改显示scope的文本元素
                                const scopeDisplaySelectors = [
                                    'button[aria-label*="范围"]',
                                    'span[class*="scope"]',
                                    'div[class*="scope"]',
                                    'span[class*="domain"]',
                                    'div[class*="domain"]',
                                    '.MuiTypography-root:contains("全网")',
                                    'button:contains("全网")',
                                    '[data-scope-display]'
                                ];
                                
                                for (const selector of scopeDisplaySelectors) {
                                    try {
                                        const elements = document.querySelectorAll(selector);
                                        for (const element of elements) {
                                            const text = element.textContent;
                                            if (text && (text.includes('全网') || text.includes('范围'))) {
                                                // 直接修改文本内容
                                                if (element.textContent.includes('全网')) {
                                                    element.textContent = element.textContent.replace('全网', scope);
                                                }
                                                
                                                // 修改aria-label
                                                if (element.getAttribute('aria-label')) {
                                                    const ariaLabel = element.getAttribute('aria-label');
                                                    if (ariaLabel.includes('范围')) {
                                                        const newAriaLabel = ariaLabel.replace(/范围[：:][^,]*/, '范围：' + scope);
                                                        element.setAttribute('aria-label', newAriaLabel);
                                                    }
                                                }
                                                
                                                // 修改title属性
                                                if (element.title && element.title.includes('全网')) {
                                                    element.title = element.title.replace('全网', scope);
                                                }
                                                
                                                console.log('🔄 [SearchParams] 直接修改UI显示: "' + text + '" → "' + scope + '"');
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('⚠️ [SearchParams] UI显示修改失败:', e.message);
                                    }
                                }
                            } catch (error) {
                                console.warn('⚠️ [SearchParams] UI显示修改失败:', error);
                            }
                            
                            // 方法5: 注入全局变量和配置
                            try {
                                console.log('🔧 [SearchParams] 设置全局配置变量...');
                                
                                // 设置window全局变量
                                window.metasoSearchScope = scope;
                                window.currentSearchScope = scope;
                                window.searchDomain = scope;
                                
                                // 尝试修改可能的配置对象
                                if (window.searchConfig) {
                                    window.searchConfig.scope = scope;
                                    window.searchConfig.domain = scope;
                                }
                                
                                if (window.appConfig) {
                                    window.appConfig.scope = scope;
                                    window.appConfig.domain = scope;
                                }
                                
                                // 创建自定义事件通知其他组件
                                const scopeChangeEvent = new CustomEvent('scopeChanged', {
                                    detail: { scope: scope, method: 'direct-assignment' }
                                });
                                window.dispatchEvent(scopeChangeEvent);
                                document.dispatchEvent(scopeChangeEvent);
                                
                                console.log('✅ [SearchParams] 全局配置设置完成');
                            } catch (error) {
                                console.warn('⚠️ [SearchParams] 全局配置设置失败:', error);
                            }
                            
                            console.log('✅ [SearchParams] 直接赋值方式设置scope完成:', scope);
                            return;
                        } catch (error) {
                            console.error('❌ [SearchParams] 设置搜索范围失败:', error);
                        }
                    }
                    
                    // 设置搜索方法 (kits)
                    async function setupKits(kits) {
                        try {
                            console.log('🔧 [SearchParams] 设置搜索方法:', kits);
                            
                            // 根据参数确定最终的kits值
                            let finalKits = kits;
                            if (kits && kits !== '极速·思考') {
                                finalKits = kits;
                            } else {
                                finalKits = '极速·思考';
                            }
                            
                            console.log('🔧 [SearchParams] 最终搜索方法:', finalKits);
                            
                            // 查找搜索方法元素的选择器
                            const kitsSelectors = [
                                'div.search-kits_active-range-name__nArNX.MuiBox-root.css-2wnx08',
                                'div[class*="search-kits_active-range-name__nArNX"][class*="css-2wnx08"]',
                                'div[class*="search-kits_active-range-name"]'
                            ];
                            
                            // 等待元素出现 - 添加错误处理
                            let kitsElement = null;
                            try {
                                kitsElement = await findElement(kitsSelectors, 10); // 减少等待时间
                            } catch (findError) {
                                console.warn('⚠️ [SearchParams] 查找搜索方法元素失败，将跳过UI设置:', findError.message);
                                // 不抛出异常，继续执行其他逻辑
                            }
                            
                            if (kitsElement) {
                                try {
                                    // 设置文本内容
                                    kitsElement.textContent = finalKits;
                                    kitsElement.innerText = finalKits;
                                    
                                    // 直接设置 value 属性（如果是 input 或 select）
                                    if (kitsElement.tagName === 'SELECT' || kitsElement.tagName === 'INPUT') {
                                        kitsElement.value = finalKits;
                                    }
                                    
                                    // 触发变更事件而非点击事件
                                    kitsElement.dispatchEvent(new Event('change', { bubbles: true }));
                                    kitsElement.dispatchEvent(new Event('input', { bubbles: true }));
                                    
                                    console.log('✅ [SearchParams] 搜索方法设置成功:', finalKits);
                                } catch (setError) {
                                    console.warn('⚠️ [SearchParams] 设置搜索方法元素失败:', setError.message);
                                }
                            } else {
                                console.warn('⚠️ [SearchParams] 未找到搜索方法元素，将使用默认值');
                            }
                            
                            // 无论UI设置是否成功，都要保存到存储中供API拦截器使用
                            if (finalKits && finalKits !== '极速·思考') {
                                sessionStorage.setItem('metaso_search_kits', finalKits);
                                document.cookie = 'metaso_search_kits=' + encodeURIComponent(finalKits) + '; path=/; SameSite=Lax';
                                console.log('💾 [SearchParams] 已保存kits参数到存储:', finalKits);
                            } else {
                                sessionStorage.removeItem('metaso_search_kits');
                                document.cookie = 'metaso_search_kits=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                                console.log('🗑️ [SearchParams] 已清除kits参数（使用默认值）');
                            }
                            
                        } catch (error) {
                            console.error('❌ [SearchParams] 设置搜索方法失败:', error);
                            // 不再抛出异常，允许程序继续执行
                        }
                    }
                    
                    // 生成搜索ID的辅助函数 - 全局使用
                    function generateSearchId() {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            const r = Math.random() * 16 | 0;
                            const v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                    }
                    
                    // UI搜索函数 - 作为fallback方案
                    async function executeUISearch(query) {
                        log('🎯 执行UI搜索作为Fallback: ' + query);
                        
                        try {
                            // 等待页面基本加载完成
                            if (document.readyState !== 'complete') {
                                console.log('⏳ [AutoSearch-Fallback] 等待页面完全加载...');
                                await new Promise(resolve => window.addEventListener('load', resolve));
                            }
                            
                            // 额外等待React组件渲染
                            console.log('⏳ [AutoSearch-Fallback] 等待React组件渲染完成...');
                            await new Promise(resolve => setTimeout(resolve, 300));
                            
                            // 查找搜索框
                            console.log('🔍 [AutoSearch-Fallback] 开始查找搜索框...');
                            const searchSelectors = [
                                'textarea.search-consult-textarea.search-consult-textarea_search-consult-textarea__kjgyz',
                                'textarea.search-consult-textarea',
                                'textarea[class*="search-consult-textarea"]'                               
                            ];
                            
                            const searchBox = await findElement(searchSelectors);
                            console.log('✅ [AutoSearch-Fallback] 搜索框查找成功');
                            
                            // 查找发送按钮
                            console.log('🔍 [AutoSearch-Fallback] 开始查找发送按钮...');
                            const buttonSelectors = [
                                'button.MuiButtonBase-root.MuiIconButton-root.MuiIconButton-sizeMedium.send-arrow-button.css-1rab04c',
                                'button.send-arrow-button',
                                'button[class*="send-arrow-button"]'
                            ];
                            
                            const sendButton = await findElement(buttonSelectors);
                            console.log('✅ [AutoSearch-Fallback] 发送按钮查找成功');
                            
                            // === 使用直接赋值方式执行搜索，避免模拟按钮点击 ===
                            console.log('🎯 [AutoSearch-Fallback] 开始直接执行搜索:', query);
                            
                            try {
                                // 方法1: 直接调用搜索API
                                console.log('🔧 [AutoSearch-Fallback] 尝试直接调用搜索API...');
                                
                                // 构建搜索请求数据
                                const searchData = {
                                    q: query,
                                    scope: sessionStorage.getItem('metaso_search_scope') || '全网',
                                    kits: sessionStorage.getItem('metaso_search_kits') || '极速·思考'
                                };
                                
                                console.log('📋 [AutoSearch-Fallback] 搜索数据:', searchData);
                                
                                // 尝试直接导航到搜索结果页面
                                const searchUrl = new URL(window.location.origin + '/search/' + generateSearchId());
                                searchUrl.searchParams.set('q', query);
                                if (searchData.scope && searchData.scope !== '全网') {
                                    searchUrl.searchParams.set('scope', searchData.scope);
                                }
                                if (searchData.kits && searchData.kits !== '极速·思考') {
                                    searchUrl.searchParams.set('kits', searchData.kits);
                                }
                                
                                console.log('🔄 [AutoSearch-Fallback] 直接导航到搜索页面:', searchUrl.toString());
                                window.location.href = searchUrl.toString();
                                
                                return true;
                                
                            } catch (apiError) {
                                console.warn('⚠️ [AutoSearch-Fallback] 直接API调用失败，尝试其他方法:', apiError);
                                
                                try {
                                    // 方法2: 通过表单提交方式
                                    console.log('🔧 [AutoSearch-Fallback] 尝试表单提交方式...');
                                    
                                    // 创建隐藏表单
                                    const form = document.createElement('form');
                                    form.method = 'GET';
                                    form.action = '/search/' + generateSearchId();
                                    form.style.display = 'none';
                                    
                                    // 添加查询参数
                                    const qInput = document.createElement('input');
                                    qInput.type = 'hidden';
                                    qInput.name = 'q';
                                    qInput.value = query;
                                    form.appendChild(qInput);
                                    
                                    // 添加scope参数
                                    const scope = sessionStorage.getItem('metaso_search_scope');
                                    if (scope && scope !== '全网') {
                                        const scopeInput = document.createElement('input');
                                        scopeInput.type = 'hidden';
                                        scopeInput.name = 'scope';
                                        scopeInput.value = scope;
                                        form.appendChild(scopeInput);
                                    }
                                    
                                    // 添加kits参数
                                    const kits = sessionStorage.getItem('metaso_search_kits');
                                    if (kits && kits !== '极速·思考') {
                                        const kitsInput = document.createElement('input');
                                        kitsInput.type = 'hidden';
                                        kitsInput.name = 'kits';
                                        kitsInput.value = kits;
                                        form.appendChild(kitsInput);
                                    }
                                    
                                    document.body.appendChild(form);
                                    form.submit();
                                    
                                    console.log('✅ [AutoSearch-Fallback] 表单提交执行完成');
                                    return true;
                                    
                                } catch (formError) {
                                    console.warn('⚠️ [AutoSearch-Fallback] 表单提交失败，使用备用方法:', formError);
                                    
                                    // 方法3: 备用 - 修改当前页面状态和URL
                                    console.log('🔧 [AutoSearch-Fallback] 使用备用方法 - 状态修改...');
                                    
                                    // 设置输入框值
                                    if (searchBox) {
                                        searchBox.value = query;
                                        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                                        searchBox.dispatchEvent(new Event('change', { bubbles: true }));
                                    }
                                    
                                    // 修改URL参数
                                    const currentUrl = new URL(window.location.href);
                                    currentUrl.searchParams.set('q', query);
                                    window.history.pushState({}, '', currentUrl.toString());
                                    
                                    // 触发搜索状态变更事件
                                    const searchEvent = new CustomEvent('autoSearchExecuted', {
                                        detail: { query: query, method: 'direct-assignment-fallback' }
                                    });
                                    window.dispatchEvent(searchEvent);
                                    document.dispatchEvent(searchEvent);
                                    
                                    console.log('✅ [AutoSearch-Fallback] 备用方法执行完成');
                                    return true;
                                }
                            }
                            
                            console.log('✅ [AutoSearch-Fallback] 直接赋值搜索完成');
                            
                        } catch (error) {
                            console.error('❌ [AutoSearch-Fallback] UI搜索失败:', error);
                            return false;
                        }
                    }
                                        
                    // 主要执行函数
                    async function executeAutoSearch() {
                        try {
                            // 检查是否有q参数
                            const urlParams = new URLSearchParams(window.location.search);
                            const qQuery = urlParams.get('q');
                            const currentPath = window.location.pathname;
                            
                            // === 防止无限循环的关键检查 ===
                            // 如果当前已经在搜索结果页面，不要重复执行
                            if (currentPath.includes('/search/') && qQuery) {
                                console.log('⏭️ [AutoSearch] 已在搜索结果页面，跳过重复搜索:', { path: currentPath, query: qQuery });
                                return;
                            }
                            
                            // 检查是否已经执行过（防止重复执行）
                            const executedKey = 'preciseAutoSearchExecuted_v3_' + (qQuery || 'default');
                            if (sessionStorage.getItem(executedKey)) {
                                console.log('⏭️ [AutoSearch] 已执行过此搜索，跳过:', qQuery || 'default');
                                return;
                            }
                            
                            // q参数执行UI自动搜索
                            if (qQuery) {
                                console.log('🎯 [AutoSearch] 检测到q参数，但在非搜索页面，准备执行搜索:', qQuery);
                                
                                // === 处理 scope 和 kits 参数 ===
                                await setupSearchParams();
                                
                                // 等待页面基本加载完成
                                if (document.readyState !== 'complete') {
                                    console.log('⏳ [AutoSearch] 等待页面完全加载...');
                                    await new Promise(resolve => window.addEventListener('load', resolve));
                                }
                                
                                // 额外等待React组件渲染 - 对q参数增加更长等待时间
                                console.log('⏳ [AutoSearch] 等待React组件渲染完成（q参数模式）...');
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                            } else if (!shouldExecuteAutoSearch()) {
                                console.log('⏭️ [AutoSearch] 跳过自动搜索（条件不满足）');
                                return;
                            } else {
                                // === 处理 scope 和 kits 参数 ===
                                await setupSearchParams();
                                
                                console.log('🚀 [AutoSearch] 开始执行默认搜索流程');
                                
                                // 等待页面基本加载完成
                                if (document.readyState !== 'complete') {
                                    console.log('⏳ [AutoSearch] 等待页面完全加载...');
                                    await new Promise(resolve => window.addEventListener('load', resolve));
                                }
                                
                                // 额外等待React组件渲染
                                console.log('⏳ [AutoSearch] 等待React组件渲染完成...');
                                await new Promise(resolve => setTimeout(resolve, 400));
                            }
                            
                            // 确定搜索查询内容
                            const finalQuery = qQuery || getSearchQuery();
                            console.log('🎯 [AutoSearch] 最终搜索内容:', finalQuery);
                            
                            // === 直接尝试导航到搜索结果页面，避免依赖UI元素 ===
                            console.log('🎯 [AutoSearch] 开始直接执行搜索:', finalQuery);
                            
                            try {
                                // 方法1: 直接调用搜索API
                                console.log('🔧 [AutoSearch] 尝试直接调用搜索API...');
                                
                                // 从多个来源获取scope和kits参数，确保完整性
                                const urlParams = new URLSearchParams(window.location.search);
                                let scope = urlParams.get('scope') || sessionStorage.getItem('metaso_search_scope') || sessionStorage.getItem('metaso_search_scope_target') || '全网';
                                let kits = urlParams.get('kits') || sessionStorage.getItem('metaso_search_kits') || sessionStorage.getItem('metaso_search_kits_target') || '极速·思考';
                                
                                // 构建搜索请求数据
                                const searchData = {
                                    q: finalQuery,
                                    scope: scope,
                                    kits: kits
                                };
                                
                                console.log('📋 [AutoSearch] 搜索数据:', searchData);
                                
                                // 尝试直接导航到搜索结果页面
                                const searchUrl = new URL(window.location.origin + '/search/' + generateSearchId());
                                searchUrl.searchParams.set('q', finalQuery);
                                if (searchData.scope && searchData.scope !== '全网') {
                                    searchUrl.searchParams.set('scope', searchData.scope);
                                }
                                if (searchData.kits && searchData.kits !== '极速·思考') {
                                    searchUrl.searchParams.set('kits', searchData.kits);
                                }
                                
                                console.log('🔄 [AutoSearch] 直接导航到搜索页面:', searchUrl.toString());
                                window.location.href = searchUrl.toString();
                                
                                console.log('✅ [AutoSearch] 直接赋值搜索完成');
                                
                                // 标记已执行，避免重复 - 只在搜索成功完成后设置
                                const executedKey = 'preciseAutoSearchExecuted_v3_' + (finalQuery || 'default');
                                sessionStorage.setItem(executedKey, 'true');
                                return; // 成功执行，直接返回
                                
                            } catch (directError) {
                                console.warn('⚠️ [AutoSearch] 直接导航失败，尝试UI方式:', directError);
                                
                                // 如果直接导航失败，尝试UI方式作为备选方案
                                try {
                                    // 查找搜索框 - 添加错误处理
                                    console.log('� [AutoSearch] 尝试查找UI元素...');
                                    let searchBox = null;
                                    let sendButton = null;
                                    
                                    try {
                                        const searchSelectors = [
                                            'textarea.search-consult-textarea.search-consult-textarea_search-consult-textarea__kjgyz',
                                            'textarea.search-consult-textarea',
                                            'textarea[class*="search-consult-textarea"]'                               
                                        ];
                                        searchBox = await findElement(searchSelectors, 10); // 减少等待时间
                                        console.log('✅ [AutoSearch] 搜索框查找成功');
                                    } catch (searchBoxError) {
                                        console.warn('⚠️ [AutoSearch] 搜索框查找失败:', searchBoxError.message);
                                    }
                                    
                                    try {
                                        // 查找发送按钮
                                        const buttonSelectors = [
                                            'button.MuiButtonBase-root.MuiIconButton-root.MuiIconButton-sizeMedium.send-arrow-button.css-1rab04c',
                                            'button.send-arrow-button',
                                            'button[class*="send-arrow-button"]'
                                        ];
                                        sendButton = await findElement(buttonSelectors, 10); // 减少等待时间
                                        console.log('✅ [AutoSearch] 发送按钮查找成功');
                                    } catch (buttonError) {
                                        console.warn('⚠️ [AutoSearch] 发送按钮查找失败:', buttonError.message);
                                    }
                                    
                                    // 如果找到了UI元素，尝试模拟操作
                                    if (searchBox && sendButton) {
                                        console.log('🎯 [AutoSearch] 找到UI元素，开始模拟操作');
                                        
                                        // 设置搜索框内容
                                        setInputValue(searchBox, finalQuery);
                                        
                                        // 等待一下再点击按钮
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                        
                                        // 点击搜索按钮
                                        sendButton.click();
                                        
                                        console.log('✅ [AutoSearch] UI操作完成');
                                        
                                        // 标记已执行
                                        const executedKey = 'preciseAutoSearchExecuted_v3_' + (finalQuery || 'default');
                                        sessionStorage.setItem(executedKey, 'true');
                                        return;
                                    } else {
                                        console.warn('⚠️ [AutoSearch] UI元素不完整，使用最终备选方案');
                                        
                                        // 最终备选方案：修改当前页面状态
                                        if (searchBox) {
                                            searchBox.value = finalQuery;
                                            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                                            searchBox.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                        
                                        // 修改URL参数
                                        const currentUrl = new URL(window.location.href);
                                        currentUrl.searchParams.set('q', finalQuery);
                                        window.history.pushState({}, '', currentUrl.toString());
                                        
                                        // 触发搜索状态变更事件
                                        const searchEvent = new CustomEvent('autoSearchExecuted', {
                                            detail: { query: finalQuery, method: 'fallback' }
                                        });
                                        window.dispatchEvent(searchEvent);
                                        document.dispatchEvent(searchEvent);
                                        
                                        console.log('✅ [AutoSearch] 备选方案执行完成');
                                        
                                        // 标记已执行
                                        const executedKey = 'preciseAutoSearchExecuted_v3_' + (finalQuery || 'default');
                                        sessionStorage.setItem(executedKey, 'true');
                                    }
                                    
                                } catch (uiError) {
                                    console.error('❌ [AutoSearch] UI方式也失败:', uiError);
                                    throw uiError; // 重新抛出错误供外层捕获
                                }
                            }
                            
                        } catch (error) {
                            console.error('❌ [AutoSearch] 执行失败:', error);
                            // 如果失败，清除对应的标记，允许重试
                            const finalQuery = urlParams.get('q') || getSearchQuery();
                            const executedKey = 'preciseAutoSearchExecuted_v3_' + (finalQuery || 'default');
                            sessionStorage.removeItem(executedKey);
                        }
                    }
                    
                    // 启动自动搜索 - 延迟执行避免阻塞页面加载
                    //console.log('🕒 [AutoSearch-Enhanced] 准备启动自动搜索（1秒后开始）...');
                    setTimeout(executeAutoSearch, 100);
                    
                })();
            </script>
        `;
        $('head').append(autoSearchScript);
        console.log('已注入增强版自动搜索脚本');
        
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

// === API请求拦截中间件 ===
// 专门用于拦截和修改/api/searchV2请求
app.use('/api/searchV2', (req, res, next) => {
    console.log('🔍 [API拦截] 拦截到searchV2请求');
    console.log('🔍 [API拦截] 请求方法:', req.method);
    console.log('🔍 [API拦截] 查询参数:', req.query);
    
    // 从多个来源提取scope和kits参数
    let scope = null;
    let kits = null;
    
    // 1. 从Referer中提取参数
    const referer = req.headers.referer || '';
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            scope = refererUrl.searchParams.get('scope');
            kits = refererUrl.searchParams.get('kits');
            
            console.log('🔍 [API拦截] 从Referer提取参数 (原始):', { scope, kits });
            console.log('🔍 [API拦截] Referer URL:', referer);
            
        } catch (e) {
            console.log('🔍 [API拦截] Referer解析失败:', e.message);
        }
    }
    
    // 2. 从请求体中的URL参数提取（新增）
    if (req.body) {
        try {
            let bodyData = req.body;
            if (typeof bodyData === 'string') {
                bodyData = JSON.parse(bodyData);
            }
            
            if (bodyData.url) {
                const bodyUrl = new URL(bodyData.url);
                if (!scope) scope = bodyUrl.searchParams.get('scope');
                if (!kits) kits = bodyUrl.searchParams.get('kits');
                
                console.log('🔍 [API拦截] 从请求体URL提取参数:', { 
                    url: bodyData.url, 
                    scope, 
                    kits 
                });
            }
        } catch (e) {
            console.log('🔍 [API拦截] 请求体URL解析失败:', e.message);
        }
    }
    
    // 3. 从Cookie中提取参数（作为备选方案）
    const cookies = req.headers.cookie;
    if (cookies) {
        const cookieMap = {};
        cookies.split(';').forEach(cookie => {
            const [key, value] = cookie.trim().split('=');
            cookieMap[key] = decodeURIComponent(value || '');
        });
        
        if (!scope && cookieMap['metaso_search_scope']) {
            scope = cookieMap['metaso_search_scope'];
            console.log('🔍 [API拦截] 从Cookie提取scope:', scope);
        }
        
        if (!kits && cookieMap['metaso_search_kits']) {
            kits = cookieMap['metaso_search_kits'];
            console.log('🔍 [API拦截] 从Cookie提取kits:', kits);
        }
    }
    
    // 3. 从请求头中提取（如果之前设置过）
    if (!scope && req.headers['x-search-scope']) {
        scope = req.headers['x-search-scope'];
        console.log('🔍 [API拦截] 从请求头提取scope:', scope);
    }
    
    if (!kits && req.headers['x-search-kits']) {
        kits = req.headers['x-search-kits'];
        console.log('🔍 [API拦截] 从请求头提取kits:', kits);
    }
    
    // 将参数存储到请求头中，供后续代理使用
    if (scope && scope !== '全网') {
        // 对中文字符进行URL编码，避免HTTP头部字符错误
        const encodedScope = encodeURIComponent(scope);
        req.headers['x-search-scope'] = encodedScope;
        console.log('🎯 [API拦截] 设置scope头:', scope, '(编码后:', encodedScope, ')');
    }
    
    if (kits && kits !== '极速·思考') {
        const encodedKits = encodeURIComponent(kits);
        req.headers['x-search-kits'] = encodedKits;
        console.log('🎯 [API拦截] 设置kits头:', kits, '(编码后:', encodedKits, ')');
    }
    
    // 继续到代理中间件
    next();
});

// === API文件请求处理中间件 ===
// 专门处理 /api/file/ 等动态资源请求，确保正确的Content-Type和CORS头
app.use('/api/file/*', (req, res, next) => {
    console.log('📁 [API文件] 处理API文件请求:', req.path);
    
    // 添加适当的响应头
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 继续到主代理中间件
    next();
});

// === 其他API请求处理中间件 ===
// 处理所有其他API请求
app.use('/api/*', (req, res, next) => {
    console.log('🔧 [API通用] 处理API请求:', req.path);
    
    // 添加CORS头
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 继续到主代理中间件
    next();
});

// 创建代理中间件，目标为 https://metaso.cn
app.use('/', proxy('https://metaso.cn', {
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        //console.log('\\n=== 处理响应头 ' + userReq.path + ' ===');
        //console.log('原始响应头:', Object.keys(headers));
        
        // 特殊处理API文件请求
        if (userReq.path.startsWith('/api/file/')) {
            console.log('📁 [API文件响应] 处理API文件响应头:', userReq.path);
            
            // 确保正确的Content-Type被保留
            const contentType = headers['content-type'];
            if (contentType) {
                console.log('📁 [API文件响应] Content-Type:', contentType);
            }
            
            // 添加CORS头，但保留原有的Content-Type
            headers['access-control-allow-origin'] = '*';
            headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['access-control-allow-headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
            headers['access-control-allow-credentials'] = 'true';
            
            // 添加缓存控制头，提升图片加载性能
            if (!headers['cache-control']) {
                headers['cache-control'] = 'public, max-age=3600'; // 1小时缓存
            }
            
            return headers;
        }
        
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
        
        //console.log('已移除响应头:', removedHeaders);
        
        // === 新增：设置 scope/kits 相关的 cookies ===
        if (userReq._cookieUpdates && userReq._cookieUpdates.length > 0) {
            console.log('🍪 [Cookie设置] 应用cookie更新:', userReq._cookieUpdates);
            
            // 如果已有Set-Cookie头，保留它们
            const existingCookies = headers['set-cookie'] || [];
            
            // 添加新的cookies
            const allCookies = Array.isArray(existingCookies) ? existingCookies : [existingCookies];
            allCookies.push(...userReq._cookieUpdates);
            
            headers['set-cookie'] = allCookies;
            console.log('🍪 [Cookie设置] 最终cookie数量:', allCookies.length);
        }
        
        // 添加允许iframe的头
        headers['x-frame-options'] = 'ALLOWALL';
        
        // 添加CORS头，解决跨域问题
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['access-control-allow-headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
        headers['access-control-allow-credentials'] = 'true';
        
        //console.log('最终响应头:', Object.keys(headers));
        return headers;
    },
    
    // 处理HTML响应
    userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
        const contentType = proxyRes.headers['content-type'] || '';
        console.log('\\n=== 处理响应数据 ' + userReq.path + ' ===');
                
        if (contentType.includes('text/html')) {
            console.log('处理HTML响应...');
            const html = proxyResData.toString('utf8');
            const processedHtml = processHtmlResponse(html, userReq.path);
            console.log('HTML处理完成');
            return processedHtml;
        }
        
        console.log('非HTML响应，直接返回');
        return proxyResData;
    },
    
    // URL路径解析器 - 处理查询参数传递
    proxyReqPathResolver: function(req) {
        console.log('\n=== URL路径解析 ===');
        console.log('原始路径:', req.path);
        console.log('原始查询参数:', req.query);
        console.log('原始URL:', req.url);
        
        // === 新增：检测并保存 scope/kits 参数到 cookie ===
        if (req.query.q) {
            let needsCookieUpdate = false;
            const cookieUpdates = [];
            
            // 检查是否有 scope 参数需要保存
            if (req.query.scope && req.query.scope !== '全网') {
                console.log('🍪 [Cookie保存] 检测到q+scope参数，保存scope到cookie:', req.query.scope);
                cookieUpdates.push(`metaso_search_scope=${encodeURIComponent(req.query.scope)}; Path=/; SameSite=Lax; Max-Age=86400`);
                needsCookieUpdate = true;
            }
            
            // 检查是否有 kits 参数需要保存
            if (req.query.kits && req.query.kits !== '极速·思考') {
                console.log('🍪 [Cookie保存] 检测到q+kits参数，保存kits到cookie:', req.query.kits);
                cookieUpdates.push(`metaso_search_kits=${encodeURIComponent(req.query.kits)}; Path=/; SameSite=Lax; Max-Age=86400`);
                needsCookieUpdate = true;
            }
            
            // 如果需要设置cookie，添加到响应头中
            if (needsCookieUpdate) {
                // 将cookie设置信息存储到请求对象中，供后续使用
                req._cookieUpdates = cookieUpdates;
                console.log('🍪 [Cookie保存] 准备设置cookies:', cookieUpdates);
            }
        }
        
        // === 新增：scope参数完善判断 ===
        // 如果指定scope但没有指定参数q，跳转到https://metaso.cn/subject/scopeid
        if (req.path === '/' && req.query.scope && !req.query.q) {
            // 对scope参数进行解码处理（处理中文编码问题）
            let decodedScope = req.query.scope;
            try {
                // 如果已经是中文，直接使用；如果是URL编码，则解码
                if (!/[\u4e00-\u9fa5]/.test(decodedScope)) {
                    decodedScope = decodeURIComponent(decodedScope);
                }
            } catch (e) {
                // 解码失败，使用原值
                console.log('⚠️ [URL解析] scope参数解码失败:', e.message);
            }
            
            console.log('🔍 [URL解析] scope参数处理:', {
                原始: req.query.scope,
                解码后: decodedScope
            });
            
            // scope到scopeid的映射表
            const scopeIdMapping = {
                '泥沙知识': '8633734405728952320',
                '监测知识': '8633749827795091456', 
                '学习': '8633734405863170048',
                'API文档': '8633734405728952322'
            };
            
            const scopeId = scopeIdMapping[decodedScope];
            if (scopeId) {
                console.log('🎯 [URL解析] scope参数无q，跳转到subject页面: ' + decodedScope + ' -> ' + scopeId);
                
                // 构建目标路径：/subject/scopeid，并保留其他查询参数
                const queryParams = new URLSearchParams();
                
                // === 重要：保留scope参数到subject页面 ===
                queryParams.set('scope', decodedScope);
                console.log('📋 [URL解析] 保留scope参数到subject页面: ' + decodedScope);
                
                // 保留除了原始scope之外的其他查询参数
                for (const [key, value] of Object.entries(req.query)) {
                    if (key !== 'scope') {
                        queryParams.set(key, value);
                        console.log('📋 保留参数: ' + key + ' = ' + value);
                    }
                }
                
                // 构建最终路径
                let targetPath = '/subject/' + scopeId;
                if (queryParams.toString()) {
                    targetPath = targetPath + '?' + queryParams.toString();
                }
                
                console.log('目标路径(scope跳转):', targetPath);
                console.log('===================\n');
                
                return targetPath;
            } else {
                console.log('⚠️ [URL解析] 未找到scope对应的scopeId: ' + decodedScope);
                // 输出映射表用于调试
                console.log('🔍 [URL解析] 可用的scope映射:', Object.keys(scopeIdMapping));
            }
        }
        
        // === 原有逻辑：如果有scope或kits参数，确保它们被传递到目标URL ===
        let targetPath = req.path;
        const queryParams = new URLSearchParams();
        
        // 保留所有原始查询参数
        for (const [key, value] of Object.entries(req.query)) {
            queryParams.set(key, value);
            console.log('📋 保留参数: ' + key + ' = ' + value);
        }
        
        // 如果有查询参数，构建完整的查询字符串
        if (queryParams.toString()) {
            targetPath = req.path + '?' + queryParams.toString();
        }
        
        console.log('目标路径:', targetPath);
        console.log('===================\n');
        
        return targetPath;
    },
    
    // 代理请求选项
    proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
        // 设置合适的请求头
        proxyReqOpts.headers = proxyReqOpts.headers || {};
        proxyReqOpts.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        proxyReqOpts.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        proxyReqOpts.headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
        // 始终带上认证信息和本地静态资源拦截
        if (true/*srcReq.path.includes('/?q')*/) {
            // 认证信息
            proxyReqOpts.headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
            proxyReqOpts.headers['X-User-ID'] = GLOBAL_UID;
            proxyReqOpts.headers['X-Session-ID'] = GLOBAL_SID;
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            // Cookie 认证
            const authCookies = [
                `uid=${GLOBAL_UID}`,
                `sid=${GLOBAL_SID}`,
                'isLoggedIn=true',
                `token=${AUTH_TOKEN}`
            ];
            proxyReqOpts.headers['Cookie'] = authCookies.join('; ');
            // 保证 referer/origin 指向本站，防止源站校验失败
            proxyReqOpts.headers['Referer'] = 'https://metaso.cn/';
            proxyReqOpts.headers['Origin'] = 'https://metaso.cn';
            
            // 构建完整的目标URL，保留查询参数
            let targetPath = srcReq.path;
            if (srcReq.url.includes('?')) {
                const queryString = srcReq.url.split('?')[1];
                targetPath = `${srcReq.path}?${queryString}`;
            }
            proxyReqOpts.href = `https://metaso.cn${targetPath}`;
            //console.log('已为/search/请求处理:', srcReq.path, '完整URL:', targetPath);
        }
          // === 拦截搜索API请求，动态添加scope参数 ===
        if (srcReq.path === '/api/searchV2' && srcReq.method === 'POST') {
            // 从原始请求中获取存储的scope和kits参数
            const scope = srcReq.query.scope || srcReq.headers['x-search-scope'];
            const kits = srcReq.query.kits || srcReq.headers['x-search-kits'];
            
            console.log('🔍 [API拦截] 检测到searchV2 API请求');
            console.log('🔍 [API拦截] 从请求中提取参数:', { scope, kits });
            
            // 如果有scope或kits参数，注入到请求头中
            if (scope && scope !== '全网') {
                // 解码后再编码，确保一致性
                const decodedScope = decodeURIComponent(scope);
                proxyReqOpts.headers['X-Search-Scope'] = encodeURIComponent(decodedScope);
                console.log('🎯 [API拦截] 注入scope参数:', decodedScope);
            }
            
            if (kits && kits !== '极速·思考') {
                const decodedKits = decodeURIComponent(kits);
                proxyReqOpts.headers['X-Search-Kits'] = encodeURIComponent(decodedKits);
                console.log('🎯 [API拦截] 注入kits参数:', decodedKits);
            }
        }
        
        console.log('\n=== 代理请求 ' + srcReq.path + ' ===');
        return proxyReqOpts;
    },
    
    // === 修改请求体，注入scope参数 ===
    proxyReqBodyDecorator: function(bodyContent, srcReq) {
        // 只处理/api/searchV2的POST请求
        if (srcReq.path === '/api/searchV2' && srcReq.method === 'POST') {
            console.log('🔍 [请求体拦截] 处理searchV2请求体');
            
            try {
                // 解析原始请求体
                const originalBody = bodyContent.toString('utf8');
                console.log('🔍 [请求体拦截] 原始请求体:', originalBody);
                
                let requestData;
                
                // 尝试解析JSON
                try {
                    requestData = JSON.parse(originalBody);
                } catch (e) {
                    console.log('🔍 [请求体拦截] 非JSON格式，尝试URL编码解析');
                    // 如果不是JSON，可能是URL编码格式
                    const urlParams = new URLSearchParams(originalBody);
                    requestData = Object.fromEntries(urlParams.entries());
                }
                
                console.log('🔍 [请求体拦截] 解析后的数据:', requestData);
                
                // === 新增：从请求体中的URL提取scope参数 ===
                let scope = null;
                let kits = null;
                
                // 1. 从请求体的URL参数中提取
                if (requestData.url) {
                    try {
                        const bodyUrl = new URL(requestData.url);
                        scope = bodyUrl.searchParams.get('scope');
                        kits = bodyUrl.searchParams.get('kits');
                        
                        console.log('🔍 [请求体拦截] 从URL提取参数:', { 
                            url: requestData.url, 
                            scope, 
                            kits 
                        });
                    } catch (e) {
                        console.log('🔍 [请求体拦截] URL解析失败:', e.message);
                    }
                }
                
                // 2. 从请求头中获取scope和kits参数（需要解码）
                const encodedScope = srcReq.headers['x-search-scope'];
                const encodedKits = srcReq.headers['x-search-kits'];
                
                if (!scope && encodedScope) {
                    try {
                        scope = decodeURIComponent(encodedScope);
                    } catch (e) {
                        scope = encodedScope; // 如果解码失败，使用原值
                    }
                }
                
                if (!kits && encodedKits) {
                    try {
                        kits = decodeURIComponent(encodedKits);
                    } catch (e) {
                        kits = encodedKits; // 如果解码失败，使用原值
                    }
                }
                
                // === 新增：根据抓包数据构建正确的知识库参数 ===
                if (scope && scope !== '全网') {
                    // 知识库映射表（根据抓包数据）
                    const scopeMapping = {
                        '泥沙知识': {
                            engineType: 'knowledge_base',
                            scholarSearchDomain: '8633734405728952320',
                            searchTopicId: '8633734405728952320',
                            searchTopicName: '泥沙知识'
                        },
                        '监测知识': {
                            engineType: 'knowledge_base',
                            scholarSearchDomain: '8633749827795091456', 
                            searchTopicId: '8633749827795091456',
                            searchTopicName: '监测知识'
                        },
                        '学习': {
                            engineType: 'knowledge_base',
                            scholarSearchDomain: '8633734405863170048',
                            searchTopicId: '8633734405863170048',
                            searchTopicName: '学习'
                        },
                        'API文档': {
                            engineType: 'knowledge_base',
                            scholarSearchDomain: '8633734405728952322', // 假设ID，需要实际抓包确认
                            searchTopicId: '8633734405728952322',
                            searchTopicName: 'API文档'
                        }
                    };
                    
                    const scopeConfig = scopeMapping[scope];
                    if (scopeConfig) {
                        // 注入知识库相关参数
                        requestData.engineType = scopeConfig.engineType;
                        requestData.scholarSearchDomain = scopeConfig.scholarSearchDomain;
                        requestData.searchTopicId = scopeConfig.searchTopicId;
                        requestData.searchTopicName = scopeConfig.searchTopicName;
                        
                        console.log('🎯 [请求体拦截] 注入知识库参数:', {
                            scope: scope,
                            engineType: scopeConfig.engineType,
                            scholarSearchDomain: scopeConfig.scholarSearchDomain,
                            searchTopicId: scopeConfig.searchTopicId,
                            searchTopicName: scopeConfig.searchTopicName
                        });
                    } else {
                        console.warn('⚠️ [请求体拦截] 未找到scope映射:', scope);
                        // 如果没有映射，使用默认值
                        requestData.scope = scope;
                    }
                } else {
                    // 使用全网搜索（默认）
                    requestData.engineType = 'search'; // 或者不设置这些参数
                    console.log('🔍 [请求体拦截] 使用默认全网搜索');
                }
                
                if (kits) {
                    requestData.kits = kits;
                    console.log('🎯 [请求体拦截] 注入kits参数:', kits);
                }
                
                // 序列化修改后的数据
                const modifiedBody = JSON.stringify(requestData);
                console.log('🔍 [请求体拦截] 修改后的请求体:', modifiedBody);
                
                return modifiedBody;
                
            } catch (error) {
                console.error('❌ [请求体拦截] 处理失败:', error);
                return bodyContent; // 返回原始内容
            }
        }
        
        return bodyContent;
    }
}));

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`=== metaso.cn 代理服务器已启动 ===`);
    logger.info(`环境: ${IS_PRODUCTION ? 'Production' : 'Development'}`);
    logger.info(`日志级别: ${IS_PRODUCTION ? 'INFO' : 'DEBUG'}`);
    logger.info(`监听端口: ${PORT}`);
    logger.info(`主机: ${HOST}`);
    logger.info(`协议: ${PROTOCOL}`);
    logger.info(`代理服务器URL: ${PROXY_SERVER_URL}`);
    logger.info(`访问地址: ${PROXY_SERVER_URL}`);
    logger.info(`静态资源: ${PROXY_SERVER_URL}/static/`);
    logger.info(`代理目标: https://metaso.cn`);
    logger.info(`==============================`);
    
    logger.info('功能说明:');
    logger.info('- ✓ 移除CSP和X-Frame-Options头');
    logger.info('- ✓ 删除微信登录相关元素');
    logger.info('- ✓ 注入localStorage授权信息');
    logger.info('- ✓ 静态资源本地化服务');
    logger.info('- ✓ iframe兼容性处理');
    // 已移除 metaso.cn_files 相关的静态资源加载和路径替换逻辑
    logger.info('已移除 metaso.cn_files 相关的静态资源加载逻辑');
});

app.on('error', (err) => {
    logger.error('服务器错误:', err);
});

module.exports = app;