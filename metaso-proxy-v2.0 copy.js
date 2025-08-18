const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

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
                        console.log(logPrefix, '=== 超级React安全授权脚本 (页面: ${requestPath}) ===', ...args);
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
                             error.message.includes('Minified React error #423'))) {
                            authLog('拦截React hydration错误:', error.message);
                            // 返回一个无害的错误对象
                            const safeError = new originalError('React hydration error intercepted and handled');
                            safeError.name = 'HandledReactError';
                            return safeError;
                        }
                        return error;
                    };
                    
                    // 全局错误处理器 - 特别处理React错误
                    window.addEventListener('error', function(event) {
                        if (event.error && event.error.message) {
                            const message = event.error.message;
                            
                            // 拦截React hydration错误 #418/#423
                            if (message.includes('Minified React error #418') || 
                                message.includes('Minified React error #423')) {
                                authLog('全局拦截React hydration错误:', message);
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
                                message.includes('Minified React error #423')) {
                                authLog('拦截未处理的React Promise错误:', message);
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
                const uid = '68775c6659a307e8ac864bf6';
                const sid = 'e5874318e9ee41788605c88fbe43ab19';
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
                                    'X-User-ID': '68775c6659a307e8ac864bf6',
                                    'X-Session-ID': 'e5874318e9ee41788605c88fbe43ab19'
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
                            this.setRequestHeader('X-User-ID', '68775c6659a307e8ac864bf6');
                            this.setRequestHeader('X-Session-ID', 'e5874318e9ee41788605c88fbe43ab19');
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
                                            'X-User-ID': '68775c6659a307e8ac864bf6',
                                            'X-Session-ID': 'e5874318e9ee41788605c88fbe43ab19'
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
                        const maxChecks = 100; // 增加到10秒
                        
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
                            setTimeout(optimizeResourcesAfterLoad, 3000); // React稳定后再等3秒
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
                                return originalConsoleError.apply(console, args);
                            };
                            
                            // 抑制Source Map警告
                            const originalConsoleWarn = console.warn;
                            console.warn = function(...args) {
                                const message = args.join(' ');
                                if (message.includes('Source map error') || 
                                    message.includes('sourceMappingURL') ||
                                    message.includes('.map')) {
                                    return; // 不显示这些警告
                                }
                                return originalConsoleWarn.apply(console, args);
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
                            
                            // 确保在页面完全加载后再执行UI优化
                            ensurePageCompletelyLoaded().then(() => {
                                // 添加UI优化功能 - 在页面完全加载后执行
                                setTimeout(() => {
                                    initUIOptimization();
                                }, 1000); // 页面加载完成后再等1秒执行UI优化
                            });
                        } catch (e) {
                            console.log('iframe兼容性脚本执行失败:', e);
                        }
                    }
                    
                    // 页面完全加载检测函数
                    function ensurePageCompletelyLoaded() {
                        return new Promise((resolve) => {
                            console.log('=== 开始检测页面完全加载状态 ===');
                            
                            function checkPageLoadState() {
                                const isDocumentReady = document.readyState === 'complete';
                                const isWindowLoaded = document.readyState === 'complete' && 
                                                     performance.timing && 
                                                     performance.timing.loadEventEnd > 0;
                                
                                // 检查React/Next.js是否完全加载
                                const hasReactStableState = (() => {
                                    // 检查Next.js是否准备就绪
                                    if (window.__NEXT_DATA__ && window.next) {
                                        return window.next.router && window.next.router.isReady;
                                    }
                                    
                                    // 检查React是否稳定（没有pending状态）
                                    const reactPendingElements = document.querySelectorAll('[data-react-pending], [data-reactroot] *[data-loading]');
                                    return reactPendingElements.length === 0;
                                })();
                                
                                // 检查主要内容元素是否已渲染
                                const hasMainContent = document.querySelector('main, #__next, [data-reactroot], .app, .container') !== null;
                                
                                // 检查是否还有加载中的资源
                                const pendingImages = Array.from(document.images).filter(img => !img.complete);
                                const hasNoPendingImages = pendingImages.length === 0;
                                
                                console.log('[页面加载检测]', {
                                    documentReady: isDocumentReady,
                                    windowLoaded: isWindowLoaded,
                                    reactStable: hasReactStableState,
                                    hasMainContent: hasMainContent,
                                    noPendingImages: hasNoPendingImages,
                                    pendingImagesCount: pendingImages.length
                                });
                                
                                // 所有条件都满足时认为页面完全加载
                                if (isDocumentReady && hasMainContent && hasNoPendingImages) {
                                    console.log('[页面加载检测] 页面完全加载完成！');
                                    resolve();
                                    return true;
                                }
                                
                                return false;
                            }
                            
                            // 立即检查一次
                            if (checkPageLoadState()) {
                                return;
                            }
                            
                            // 如果document还未ready，先等待DOMContentLoaded
                            if (document.readyState === 'loading') {
                                document.addEventListener('DOMContentLoaded', () => {
                                    console.log('[页面加载检测] DOMContentLoaded事件触发');
                                    
                                    // DOMContentLoaded后继续检查
                                    const checkInterval = setInterval(() => {
                                        if (checkPageLoadState()) {
                                            clearInterval(checkInterval);
                                        }
                                    }, 200);
                                    
                                    // 设置最大等待时间 15秒
                                    setTimeout(() => {
                                        clearInterval(checkInterval);
                                        console.log('[页面加载检测] 等待超时，强制继续执行');
                                        resolve();
                                    }, 15000);
                                });
                            } else {
                                // 如果document已经ready，等待window.load
                                if (document.readyState === 'complete') {
                                    console.log('[页面加载检测] Document已完成，等待资源加载');
                                } else {
                                    console.log('[页面加载检测] Document交互中，等待完成');
                                }
                                
                                // 定期检查页面状态
                                const checkInterval = setInterval(() => {
                                    if (checkPageLoadState()) {
                                        clearInterval(checkInterval);
                                    }
                                }, 300);
                                
                                // 监听window.load事件
                                window.addEventListener('load', () => {
                                    console.log('[页面加载检测] Window load事件触发');
                                    setTimeout(() => {
                                        if (checkPageLoadState()) {
                                            clearInterval(checkInterval);
                                        }
                                    }, 500);
                                });
                                
                                // 设置最大等待时间 20秒
                                setTimeout(() => {
                                    clearInterval(checkInterval);
                                    console.log('[页面加载检测] 等待超时，强制继续执行');
                                    resolve();
                                }, 20000);
                            }
                        });
                    }
                    
                    // UI优化函数 - 处理广告链接和元素隐藏
                    function initUIOptimization() {
                        console.log('=== 开始UI优化处理（页面加载完成后执行）===');
                        
                        function hideUnwantedElements() {
                            try {
                                // 进一步确认页面状态
                                if (document.readyState !== 'complete') {
                                    console.log('[UI优化] 页面尚未完全加载，等待中...');
                                    return false;
                                }
                                
                                // 检查主要内容是否已渲染
                                const mainContent = document.querySelector('main, #__next, [data-reactroot], .app, body > div');
                                if (!mainContent) {
                                    console.log('[UI优化] 主要内容尚未渲染，等待中...');
                                    return false;
                                }
                                
                                let hiddenCount = 0;
                                console.log('[UI优化] 开始执行元素隐藏操作...');
                                
                                // 1. 隐藏侧边栏 - 使用更精确的选择器，包含metaso.cn实际类名
                                const sidebarSelectors = [
                                    '.sidebar', '.side-bar', '.left-sidebar', '.right-sidebar',
                                    '[class*="sidebar"]', '[class*="side-bar"]', '[id*="sidebar"]', '[id*="side-bar"]',
                                    'aside', 'nav[class*="side"]', '.navigation-sidebar', '.app-sidebar', '.main-sidebar',
                                    // 添加更多可能的侧边栏选择器
                                    '.layout-sidebar', '.page-sidebar', '.content-sidebar', '.drawer', '.side-panel',
                                    // metaso.cn实际侧边栏选择器
                                    '[class*="LeftMenu_"]', '.left-menu',
                                    '[class*="LeftMenu_content"]', '[class*="LeftMenu_footer"]', '[class*="LeftMenu_header"]',
                                    '[class*="LeftMenu_logo-btn"]', '[class*="LeftMenu_menu-container"]', '[class*="LeftMenu_menu"]',
                                    '[class*="LeftMenu_sidebar-action"]', '[class*="LeftMenu_back-btn"]'
                                ];
                                
                                sidebarSelectors.forEach(selector => {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        if (el && !el.hasAttribute('data-ui-hidden')) {
                                            el.style.cssText = 'display: none !important; width: 0 !important; height: 0 !important; opacity: 0 !important; visibility: hidden !important; position: absolute !important; left: -9999px !important; overflow: hidden !important;';
                                            el.setAttribute('data-ui-hidden', 'sidebar');
                                            hiddenCount++;
                                            console.log('[UI优化] 隐藏侧边栏元素:', el.className || el.id || el.tagName);
                                        }
                                    });
                                });
                                
                                // 2. 隐藏特定的微信广告链接
                                const wechatAdSelectors = [
                                    'a[href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]',
                                    'a[href*="AKYOZfBM_Ph0OiIj_8lCeg"]',
                                    '[data-href*="mp.weixin.qq.com/s/AKYOZfBM_Ph0OiIj_8lCeg"]'
                                ];
                                
                                wechatAdSelectors.forEach(selector => {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        if (el && !el.hasAttribute('data-ui-hidden')) {
                                            el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; position: absolute !important; left: -9999px !important;';
                                            el.setAttribute('data-ui-hidden', 'wechat-ad');
                                            hiddenCount++;
                                            console.log('[UI优化] 隐藏微信广告链接:', el.href || el.outerHTML.substring(0, 100));
                                        }
                                    });
                                });
                                
                                // 3. 通过文本内容查找并隐藏包含特定文本的链接
                                const allLinks = document.querySelectorAll('a');
                                allLinks.forEach(link => {
                                    if (link.hasAttribute('data-ui-hidden')) return; // 跳过已处理的元素
                                    
                                    const linkText = link.textContent ? link.textContent.trim() : '';
                                    const linkTitle = link.title ? link.title.trim() : '';
                                    
                                    if (linkText.includes('3分钱，秘塔搜索 API 上线') ||
                                        linkText.includes('API 上线') ||
                                        linkTitle.includes('3分钱，秘塔搜索 API 上线')) {
                                        
                                        link.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; position: absolute !important; left: -9999px !important;';
                                        link.setAttribute('data-ui-hidden', 'text-ad');
                                        hiddenCount++;
                                        console.log('[UI优化] 通过文本隐藏广告链接:', linkText);
                                    }
                                });
                                
                                // 4. 隐藏包含特定文本的任何元素（叶子节点）
                                const textElementsToHide = [
                                    '没有广告，直达结果',
                                    '3分钱，秘塔搜索 API 上线'
                                ];
                                
                                textElementsToHide.forEach(targetText => {
                                    try {
                                        // 使用XPath查找包含确切文本的元素
                                        const xpath = '//text()[contains(., "' + targetText + '")]/parent::*[not(child::*)]';
                                        const result = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
                                        
                                        for (let i = 0; i < result.snapshotLength; i++) {
                                            const el = result.snapshotItem(i);
                                            if (el && !el.hasAttribute('data-ui-hidden')) {
                                                el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important;';
                                                el.setAttribute('data-ui-hidden', 'text-content');
                                                hiddenCount++;
                                                console.log('[UI优化] 隐藏文本元素:', el.textContent.trim());
                                            }
                                        }
                                    } catch (xpathError) {
                                        console.log('[UI优化] XPath查找失败，使用备用方案:', xpathError.message);
                                        // 备用方案：简单文本查找
                                        const allElements = document.querySelectorAll('*');
                                        allElements.forEach(el => {
                                            if (el.textContent && el.children.length === 0 && !el.hasAttribute('data-ui-hidden')) {
                                                if (el.textContent.trim() === targetText) {
                                                    el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important;';
                                                    el.setAttribute('data-ui-hidden', 'text-content-fallback');
                                                    hiddenCount++;
                                                    console.log('[UI优化] 隐藏文本元素(备用):', el.textContent.trim());
                                                }
                                            }
                                        });
                                    }
                                });
                                
                                // 5. 隐藏apple-touch-icon图标 - 设置尺寸为0
                                const iconSelectors = [
                                    'link[rel="apple-touch-icon"]',
                                    'link[href*="apple-touch-icon.png"]',
                                    'img[src*="apple-touch-icon.png"]'
                                ];
                                
                                iconSelectors.forEach(selector => {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        if (el && !el.hasAttribute('data-ui-hidden')) {
                                            if (el.tagName.toLowerCase() === 'link') {
                                                // 对于link标签，设置sizes为0x0
                                                el.setAttribute('sizes', '0x0');
                                                el.style.cssText = 'display: none !important;';
                                            } else {
                                                // 对于img标签，设置width和height为0
                                                el.style.cssText = 'width: 0 !important; height: 0 !important; opacity: 0 !important; visibility: hidden !important; display: none !important;';
                                            }
                                            el.setAttribute('data-ui-hidden', 'apple-icon');
                                            hiddenCount++;
                                            console.log('[UI优化] 隐藏apple-touch-icon:', el.outerHTML.substring(0, 100));
                                        }
                                    });
                                });
                                
                                // 6. 隐藏微信登录相关元素
                                const wechatSelectors = [
                                    '.wechat-login-container', '#wechat-login',
                                    '[class*="wechat"]', '[id*="wechat"]',
                                    'img[src*="qrcode"]', '[class*="qrcode"]', '[id*="qrcode"]',
                                    // 添加更多微信相关选择器
                                    '[class*="weixin"]', '[id*="weixin"]', '.wx-login', '.weixin-login'
                                ];
                                
                                wechatSelectors.forEach(selector => {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(el => {
                                        if (el && !el.hasAttribute('data-ui-hidden')) {
                                            el.style.cssText = 'opacity: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; display: none !important; visibility: hidden !important;';
                                            el.setAttribute('data-ui-hidden', 'wechat');
                                            hiddenCount++;
                                            console.log('[UI优化] 隐藏微信元素:', el.className || el.id || el.tagName);
                                        }
                                    });
                                });
                                
                                // 7. 调整主内容区域布局（如果隐藏了侧边栏）
                                if (hiddenCount > 0) {
                                    const mainContentSelectors = [
                                        '.main-content', '.content-area', '.page-content',
                                        'main', '.app-main', '[class*="main"]', '[class*="content"]'
                                    ];
                                    
                                    mainContentSelectors.forEach(selector => {
                                        const elements = document.querySelectorAll(selector);
                                        elements.forEach(el => {
                                            if (el && !el.hasAttribute('data-ui-layout-adjusted')) {
                                                // 扩展主内容区域
                                                el.style.cssText += 'width: 100% !important; max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important;';
                                                el.setAttribute('data-ui-layout-adjusted', 'true');
                                                console.log('[UI优化] 调整主内容区域布局:', el.className || el.id);
                                            }
                                        });
                                    });
                                }
                                
                                if (hiddenCount > 0) {
                                    console.log('[UI优化] 元素隐藏完成，共处理 ' + hiddenCount + ' 个元素');
                                    return true;
                                } else {
                                    console.log('[UI优化] 本次检查未发现需要隐藏的元素');
                                    return false;
                                }
                                
                            } catch (error) {
                                console.error('[UI优化] 隐藏元素时出错:', error);
                                return false;
                            }
                        }
                        
                        // 立即执行一次
                        hideUnwantedElements();
                        
                        // 设置定期检查，处理动态加载的内容（频率降低，避免性能影响）
                        let checkCount = 0;
                        const maxChecks = 20; // 最多检查20次
                        
                        const checkInterval = setInterval(() => {
                            checkCount++;
                            const hasHidden = hideUnwantedElements();
                            
                            console.log('[UI优化] 定期检查 #' + checkCount + ', 发现新元素:', hasHidden);
                            
                            // 如果检查次数达到上限，或者连续3次没有发现新元素
                            if (checkCount >= maxChecks || (checkCount > 3 && !hasHidden)) {
                                clearInterval(checkInterval);
                                console.log('[UI优化] 停止定期检查，设置长期监控');
                                
                                // 设置更低频率的长期监控
                                setInterval(() => {
                                    const hasNewElements = hideUnwantedElements();
                                    if (hasNewElements) {
                                        console.log('[UI优化] 长期监控发现新元素并已处理');
                                    }
                                }, 15000); // 每15秒检查一次
                            }
                        }, 2000); // 每2秒检查一次
                        
                        console.log('[UI优化] 初始化完成，已设置页面加载后的动态监控');
                    }
                    
                    // 延迟执行，确保不干扰React hydration
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => {
                            setTimeout(safeIframeInit, 500);
                        });
                    } else {
                        setTimeout(safeIframeInit, 500);
                    }
                })();
            </script>
        `;
        $('head').append(iframeScript);
        console.log('已注入iframe兼容性脚本');
        
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
    
    // 代理请求选项
    proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
        // 设置合适的请求头
        proxyReqOpts.headers = proxyReqOpts.headers || {};
        proxyReqOpts.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        proxyReqOpts.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        proxyReqOpts.headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
        
        // 为API请求添加认证信息
        if (srcReq.path.includes('/api/') || srcReq.path.includes('/login/') || srcReq.path.includes('/search/')) {
            proxyReqOpts.headers['Authorization'] = 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE';
            proxyReqOpts.headers['X-User-ID'] = '68775c6659a307e8ac864bf6';
            proxyReqOpts.headers['X-Session-ID'] = 'e5874318e9ee41788605c88fbe43ab19';
            proxyReqOpts.headers['X-Requested-With'] = 'XMLHttpRequest';
            
            // 设置Cookie认证
            const authCookies = [
                'uid=68775c6659a307e8ac864bf6',
                'sid=e5874318e9ee41788605c88fbe43ab19', 
                'isLoggedIn=true',
                'token=mk-4A9944E6F3917711EFCF7B772BC3A5AE'
            ];
            proxyReqOpts.headers['Cookie'] = authCookies.join('; ');
            
            console.log('已为API请求 ' + srcReq.path + ' 添加认证信息 (Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE)');
        }
        
        console.log('\\n=== 代理请求 ' + srcReq.path + ' ===');
        console.log('目标URL:', proxyReqOpts.href);
        
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
