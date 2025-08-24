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
        const $ = cheerio.load(html);
        
        logger.info(`处理HTML请求: ${requestPath}`);
        
        // 移除CSP的meta标签
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $('meta[http-equiv="content-security-policy"]').remove();
        $('meta[name="content-security-policy"]').remove();
        logger.debug('已移除CSP meta标签');
        
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
                const authToken = 'mk-4A9944E6F3917711EFCF7B772BC3A5AE';
                
                // 立即设置授权信息 - 在React渲染之前完成
                try {
                    localStorage.setItem('uid', uid);
                    localStorage.setItem('sid', sid);
                    localStorage.setItem('token', authToken);
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('loginTime', Date.now().toString());
                    
                    // 设置cookies
                    document.cookie = 'uid=' + uid + '; path=/; domain=localhost; SameSite=Lax';
                    document.cookie = 'sid=' + sid + '; path=/; domain=localhost; SameSite=Lax';
                    document.cookie = 'isLoggedIn=true; path=/; domain=localhost; SameSite=Lax';
                    document.cookie = 'token=' + authToken + '; path=/; domain=localhost; SameSite=Lax';
                    
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
                                    const newUrl = url.replace('https://metaso.cn', 'http://localhost:10101');
                                    authLog('拦截fetch请求:', url);
                                    
                            // 确保请求头包含必要的认证信息
                            const newOptions = {
                                ...options,
                                headers: {
                                    ...options?.headers,
                                    'Accept': 'application/json, text/plain, */*',
                                    'Content-Type': options?.headers?.['Content-Type'] || 'application/json',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    // 添加正确的认证相关头部
                                    'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',
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
                                        const newUrl = url.replace('https://metaso.cn', 'http://localhost:10101');
                                        authLog('拦截XHR请求:', url);
                                        
                                        // 设置认证头部
                                        xhr.setRequestHeader = function(name, value) {
                                            return originalXHR.prototype.setRequestHeader.call(this, name, value);
                                        };
                                        
                                        const result = originalOpen.call(this, method, newUrl, async !== false, user, password);
                                        
                        // 添加认证头部
                        try {
                            this.setRequestHeader('Authorization', 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE');
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
                                        config.url = config.url.replace('https://metaso.cn', 'http://localhost:10101');
                                        config.headers = {
                                            ...config.headers,
                                            'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',
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
        
        // 禁用服务端CSS注入，避免影响React hydration
        // 微信元素隐藏将在客户端React hydration完成后处理
        logger.info('跳过服务端CSS注入以避免React hydration冲突');
        
        // 添加页面优化CSS - 通过服务端注入，避免客户端DOM操作
        const pageOptimizationCSS = `
            <style id="page-optimization-css">
                /* 页面优化样式 - 服务端注入避免React hydration冲突 */
                /* 1. 隐藏侧边栏 - 包含实际的metaso.cn侧边栏类名 */
                .sidebar,
                .side-bar,
                .left-sidebar,
                .right-sidebar,
                [class*="sidebar"],
                [class*="side-bar"],
                [id*="sidebar"],
                [id*="side-bar"],
                aside,
                nav[class*="side"],
                .navigation-sidebar,
                .app-sidebar,
                .main-sidebar,
                /* metaso.cn实际侧边栏类名 */
                [class*="LeftMenu_"],
                .left-menu,
                [class*="LeftMenu_content"],
                [class*="LeftMenu_footer"],
                [class*="LeftMenu_header"],
                [class*="LeftMenu_logo-btn"],
                [class*="LeftMenu_menu-container"],
                [class*="LeftMenu_menu"],
                [class*="LeftMenu_sidebar-action"],
                [class*="LeftMenu_back-btn"]
                { 
                    display: none !important; 
                    width: 0 !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    position: absolute !important;
                    left: -9999px !important;
                    overflow: hidden !important;
                }
                
                /* 2. 隐藏特定广告链接 */
                a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
                a[href*="AKYOZfBM_Ph0OiIj_8lCeg"],
                [data-href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"],
                [href*="3分钱，秘塔搜索 API 上线"],
                [title*="3分钱，秘塔搜索 API 上线"] {
                    display: none !important;
                    width: 0 !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    position: absolute !important;
                    left: -9999px !important;
                }
                
                /* 3. 隐藏apple-touch-icon图标 */
                link[rel="apple-touch-icon"][data-hidden="true"],
                link[href*="apple-touch-icon.png"],
                img[src*="apple-touch-icon.png"] {
                    width: 0 !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    display: none !important;
                }
                
                /* 4. 隐藏包含特定文本的元素 */
                *:contains("3分钱，秘塔搜索 API 上线"),
                *:contains("没有广告，直达结果") {
                    display: none !important;
                    visibility: hidden !important;
                }
                
                /* 5. 扩展主内容区域以填补侧边栏空间 */
                .main-content,
                .content-area,
                .page-content,
                main,
                .app-main,
                [class*="main"],
                [class*="content"] {
                    width: 100% !important;
                    max-width: 100% !important;
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                    padding-left: 20px !important;
                    padding-right: 20px !important;
                }
                
                /* 6. 确保布局适应性 */
                .container,
                .app-container,
                .page-container {
                    width: 100% !important;
                    max-width: 100% !important;
                }
                /* 7. 微信登录元素隐藏 - 继续保持 */
                .wechat-login-container,
                #wechat-login,
                [class*="wechat"],
                [id*="wechat"],
                img[src*="qrcode"],
                [class*="qrcode"],
                [id*="qrcode"] { 
                    opacity: 0 !important; 
                    pointer-events: none !important; 
                    position: absolute !important;
                    left: -9999px !important;
                    display: none !important;
                }
            </style>
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
        
        // 精确自动搜索脚本 v3.0 - 基于真实用户行为流程
        const autoSearchScript = `
            <script>
                // 精确自动搜索脚本 v3.0
                (function() {
                    'use strict';
                    
                    const SCRIPT_VERSION = '3.0';
                    const DEBUG_PREFIX = '🎯 [PreciseAutoSearch-v' + SCRIPT_VERSION + ']';
                    
                    ////console.log(DEBUG_PREFIX + ' 精确自动搜索脚本已加载');
                    
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
                        return 'AI';
                        
                    }
                    
                    // 检查是否应该执行自动搜索（包括后台搜索）
                    function shouldExecuteAutoSearch() {
                        const urlParams = new URLSearchParams(window.location.search);
                        const hasQParam = urlParams.get('q');
                        
                        // 如果有q参数，允许执行
                        if (hasQParam) {
                            log('检测到搜索参数，允许执行自动搜索', { hasQSearch, hasQParam });
                            return true;
                        }
                        
                        // 检查是否已执行过
                        if (sessionStorage.getItem('preciseAutoSearchExecuted_v3')) {
                            log('跳过: 已执行过自动搜索');
                            return false;
                        }
                        
                        const path = window.location.pathname;
                        const search = window.location.search;
                        
                        // 在首页或搜索页面
                        const isHomePage = (path === '/' || path === '');
                        const isSearchPage = path.includes('/search/');
                        
                        // 有搜索查询参数
                        const hasSearchQuery = getSearchQuery() !== null;
                        
                        // 不在结果页面（避免在结果页面重复执行）
                        const notInResults = !search.includes('q=') || search.includes('/search/id');
                        
                        const shouldExecute = (isHomePage || isSearchPage) && hasSearchQuery && notInResults;
                        
                        log('执行条件检查:', {
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
                                // console.log('🔍 [AutoSearch-Enhanced] 查找尝试 ' + attempts + '/' + maxAttempts);
                                
                                for (let i = 0; i < selectors.length; i++) {
                                    const selector = selectors[i];
                                    const elements = document.querySelectorAll(selector);
                                    
                                    // console.log('🔍 [AutoSearch-Enhanced] 测试选择器: ' + selector + ' (找到 ' + elements.length + ' 个元素)');
                                    
                                    if (elements.length > 0) {
                                        // 选择第一个可见且可用的元素
                                        for (let j = 0; j < elements.length; j++) {
                                            const element = elements[j];
                                            const rect = element.getBoundingClientRect();
                                            //return first element
                                            const isVisible = true;  
                                            
                                            if (isVisible) {
                                                // console.log('✅ [AutoSearch-Enhanced] 找到可见元素: ' + selector + ' (第' + (j+1) + '个)');
                                                // console.log('🔧 [AutoSearch-Enhanced] 元素信息:', {
                                                //     tagName: element.tagName,
                                                //     className: element.className,
                                                //     id: element.id,
                                                //     type: element.type,
                                                //     disabled: element.disabled,
                                                //     textContent: element.textContent?.trim().substring(0, 50)
                                                // });
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
                                
                                // console.log('✅ [AutoSearch-Enhanced] 输入值设置完成，当前值:', element.value);
                                // console.log('🔍 [AutoSearch-Enhanced] 元素状态检查:', {
                                //     value: element.value,
                                //     disabled: element.disabled,
                                //     readOnly: element.readOnly,
                                //     placeholder: element.placeholder
                                // });
                            }, 100);
                            
                        } catch (error) {
                            // console.error('❌ [AutoSearch-Enhanced] 输入值设置失败:', error);
                            // Fallback: 简单设置
                            element.value = value;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                    
                    // 增强的点击模拟
                    function clickElement(element) {
                        // console.log('🖱️ [AutoSearch-Enhanced] 开始点击元素');
                        // console.log('🖱️ [AutoSearch-Enhanced] 点击元素详情:', {
                        //     tagName: element.tagName,
                        //     className: element.className,
                        //     id: element.id,
                        //     type: element.type,
                        //     disabled: element.disabled,
                        //     offsetWidth: element.offsetWidth,
                        //     offsetHeight: element.offsetHeight
                        // });
                        
                        try {
                            // 确保元素可见
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // 等待滚动完成
                            setTimeout(() => {
                                // 多种点击方式
                                try {
                                    // 方式1: 聚焦+原生点击
                                    //element.focus();
                                    element.click();
                                    // console.log('✅ [AutoSearch-Enhanced] 原生click()已执行');
                                } catch (e) {
                                    // console.warn('⚠️ [AutoSearch-Enhanced] 原生click()失败:', e);
                                }
                                
                                try {
                                    // 方式2: 鼠标事件序列
                                    const rect = element.getBoundingClientRect();
                                    const centerX = rect.left + rect.width / 2;
                                    const centerY = rect.top + rect.height / 2;
                                    
                                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                        const mouseEvent = new MouseEvent(eventType, {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window,
                                            clientX: centerX,
                                            clientY: centerY,
                                            button: 0
                                        });
                                        element.dispatchEvent(mouseEvent);
                                    });
                                    // console.log('✅ [AutoSearch-Enhanced] 鼠标事件序列已执行');
                                } catch (e) {
                                    // console.warn('⚠️ [AutoSearch-Enhanced] 鼠标事件失败:', e);
                                }
                                
                                try {
                                    // 方式3: 回车键触发 (如果是按钮)
                                    if (element.tagName === 'BUTTON') {
                                        const enterEvent = new KeyboardEvent('keydown', {
                                            bubbles: true,
                                            cancelable: true,
                                            key: 'Enter',
                                            code: 'Enter',
                                            keyCode: 13
                                        });
                                        element.dispatchEvent(enterEvent);
                                        // console.log('✅ [AutoSearch-Enhanced] 回车键事件已执行');
                                    }
                                } catch (e) {
                                    // console.warn('⚠️ [AutoSearch-Enhanced] 回车键事件失败:', e);
                                }
                                
                                try {
                                    // 方式4: 表单提交 (如果在表单内)
                                    const form = element.closest('form');
                                    if (form) {
                                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                                        // console.log('✅ [AutoSearch-Enhanced] 表单提交事件已执行');
                                    }
                                } catch (e) {
                                    // console.warn('⚠️ [AutoSearch-Enhanced] 表单提交失败:', e);
                                }
                                
                                // console.log('🎯 [AutoSearch-Enhanced] 所有点击方式执行完成');
                            }, 100);                        } catch (e) {
                            // console.error('🖱️ [AutoSearch-Enhanced] 点击元素失败:', e);
                        }
                    }
                    
                    // === 新增：设置搜索参数（scope 和 kits）===
                    async function setupSearchParams(query) {
                        try {
                            console.log('🔧 [SearchParams] 开始设置搜索参数');
                            
                            // 获取URL参数
                            const urlParams = new URLSearchParams(window.location.search);
                            const scope = urlParams.get('scope') || '全网';  // 默认值：全网
                            const kits = urlParams.get('kits') || '极速';   // 默认值：极速
                            
                            console.log('🔧 [SearchParams] 参数设置:', { scope, kits });
                            
                            // === 保存参数到sessionStorage和Cookie，供API拦截器使用 ===
                            if (scope && scope !== '全网') {
                                sessionStorage.setItem('metaso_search_scope', scope);
                                document.cookie = 'metaso_search_scope=' + encodeURIComponent(scope) + '; path=/; SameSite=Lax';
                                console.log('💾 [SearchParams] 保存scope到sessionStorage和Cookie:', scope);
                            } else {
                                sessionStorage.removeItem('metaso_search_scope');
                                document.cookie = 'metaso_search_scope=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            }
                            
                            if (kits && kits !== '极速') {
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
                                if (kits && kits !== '极速') {
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
                            
                            // 等待搜索方法元素加载  
                            await setupKits(kits);
                            
                            console.log('✅ [SearchParams] 搜索参数设置完成');
                            
                        } catch (error) {
                            console.error('❌ [SearchParams] 设置失败:', error);
                        }
                    }
                    
                    // 设置搜索范围 (scope)
                    async function setupScope(scope) {
                        try {
                            console.log('🔧 [SearchParams] 设置搜索范围:', scope);
                            
                            // 如果是默认值"全网"，跳过设置
                            if (!scope || scope === '全网') {
                                console.log('✅ [SearchParams] 使用默认搜索范围: 全网');
                                return;
                            }
                            
                            // 等待页面元素加载
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // 首先尝试搜索域标签按钮 (全网、文库、学术等)
                            const domainTabSelectors = [
                                'button.search-domain-kits_search-domain-tab__4O_vu',
                                'button[class*="search-domain-tab"]',
                                'button[role="tab"]'
                            ];
                            
                            console.log('[SearchParams] 搜索域标签按钮...');
                            let targetTab = null;
                            
                            for (const selector of domainTabSelectors) {
                                try {
                                    const tabs = document.querySelectorAll(selector);
                                    console.log('[SearchParams] 找到 ' + tabs.length + ' 个域标签 (' + selector + ')');
                                    
                                    for (const tab of tabs) {
                                        const tabText = tab.textContent && tab.textContent.trim();
                                        console.log('  - 域标签文本: "' + tabText + '"');
                                        
                                        if (tabText === scope) {
                                            targetTab = tab;
                                            console.log('🎯 [SearchParams] 找到目标域标签:', scope);
                                            break;
                                        }
                                    }
                                    
                                    if (targetTab) break;
                                } catch (e) {
                                    console.warn('[SearchParams] 域标签选择器错误 ' + selector + ':', e.message);
                                }
                            }
                            
                            // 如果没找到域标签，尝试专题标签 (泥沙知识等)
                            if (!targetTab) {
                                console.log('[SearchParams] 未找到域标签，尝试专题标签...');
                                const subjectSelectors = [
                                    '.subject_tag__Y3JPF div',
                                    '.MuiBox-root.css-1325aup',
                                    'div[class*="subject_tag"]',
                                    'li[role="menuitem"] div'
                                ];
                                
                                for (const selector of subjectSelectors) {
                                    try {
                                        const subjects = document.querySelectorAll(selector);
                                        console.log('[SearchParams] 找到 ' + subjects.length + ' 个专题 (' + selector + ')');
                                        
                                        for (const subject of subjects) {
                                            const subjectText = subject.textContent && subject.textContent.trim();
                                            console.log('  - 专题文本: "' + subjectText + '"');
                                            
                                            if (subjectText == scope) {
                                                targetTab = subject;
                                                console.log('🎯 [SearchParams] 找到目标专题:', scope);
                                                break;
                                            }
                                        }
                                        
                                        if (targetTab) break;
                                    } catch (e) {
                                        console.warn('[SearchParams] 专题选择器错误 ' + selector + ':', e.message);
                                    }
                                }
                            }
                            
                            if (targetTab) {
                                console.log('🔧 [SearchParams] 点击目标元素');
                                
                                try {
                                    // 确保元素可见且可点击
                                    if (targetTab.offsetParent !== null) {
                                        targetTab.click();
                                        console.log('✅ [SearchParams] 搜索范围设置成功:', scope);
                                        
                                        // 等待状态更新
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                        
                                        // === 新增：直接修改aria-label属性 ===
                                        console.log('🔧 [SearchParams] 开始更新aria-label属性...');
                                        const ariaLabelSelectors = [
                                            'button[aria-label*="范围:"]',
                                            'button[aria-label*="范围："]',
                                            'button.search-kits_append-setting-icon-button__HMlRQ[aria-label*="范围"]'
                                        ];
                                        
                                        for (const selector of ariaLabelSelectors) {
                                            try {
                                                const ariaButtons = document.querySelectorAll(selector);
                                                for (const button of ariaButtons) {
                                                    const oldLabel = button.getAttribute('aria-label');
                                                    if (oldLabel && oldLabel.includes('范围:')) {
                                                        const newLabel = '范围:' + scope;
                                                        button.setAttribute('aria-label', newLabel);
                                                        console.log('🔄 [SearchParams] 已更新aria-label: "' + oldLabel + '" → "' + newLabel + '"');
                                                    }
                                                }
                                            } catch (e) {
                                                console.warn('⚠️ [SearchParams] aria-label更新失败:', e.message);
                                            }
                                        }
                                        
                                    } else {
                                        console.warn('⚠️ [SearchParams] 目标元素不可见');
                                    }
                                } catch (e) {
                                    console.error('❌ [SearchParams] 点击元素失败:', e.message);
                                }
                            } else {
                                console.warn('⚠️ [SearchParams] 未找到目标范围:', scope);
                                
                                // 列出所有可用的选项
                                console.log('📋 [SearchParams] 可用的范围选项:');
                                const allTabs = document.querySelectorAll('button[role="tab"], .subject_tag__Y3JPF div, .MuiBox-root.css-1325aup');
                                for (const tab of allTabs) {
                                    if (tab.offsetParent !== null) {
                                        const text = tab.textContent && tab.textContent.trim();
                                        if (text && text.length < 20) {
                                            console.log('  - "' + text + '" (' + tab.className + ')');
                                        }
                                    }
                                }
                            }
                            
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
                            if (kits && kits !== '极速') {
                                finalKits = '极速·思考';
                            }
                            
                            console.log('🔧 [SearchParams] 最终搜索方法:', finalKits);
                            
                            // 查找搜索方法元素的选择器
                            const kitsSelectors = [
                                'div.search-kits_active-range-name__nArNX.MuiBox-root.css-2wnx08',
                                'div[class*="search-kits_active-range-name__nArNX"][class*="css-2wnx08"]',
                                'div[class*="search-kits_active-range-name"]'
                            ];
                            
                            // 等待元素出现
                            const kitsElement = await findElement(kitsSelectors, 20);
                            
                            if (kitsElement) {
                                // 设置文本内容
                                kitsElement.textContent = finalKits;
                                kitsElement.innerText = finalKits;
                                
                                // 触发相关事件
                                kitsElement.dispatchEvent(new Event('click', { bubbles: true }));
                                kitsElement.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                console.log('✅ [SearchParams] 搜索方法设置成功:', finalKits);
                            } else {
                                console.warn('⚠️ [SearchParams] 未找到搜索方法元素，使用默认值');
                            }
                            
                        } catch (error) {
                            console.error('❌ [SearchParams] 设置搜索方法失败:', error);
                        }
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
                            
                            // 执行搜索操作
                            console.log('📝 [AutoSearch-Fallback] 开始输入搜索内容: ' + query);
                            setInputValue(searchBox, query);
                            
                            // 等待React状态更新
                            await new Promise(resolve => setTimeout(resolve, 100));
                            
                            // 检查并强制启用按钮
                            if (sendButton.disabled || sendButton.hasAttribute('disabled')) {
                                console.log('🔧 [AutoSearch-Fallback] 按钮被禁用，强制启用...');
                                sendButton.disabled = false;
                                sendButton.removeAttribute('disabled');
                                sendButton.classList.remove('Mui-disabled');
                                sendButton.removeAttribute('tabindex');
                            }
                            
                            // 再次触发输入事件确保状态更新
                            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            //console.log('🖱️ [AutoSearch-Fallback] 开始点击发送按钮...');
                            clickElement(sendButton);
                            
                            //console.log('✅ [AutoSearch-Fallback] UI搜索完成');
                            return true;
                            
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
                            
                            // q参数执行UI自动搜索
                            if (qQuery) {
                                // 清除之前的session标记，允许重新执行
                                sessionStorage.removeItem('preciseAutoSearchExecuted_v3');
                                console.log('🔄 [AutoSearch] 清除session标记，准备执行搜索:', qQuery);
                                
                                // === 处理 scope 和 kits 参数 ===
                                await setupSearchParams();
                                
                                console.log('🎯 [AutoSearch] 检测到q参数，执行UI自动搜索:', qQuery);
                                
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
                            
                            // 确定搜索查询内容 qQuery ;
                            
                            // 查找搜索框
                            //console.log('🔍 [AutoSearch-Enhanced] 开始查找搜索框...');
                            const searchSelectors = [
                                'textarea.search-consult-textarea.search-consult-textarea_search-consult-textarea__kjgyz',
                                'textarea.search-consult-textarea',
                                'textarea[class*="search-consult-textarea"]'                               
                            ];
                            
                            const searchBox = await findElement(searchSelectors);
                            //console.log('✅ [AutoSearch-Enhanced] 搜索框查找成功');
                            
                             
                            // 查找发送按钮
                            //console.log('🔍 [AutoSearch-Enhanced] 开始查找发送按钮...');
                            const buttonSelectors = [
                                'button.MuiButtonBase-root.MuiIconButton-root.MuiIconButton-sizeMedium.send-arrow-button.css-1rab04c',
                                'button'
                            ];
                            
                            const sendButton = await findElement(buttonSelectors);
                            //console.log('✅ [AutoSearch-Enhanced] 发送按钮查找成功');
                            
                            // 执行搜索操作 - 使用动态搜索内容
                            //console.log('📝 [AutoSearch-Enhanced] 开始输入搜索内容: ' + qQuery);
                            setInputValue(searchBox, qQuery);
                            
                            // 等待React状态更新
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // 检查并强制启用按钮
                            if (sendButton.disabled || sendButton.hasAttribute('disabled')) {
                                console.log('🔧 [AutoSearch-Enhanced] 按钮被禁用，强制启用...');
                                sendButton.disabled = false;
                                sendButton.removeAttribute('disabled');
                                sendButton.classList.remove('Mui-disabled');
                                sendButton.removeAttribute('tabindex');
                            }
                            
                            // 再次触发输入事件确保状态更新
                            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            console.log('🖱️ [AutoSearch] 开始点击发送按钮...');
                            clickElement(sendButton);
                            
                            console.log('✅ [AutoSearch] 自动搜索完成');
                            
                            // 标记已执行，避免重复 - 只在搜索成功完成后设置
                            sessionStorage.setItem('preciseAutoSearchExecuted_v3', 'true');
                            
                        } catch (error) {
                            console.error('❌ [AutoSearch] 执行失败:', error);
                            // 如果失败，清除标记，允许重试
                            sessionStorage.removeItem('preciseAutoSearchExecuted_v3');
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
    
    if (kits && kits !== '极速') {
        const encodedKits = encodeURIComponent(kits);
        req.headers['x-search-kits'] = encodedKits;
        console.log('🎯 [API拦截] 设置kits头:', kits, '(编码后:', encodedKits, ')');
    }
    
    // 继续到代理中间件
    next();
});

// 创建代理中间件，目标为 https://metaso.cn
app.use('/', proxy('https://metaso.cn', {
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        //console.log('\\n=== 处理响应头 ' + userReq.path + ' ===');
        //console.log('原始响应头:', Object.keys(headers));
        
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
        console.log('Content-Type:', contentType);
        console.log('数据大小:', proxyResData.length);
        
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
        
        // 如果有scope或kits参数，确保它们被传递到目标URL
        let targetPath = req.path;
        const queryParams = new URLSearchParams();
        
        // 保留所有原始查询参数
        for (const [key, value] of Object.entries(req.query)) {
            queryParams.set(key, value);
            console.log(`📋 保留参数: ${key} = ${value}`);
        }
        
        // 如果有查询参数，构建完整的查询字符串
        if (queryParams.toString()) {
            targetPath = `${req.path}?${queryParams.toString()}`;
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
            
            if (kits && kits !== '极速') {
                const decodedKits = decodeURIComponent(kits);
                proxyReqOpts.headers['X-Search-Kits'] = encodeURIComponent(decodedKits);
                console.log('🎯 [API拦截] 注入kits参数:', decodedKits);
            }
        }
        
        // 对 /search/ 请求，始终带上认证信息和本地静态资源拦截
        if (srcReq.path.includes('/search/')) {
            // 认证信息
            proxyReqOpts.headers['Authorization'] = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
            proxyReqOpts.headers['X-User-ID'] = GLOBAL_UID;
            proxyReqOpts.headers['X-Session-ID'] = GLOBAL_SID;
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            // Cookie 认证
            const authCookies = [
                `uid=${GLOBAL_UID}`,
                `sid=${GLOBAL_SID}`,
                'isLoggedIn=true',
                'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE'
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
            
            // 日志
            console.log('已为/search/请求处理:', srcReq.path, '完整URL:', targetPath);

        } else if (srcReq.path.includes('/api/') || srcReq.path.includes('/login/')) {
            // 其他API同原逻辑
            proxyReqOpts.headers['Authorization'] = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
            proxyReqOpts.headers['X-User-ID'] = GLOBAL_UID;
            proxyReqOpts.headers['X-Session-ID'] = GLOBAL_SID;
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            const authCookies = [
                `uid=${GLOBAL_UID}`,
                `sid=${GLOBAL_SID}`,
                'isLoggedIn=true',
                'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE'
            ];
            proxyReqOpts.headers['Cookie'] = authCookies.join('; ');
            console.log('已为API请求 ' + srcReq.path + ' 添加认证信息 (Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE)');
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
                            scholarSearchDomain: '8633749827795091456', // 与"学习"共用ID，可能是同一个分类
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
    // 已移除 metaso.cn_files 相关的静态资源加载和路径替换逻辑
    logger.info('已移除 metaso.cn_files 相关的静态资源加载逻辑');
});

app.on('error', (err) => {
    logger.error('服务器错误:', err);
});

module.exports = app;