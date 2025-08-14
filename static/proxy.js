// Client-side proxy script to handle URL rewriting and form submissions
(function() {
    'use strict';
    
    // Get the current proxy URL to determine the target domain
    const getCurrentProxyInfo = () => {
        const currentUrl = window.location.href;
        const proxyMatch = currentUrl.match(/\/proxy\/(.+)/);
        if (proxyMatch) {
            const targetUrl = decodeURIComponent(proxyMatch[1]);
            try {
                const url = new URL(targetUrl);
                return {
                    targetOrigin: url.origin,
                    targetHost: url.host,
                    proxyBase: window.location.origin + '/proxy/'
                };
            } catch (e) {
                console.error('Failed to parse target URL:', targetUrl, e);
            }
        }
        return null;
    };

    const proxyInfo = getCurrentProxyInfo();
    if (!proxyInfo) {
        console.warn('Could not determine proxy target from current URL');
        return;
    }

    console.log('Proxy script initialized for:', proxyInfo.targetOrigin);
    
    // 检测特定站点以应用特定规则
    const isSpecificSite = (host, siteName) => {
        return host && host.includes(siteName);
    };
    
    // 检测是否为静态资源
    const isStaticResource = (url) => {
        if (!url) return false;
        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
                              '.mp4', '.webp', '.woff', '.woff2', '.ttf', '.ico', '.json', '.xml'];
        const urlStr = url.toString().toLowerCase();
        return staticExtensions.some(ext => urlStr.endsWith(ext)) || 
               urlStr.includes('/static/') || 
               urlStr.includes('/assets/') || 
               urlStr.includes('/resources/') ||
               urlStr.includes('/images/');
    };
    
    // metaso.cn 特定处理
    const isMetaso = isSpecificSite(proxyInfo.targetHost, 'metaso.cn');
    if (isMetaso) {
        console.log('检测到 metaso.cn 站点，应用特殊处理规则');
        
        // 设置自动登录功能
        const setupAutoAuth = () => {
            console.log('开始设置 metaso.cn 自动认证');
            
            // 始终设置认证信息，无需检查登录按钮
            try {
                // 设置身份验证Cookie - 多域名支持
                document.cookie = "token=Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026; path=/;";
                document.cookie = "sid=f67f62dc1e26491db55770dbc2c93d32; path=/;";
                document.cookie = "uid=12345678; path=/;";
                // 也设置特定于metaso.cn的cookie
                document.cookie = "token=Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026; path=/; domain=metaso.cn";
                document.cookie = "sid=f67f62dc1e26491db55770dbc2c93d32; path=/; domain=metaso.cn";
                document.cookie = "uid=12345678; path=/; domain=metaso.cn";
                console.log('已成功设置认证Cookie');
                
                // 处理本地存储，确保身份验证信息保留
                try {
                    localStorage.setItem('metaso_token', 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026');
                    localStorage.setItem('metaso_sid', 'f67f62dc1e26491db55770dbc2c93d32');
                    localStorage.setItem('metaso_uid', '12345678');
                    localStorage.setItem('metaso_isLoggedIn', 'true');
                    console.log('已设置本地存储认证信息');
                } catch (storageError) {
                    console.warn('设置本地存储失败，但不影响主要功能:', storageError);
                }
                
                // 更强大的登录元素处理 - 隐藏任何登录按钮或登录相关元素
                const hideLoginElements = () => {
                    // 查找并隐藏所有可能的登录元素
                    const loginSelectors = [
                        '.login-btn', '.login', '[href*="login"]', '[onclick*="login"]',
                        '.wechat-login', '.qrcode-login', '.scan-login',
                        '.dialog', '.modal', '.popup', '.mask', '.overlay',
                        '[class*="login"]', '[class*="Login"]', '[class*="modal"]', '[class*="Modal"]',
                        '[class*="dialog"]', '[class*="Dialog"]', '[class*="popup"]', '[class*="Popup"]',
                        '[class*="mask"]', '[class*="overlay"]', '[class*="Overlay"]',
                        '[id*="login"]', '[id*="Login"]', '[id*="modal"]', '[id*="Modal"]',
                        '[id*="dialog"]', '[id*="Dialog"]', '[id*="popup"]', '[id*="Popup"]',
                        '[id*="mask"]', '[id*="overlay"]', '[id*="Overlay"]',
                        // 特定于微信登录的元素
                        '[class*="wechat"]', '[class*="WeChat"]', '[class*="qrcode"]', '[class*="QRCode"]',
                        '[id*="wechat"]', '[id*="WeChat"]', '[id*="qrcode"]', '[id*="QRCode"]'
                    ];
                    
                    const loginElements = document.querySelectorAll(loginSelectors.join(','));
                    loginElements.forEach(el => {
                        // 查找可能包含"登录"、"微信"、"扫码"等文本的元素
                        const text = el.innerText || el.textContent;
                        const isLoginRelated = text && (
                            text.includes('登录') || text.includes('微信') || 
                            text.includes('扫码') || text.includes('login') || 
                            text.includes('wechat') || text.includes('scan')
                        );
                        
                        // 如果是登录相关元素或匹配选择器，则隐藏
                        if (isLoginRelated || loginSelectors.some(s => el.matches(s))) {
                            if (el.style) {
                                el.style.display = 'none';
                                el.style.visibility = 'hidden';
                                el.style.opacity = '0';
                                el.style.pointerEvents = 'none'; // 防止点击
                            }
                            
                            // 移除事件监听器，防止弹出
                            el.onclick = null;
                            el.onmouseover = null;
                            el.onmouseenter = null;
                            
                            // 添加属性标记已处理
                            el.setAttribute('data-proxy-processed', 'true');
                            console.log('已隐藏登录相关元素:', el);
                        }
                    });
                    
                    // 检查并注入样式，确保内容可见并禁用登录弹窗
                    if (!document.getElementById('metaso-proxy-styles')) {
                        const style = document.createElement('style');
                        style.id = 'metaso-proxy-styles';
                        style.textContent = `
                            /* 确保内容可见 */
                            body, html { 
                                display: block !important; 
                                visibility: visible !important;
                                opacity: 1 !important;
                                overflow: auto !important;
                            }
                            /* 修复可能的样式问题 */
                            .MuiBox-root, [class*="MuiBox"], [class*="content"], 
                            main, article, section, .container, .wrapper {
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                            }
                            /* 隐藏所有可能的登录遮罩或弹窗 - 增强版 */
                            [class*="login"], [class*="Login"], [class*="auth"], [class*="Auth"], 
                            [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"],
                            [class*="popup"], [class*="Popup"], [class*="mask"], [class*="Mask"],
                            [class*="overlay"], [class*="Overlay"], [class*="wechat"], [class*="WeChat"],
                            [class*="weixin"], [class*="Weixin"], [class*="qrcode"], [class*="QRCode"], 
                            [class*="scan"], [class*="Scan"], [class*="layer"], [class*="Layer"] {
                                display: none !important;
                                visibility: hidden !important;
                                opacity: 0 !important;
                                pointer-events: none !important;
                                max-height: 0 !important;
                                max-width: 0 !important;
                                overflow: hidden !important;
                                position: absolute !important;
                                top: -9999px !important;
                                left: -9999px !important;
                                z-index: -9999 !important;
                                transform: scale(0) !important;
                            }
                            
                            /* 专门针对微信登录模态框的增强处理 */
                            [class*="wechat"], [class*="WeChat"], [class*="weixin"], [class*="Weixin"],
                            [class*="qrcode"], [class*="QRCode"], [class*="scan"], [class*="Scan"],
                            [id*="wechat"], [id*="WeChat"], [id*="weixin"], [id*="Weixin"],
                            [id*="qrcode"], [id*="QRCode"], [id*="scan"], [id*="Scan"],
                            div[data-type="qrcode"], div[data-type="wechat"], div[data-type="weixin"],
                            div[data-action="scan"], div[data-mode="qrcode"], img[alt*="二维码"],
                            img[alt*="QR"], img[alt*="qrcode"], img[alt*="扫码"], img[src*="qrcode"],
                            img[src*="wechat"], img[src*="weixin"] {
                                display: none !important;
                                visibility: hidden !important;
                                opacity: 0 !important;
                                clip: rect(0, 0, 0, 0) !important;
                                clip-path: inset(50%) !important;
                            }
                            /* 强制消除可能的弹窗背景遮罩 */
                            body::after {
                                content: '' !important;
                                position: fixed !important;
                                top: 0 !important;
                                left: 0 !important;
                                width: 100% !important;
                                height: 100% !important;
                                background: transparent !important;
                                z-index: -1 !important;
                            }
                            /* 修复body可能的overflow:hidden问题 */
                            body.modal-open,
                            body.dialog-open,
                            body.popup-open,
                            body[class*="mask"],
                            body[class*="modal"],
                            body[class*="dialog"],
                            body[style*="overflow: hidden"] {
                                overflow: auto !important;
                            }
                        `;
                        document.head.appendChild(style);
                        console.log('已注入增强的修复样式');
                    }
                };
                
                // 立即执行一次
                hideLoginElements();
                
                // 创建增强版观察器持续监控DOM变化，更主动地隐藏动态加载的登录元素
                const observer = new MutationObserver((mutations) => {
                    let shouldProcess = false;
                    let containsWechatElements = false;
                    
                    // 检查变化中是否有可能的登录元素
                    mutations.forEach(mutation => {
                        // 检查添加的节点
                        if (mutation.addedNodes.length) {
                            for (let i = 0; i < mutation.addedNodes.length; i++) {
                                const node = mutation.addedNodes[i];
                                if (node.nodeType === 1) { // 元素节点
                                    // 检查是否可能是登录相关元素
                                    const className = (node.className || '').toString().toLowerCase();
                                    const id = (node.id || '').toString().toLowerCase();
                                    const innerHTML = (node.innerHTML || '').toString().toLowerCase();
                                    
                                    // 微信登录特殊检测
                                    if (className.includes('wechat') || className.includes('weixin') || 
                                        className.includes('qrcode') || id.includes('wechat') || 
                                        id.includes('weixin') || id.includes('qrcode') ||
                                        innerHTML.includes('wechat') || innerHTML.includes('weixin') || 
                                        innerHTML.includes('qrcode') || innerHTML.includes('扫码') || 
                                        innerHTML.includes('微信')) {
                                        console.log('发现疑似微信登录元素，立即处理！');
                                        containsWechatElements = true;
                                        
                                        // 立即隐藏此元素
                                        if (node.style) {
                                            node.style.display = 'none !important';
                                            node.style.visibility = 'hidden !important';
                                            node.style.opacity = '0 !important';
                                            node.style.pointerEvents = 'none !important';
                                            node.setAttribute('data-proxy-processed', 'wechat-element');
                                        }
                                    }
                                    
                                    // 常规登录元素检测
                                    if (className.includes('login') || className.includes('modal') || 
                                        className.includes('dialog') || className.includes('popup') ||
                                        className.includes('overlay') || className.includes('mask') ||
                                        id.includes('login') || id.includes('modal') ||
                                        id.includes('dialog') || id.includes('popup') ||
                                        id.includes('overlay') || id.includes('mask')) {
                                        shouldProcess = true;
                                    }
                                }
                            }
                        }
                        
                        // 也检查属性变化，可能是元素从隐藏变为显示
                        if (mutation.type === 'attributes') {
                            const node = mutation.target;
                            if (node.nodeType === 1) {
                                const style = window.getComputedStyle(node);
                                if (style.display !== 'none' && style.visibility !== 'hidden') {
                                    const className = (node.className || '').toString().toLowerCase();
                                    const id = (node.id || '').toString().toLowerCase();
                                    
                                    if (className.includes('login') || className.includes('modal') || 
                                        className.includes('dialog') || className.includes('popup') ||
                                        className.includes('wechat') || className.includes('qrcode') ||
                                        id.includes('login') || id.includes('modal') ||
                                        id.includes('dialog') || id.includes('popup') ||
                                        id.includes('wechat') || id.includes('qrcode')) {
                                        shouldProcess = true;
                                    }
                                }
                            }
                        }
                    });
                    
                    // 微信相关元素优先级更高，立即全面处理
                    if (containsWechatElements) {
                        console.log('检测到微信登录相关元素，执行强化处理...');
                        hideLoginElements();
                        
                        // 额外添加微信特定样式
                        if (!document.getElementById('wechat-blocker-styles')) {
                            const wechatStyle = document.createElement('style');
                            wechatStyle.id = 'wechat-blocker-styles';
                            wechatStyle.textContent = `
                                /* 强制屏蔽所有微信相关元素 */
                                [class*="wechat"], [class*="weixin"], [class*="qrcode"],
                                [id*="wechat"], [id*="weixin"], [id*="qrcode"],
                                [class*="WeChat"], [class*="Weixin"], [class*="QRCode"],
                                [id*="WeChat"], [id*="Weixin"], [id*="QRCode"],
                                .qr-code, .qr-login, .scan-login, .wechat-login, .weixin-login,
                                div[class*="wechat"], div[class*="weixin"], div[class*="qrcode"] {
                                    display: none !important;
                                    visibility: hidden !important;
                                    opacity: 0 !important;
                                    pointer-events: none !important;
                                    width: 0 !important;
                                    height: 0 !important;
                                    position: absolute !important;
                                    top: -9999px !important;
                                    left: -9999px !important;
                                    z-index: -9999 !important;
                                }
                            `;
                            document.head.appendChild(wechatStyle);
                            console.log('已注入微信扫码元素阻止样式');
                        }
                    }
                    // 常规登录元素处理
                    else if (shouldProcess) {
                        console.log('检测到DOM变化，可能包含登录元素，正在处理...');
                        hideLoginElements();
                    }
                });
                
                // 开始观察整个文档
                observer.observe(document.documentElement, { 
                    childList: true, 
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style', 'id']
                });
                
                console.log('已设置DOM变化观察器');
                
            } catch (e) {
                console.error('设置自动认证失败:', e);
            }
        };
        
        // 在页面加载完成后立即应用认证信息
        if (document.readyState === 'complete') {
            setupAutoAuth();
        } else {
            window.addEventListener('load', setupAutoAuth);
        }
        
        // 同时立即执行一次，确保即使在页面加载过程中也设置认证信息
        setupAutoAuth();
        
        // 添加特殊处理，确保iframe内容显示
        window.addEventListener('DOMContentLoaded', () => {
            console.log('DOM加载完成，开始检查内容可见性');
            
            // 延迟执行，确保内容已加载
            setTimeout(() => {
                // 强制显示主要内容区域
                const contentAreas = document.querySelectorAll('main, .container, .content, [role="main"]');
                contentAreas.forEach(el => {
                    if (el && el.style) {
                        el.style.display = 'block';
                        el.style.visibility = 'visible';
                        el.style.opacity = '1';
                    }
                });
                
                console.log('已强制显示内容区域');
            }, 1000);
        });
    }

    // Function to convert a URL to proxy format
    const toProxyUrl = (url) => {
        if (!url) return url;
        
        try {
            // 获取完整的当前URL(解码后)以处理相对路径
            const currentUrl = decodeURIComponent(window.location.href);
            const currentPathname = new URL(currentUrl).pathname;
            
            console.log('Processing URL:', url, 'Current URL:', window.location.href);
            
            // Skip if already a proxy URL
            if (url.startsWith('/proxy/')) {
                return url;
            }
            
            // 如果是锚链接或JavaScript或数据URI，保持原样
            if (url.startsWith('javascript:') || url === '#' || url.startsWith('#') || url.startsWith('data:') || url.startsWith('mailto:') || url.startsWith('tel:')) {
                return url;
            }
            
            // Handle absolute URLs
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // 检查是否为 metaso.cn 的静态资源
                if (isMetaso && isStaticResource(url)) {
                    // 为 metaso.cn 的静态资源添加特殊处理标记
                    const encodedUrl = encodeURIComponent(url);
                    return `${proxyInfo.proxyBase}${encodedUrl}`;
                }
                return proxyInfo.proxyBase + encodeURIComponent(url);
            }
            
            // Handle protocol-relative URLs
            if (url.startsWith('//')) {
                return proxyInfo.proxyBase + encodeURIComponent('https:' + url);
            }
            
            // Extract current path from the proxied URL
            let targetCurrentPath = '';
            const proxyMatch = currentUrl.match(/\/proxy\/(.+)/);
            if (proxyMatch) {
                try {
                    const targetFullUrl = decodeURIComponent(proxyMatch[1]);
                    const targetUrlObj = new URL(targetFullUrl);
                    targetCurrentPath = targetUrlObj.pathname;
                    // 确保路径以/结尾以便于拼接相对路径
                    if (targetCurrentPath && !targetCurrentPath.endsWith('/')) {
                        // 移除文件名部分，保留目录部分
                        targetCurrentPath = targetCurrentPath.substring(0, targetCurrentPath.lastIndexOf('/') + 1);
                    }
                } catch (e) {
                    console.error('Failed to parse current target path:', e);
                }
            }
            
            console.log('Target current path:', targetCurrentPath);
            
            // Handle absolute paths
            if (url.startsWith('/')) {
                // 检查是否为 metaso.cn 的静态资源
                if (isMetaso && isStaticResource(url)) {
                    const fullUrl = proxyInfo.targetOrigin + url;
                    const encodedUrl = encodeURIComponent(fullUrl);
                    console.log('处理 metaso.cn 静态资源:', fullUrl);
                    return `${proxyInfo.proxyBase}${encodedUrl}`;
                }
                return proxyInfo.proxyBase + encodeURIComponent(proxyInfo.targetOrigin + url);
            }
            
            // Handle relative URLs - 这是关键改进部分
            // 构建目标网站上的完整路径
            let fullTargetPath;
            
            // 如果目标当前路径存在，使用它作为基础
            if (targetCurrentPath) {
                fullTargetPath = proxyInfo.targetOrigin + targetCurrentPath + url;
            } else {
                // 回退到简单路径拼接
                fullTargetPath = proxyInfo.targetOrigin + '/' + url;
            }
            
            // 检查是否为 metaso.cn 的静态资源
            if (isMetaso && isStaticResource(url)) {
                console.log('处理 metaso.cn 相对静态资源:', fullTargetPath);
                return `${proxyInfo.proxyBase}${encodeURIComponent(fullTargetPath)}`;
            }
            
            console.log('Full target path:', fullTargetPath);
            return proxyInfo.proxyBase + encodeURIComponent(fullTargetPath);
        } catch (e) {
            console.error('Error converting URL to proxy format:', url, e);
            return url;
        }
    };

    // Override form submissions - 增强版本
    const interceptFormSubmissions = () => {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.tagName !== 'FORM') return;

            // 阻止表单默认提交行为
            event.preventDefault();
            
            // 获取表单的action属性
            let action = form.getAttribute('action') || '';
            console.log('Form submission detected. Action:', action);
            
            // 如果action为空，使用当前页面URL
            if (!action) {
                action = window.location.pathname;
                console.log('Empty action, using current path:', action);
            }
            
            // 构建最终提交的URL
            let finalAction;
            if (action.startsWith('http://') || action.startsWith('https://')) {
                // 绝对URL
                finalAction = toProxyUrl(action);
            } else if (action === '/s' && form.hasAttribute('data-baidu-search')) {
                // 特殊处理：如果是百度搜索表单提交到/s
                // 直接使用服务器端的百度搜索处理路由
                finalAction = '/s';
                console.log('检测到百度搜索表单提交，使用特殊处理路径:', finalAction);
            } else if (action.startsWith('/')) {
                // 站点根路径 - 使用当前站点的origin
                const targetUrl = new URL(decodeURIComponent(window.location.pathname.replace('/proxy/', '')));
                finalAction = toProxyUrl(targetUrl.origin + action);
            } else {
                // 相对路径 - 相对于当前页面
                const currentUrl = decodeURIComponent(window.location.pathname.replace('/proxy/', ''));
                const currentUrlObj = new URL(currentUrl);
                
                // 获取当前页面的目录路径
                let basePath = currentUrlObj.pathname;
                if (basePath.includes('.')) {
                    // 如果当前路径是文件，则取其所在目录
                    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
                } else if (!basePath.endsWith('/')) {
                    basePath += '/';
                }
                
                finalAction = toProxyUrl(currentUrlObj.origin + basePath + action);
            }
            
            console.log('Intercepting form submission:', {
                originalAction: action,
                finalAction: finalAction,
                method: form.getAttribute('method') || 'GET'
            });
            
            // 创建表单数据
            const formData = new FormData(form);
            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            
            // 将表单数据转换为查询字符串或请求体
            if (method === 'GET') {
                // GET请求 - 将表单数据作为查询参数附加到URL
                const params = new URLSearchParams();
                for (const [key, value] of formData.entries()) {
                    params.append(key, value);
                }
                
                const paramString = params.toString();
                const separator = finalAction.includes('?') ? '&' : '?';
                const newUrl = paramString ? finalAction + separator + paramString : finalAction;
                
                console.log('Navigating to:', newUrl);
                window.location.href = newUrl;
            } else {
                // POST请求 - 使用fetch发送数据
                fetch(finalAction, {
                    method: method,
                    body: formData,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }).then(response => {
                    console.log('Form submission response:', response.status, response.statusText, response.url);
                    if (response.ok) {
                        // 重定向到响应URL
                        window.location.href = response.url;
                    } else {
                        // 如果响应不成功，仍然尝试导航
                        window.location.href = finalAction;
                    }
                }).catch(error => {
                    console.error('Form submission error:', error);
                    // 出错后仍然尝试导航
                    window.location.href = finalAction;
                });
            }
        }, true); // 使用捕获阶段以确保尽早处理表单提交
    };

    // Override link clicks - 更强大的链接拦截
    const interceptLinkClicks = () => {
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (!link) return;

            // Remove target attributes to prevent opening in new windows
            link.removeAttribute('target');
            link.removeAttribute('rel');

            const href = link.getAttribute('href');
            if (!href) return;
            
            // 跳过javascript:和空锚点链接
            if (href.startsWith('javascript:') || href === '#') {
                return;
            }
            
            // 处理锚点链接特殊情况
            if (href.startsWith('#')) {
                // 允许页内导航
                return;
            }

            // 将链接转换为代理URL
            const newHref = toProxyUrl(href);
            if (newHref !== href) {
                // 防止默认行为，我们将手动处理导航
                event.preventDefault();
                
                console.log('Intercepting click. Original href:', href, 'New href:', newHref);
                
                // 检查是否是同一窗口打开
                const target = link.getAttribute('target');
                if (target === '_blank' || target === '_new') {
                    // 在当前窗口打开而不是新窗口
                    window.location.href = newHref;
                } else {
                    // 在当前窗口正常导航
                    window.location.href = newHref;
                }
            }
        }, true); // 使用捕获阶段以确保我们优先处理点击事件
    };

    // Override fetch requests with enhanced handling for metaso.cn
    const originalFetch = window.fetch;
    window.fetch = function(input, init = {}) {
        let url, modifiedInit = { ...init };
        
        // 规范化input，将其转换为字符串URL
        if (typeof input === 'string') {
            url = input;
        } else if (input instanceof Request) {
            url = input.url;
            modifiedInit = {
                ...modifiedInit,
                method: input.method,
                headers: new Headers(input.headers),
                body: input.body,
                mode: input.mode,
                credentials: input.credentials,
                cache: input.cache,
                redirect: input.redirect,
                referrer: input.referrer,
                integrity: input.integrity
            };
        } else {
            url = String(input);
        }
        
        // 处理 metaso.cn 特殊授权
        if (isMetaso) {
            // 为metaso.cn的请求添加身份验证头
            if (!modifiedInit.headers) {
                modifiedInit.headers = new Headers();
            } else if (!(modifiedInit.headers instanceof Headers)) {
                modifiedInit.headers = new Headers(modifiedInit.headers);
            }
            
            // 添加授权头
            modifiedInit.headers.set('X-Token', 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026');
            modifiedInit.headers.set('Authorization', 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026');
            
            // 拦截所有登录、认证、微信扫码相关请求 - 增强版匹配更多模式
            if (url.toString().includes('/api/login') || 
                url.toString().includes('/api/auth') || 
                url.toString().includes('/api/qrcode') ||
                url.toString().includes('/api/wechat') ||
                url.toString().includes('/api/wx/') ||
                url.toString().includes('/api/user/check') ||
                url.toString().includes('/login') ||
                url.toString().includes('/auth/') ||
                url.toString().includes('/oauth/') ||
                url.toString().includes('/scan') || 
                url.toString().includes('/ticket') ||
                url.toString().includes('/callback') ||
                url.toString().includes('/confirm') ||
                url.toString().toLowerCase().includes('wechat') ||
                url.toString().toLowerCase().includes('weixin') ||
                url.toString().toLowerCase().includes('qrcode')) {
                
                // 立即尝试隐藏任何登录元素
                try {
                    setTimeout(() => {
                        if (typeof hideLoginElements === 'function') {
                            hideLoginElements();
                            console.log('fetch拦截触发登录元素清理');
                        }
                    }, 0);
                } catch (e) {}
                
                
                console.log('拦截登录/授权/微信扫码相关请求:', url);
                
                // 根据请求类型返回不同的模拟响应
                let responseData;
                
                if (url.toString().includes('qrcode') || 
                    url.toString().toLowerCase().includes('wechat') || 
                    url.toString().toLowerCase().includes('weixin')) {
                    // 微信扫码相关请求 - 直接返回已确认登录状态
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            qrcode: '', // 不返回二维码图片
                            status: 'confirmed', // 直接设置为已确认状态，跳过扫码步骤
                            expireTime: 3600,
                            ticket: 'auto_login_ticket_' + Date.now(),
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                            isConfirmed: true,
                            isScanned: true,
                            isLogin: true
                        }
                    };
                } else if (url.toString().includes('/api/user/check') || 
                           url.toString().includes('/api/auth/status')) {
                    // 登录状态检查请求
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            isLogin: true,
                            isAuth: true,
                            isVip: true,
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026'
                        }
                    };
                } else {
                    // 常规登录/授权请求
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                            sid: 'f67f62dc1e26491db55770dbc2c93d32',
                            uid: '12345678',
                            isLogin: true,
                            isVip: true,
                            vipExpireTime: '2030-12-31 23:59:59',
                            nickname: 'MetaSO用户'
                        }
                    };
                }
                
                // 返回模拟的成功响应
                return Promise.resolve(new Response(JSON.stringify(responseData), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }));
            }
            
            // 拦截用户信息相关请求
            if (url.toString().includes('/api/my-info') || 
                url.toString().includes('/api/user/info') ||
                url.toString().includes('/api/user/profile')) {
                
                console.log('拦截用户信息请求:', url);
                
                // 返回模拟的用户信息
                return Promise.resolve(new Response(JSON.stringify({
                    code: 0,
                    message: 'success',
                    data: {
                        id: 9527,
                        userId: 12345678,
                        nickname: 'MetaSO用户',
                        avatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJxjnHY3Elib2qgxlNMOvBPnticKpJWlDGBbvAtpUjqx8xhbvvJUfyZ6wJ3Cv5NZa3dCo0LslCUw6xw/132',
                        isVip: true,
                        vipExpireTime: '2030-12-31 23:59:59',
                        email: 'user@metaso.cn',
                        loginTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                        sid: 'f67f62dc1e26491db55770dbc2c93d32'
                    }
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }));
            }
        }
        
        const proxyUrl = toProxyUrl(url);
        
        if (proxyUrl !== url) {
            console.log('Proxying fetch request from', url, 'to', proxyUrl);
            if (typeof input === 'string') {
                return originalFetch.call(this, proxyUrl, modifiedInit)
                    .then(response => {
                        // 处理特定响应
                        if (isMetaso) {
                            // 检查是否是重定向到登录页
                            if (response.redirected && response.url.includes('/login')) {
                                console.log('检测到重定向到登录页，替换为虚拟登录响应');
                                
                                // 返回模拟的登录成功响应
                                return new Response(JSON.stringify({
                                    code: 0,
                                    message: 'success',
                                    data: {
                                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                        sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                        isLogin: true
                                    }
                                }), {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });
                            }
                            
                            // 处理401未授权响应
                            if (response.status === 401 || response.status === 403) {
                                console.log('检测到未授权响应，替换为虚拟登录成功响应');
                                
                                // 返回模拟的登录成功响应
                                return new Response(JSON.stringify({
                                    code: 0,
                                    message: 'success',
                                    data: {
                                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                        sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                        isLogin: true
                                    }
                                }), {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });
                            }
                        }
                        return response;
                    });
            } else {
                return originalFetch.call(this, { ...input, url: proxyUrl }, modifiedInit)
                    .then(response => {
                        // 处理特定响应
                        if (isMetaso) {
                            // 检查是否是重定向到登录页
                            if (response.redirected && response.url.includes('/login')) {
                                console.log('检测到重定向到登录页，替换为虚拟登录响应');
                                
                                // 返回模拟的登录成功响应
                                return new Response(JSON.stringify({
                                    code: 0,
                                    message: 'success',
                                    data: {
                                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                        sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                        isLogin: true
                                    }
                                }), {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });
                            }
                            
                            // 处理401未授权响应
                            if (response.status === 401 || response.status === 403) {
                                console.log('检测到未授权响应，替换为虚拟登录成功响应');
                                
                                // 返回模拟的登录成功响应
                                return new Response(JSON.stringify({
                                    code: 0,
                                    message: 'success',
                                    data: {
                                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                        sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                        isLogin: true
                                    }
                                }), {
                                    status: 200,
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                });
                            }
                        }
                        return response;
                    });
            }
        }
        
        return originalFetch.call(this, input, modifiedInit);
    };

    // Override XMLHttpRequest with enhanced handling for metaso.cn
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        // 保存原始URL以便后续处理
        this._originalUrl = url;
        this._originalMethod = method;
        
        // 处理登录/扫码相关请求的特殊拦截 - 增强版
        if (isMetaso && typeof url === 'string' && (
            url.includes('/api/login') || 
            url.includes('/api/auth') || 
            url.includes('/api/qrcode') ||
            url.includes('/api/wechat') ||
            url.includes('/api/wx/') ||
            url.includes('/api/user/check') ||
            url.includes('/login') ||
            url.includes('/auth/') ||
            url.includes('/oauth/') ||
            url.includes('/scan') || 
            url.includes('/ticket') ||
            url.includes('/callback') ||
            url.includes('/confirm') ||
            url.toLowerCase().includes('wechat') ||
            url.toLowerCase().includes('weixin') ||
            url.toLowerCase().includes('qrcode')
        )) {
            console.log('拦截XHR登录/授权/微信扫码相关请求:', url);
            this._interceptLoginRequest = true;
            
            // 立即尝试隐藏任何登录元素
            try {
                setTimeout(() => {
                    if (typeof hideLoginElements === 'function') {
                        hideLoginElements();
                        console.log('XHR拦截触发登录元素清理');
                    }
                }, 0);
            } catch (e) {};
            
            // 创建一个假的URL，我们将在send方法中处理实际响应
            const dummyUrl = 'data:,'; // 最小的有效URL
            return originalXHROpen.call(this, method, dummyUrl, ...args);
        }
        
        // 处理用户信息相关请求的特殊拦截
        if (isMetaso && typeof url === 'string' && (
            url.includes('/api/my-info') || 
            url.includes('/api/user/info') ||
            url.includes('/api/user/profile')
        )) {
            console.log('拦截XHR用户信息请求:', url);
            this._interceptUserInfoRequest = true;
            
            // 创建一个假的URL，我们将在send方法中处理实际响应
            const dummyUrl = 'data:,'; // 最小的有效URL
            return originalXHROpen.call(this, method, dummyUrl, ...args);
        }
        
        // 处理代理URL
        const proxyUrl = toProxyUrl(url);
        if (proxyUrl !== url) {
            console.log('Proxying XHR request from', url, 'to', proxyUrl);
            this._isProxied = true;
            return originalXHROpen.call(this, method, proxyUrl, ...args);
        }
        
        return originalXHROpen.call(this, method, url, ...args);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        // 处理登录/扫码相关请求的拦截
        if (this._interceptLoginRequest) {
            console.log('模拟XHR登录/授权响应');
            
            // 延迟模拟XHR响应处理
            setTimeout(() => {
                // 创建响应数据
                let responseData;
                
                if (this._originalUrl.includes('qrcode') || 
                    this._originalUrl.toLowerCase().includes('wechat') || 
                    this._originalUrl.toLowerCase().includes('weixin')) {
                    // 微信扫码相关请求
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            qrcode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAG6ElEQVR4nO3dwW4bORQFUdlo/v+X5Q/I2gGC2JSkx+KrswpbWYwH9+EteWb5+fn5+QFk/rv6AwBXEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCI+jj7Df7+/j77LZ7q4+Ps/87LOUIcgSNAkABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABAlABA1MfZb3B1+efnx9VfYSSPBofxBCBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACBKACDq4+jBPz8/R4//X2/+4jm8eQ1pngAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQJQAQ9XH04J+fn6PH/683f3G2qWv48/Nz9Z+41JTPufE+vPnP2xMgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAgSgAg6uPswafKP3XuqV58Ko/Hsc+5cR23/+6/eUxPgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgCgBgKiPswdPLf9UU+efOv9UU9dw43XkPB6Py6/hxnV48wSIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCIEgCI+rj6A1zNm1//2TzeHo/H4/F4XP4ZNvIEiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiBIAiPoLwYBN6cam+6MAAAAASUVORK5CYII=',
                            status: 'scanned',
                            expireTime: 300,
                            ticket: 'mock_ticket_' + Date.now(),
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026'
                        }
                    };
                } else if (this._originalUrl.includes('/api/user/check') || 
                           this._originalUrl.includes('/api/auth/status')) {
                    // 登录状态检查请求
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            isLogin: true,
                            isAuth: true,
                            isVip: true,
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026'
                        }
                    };
                } else {
                    // 常规登录/授权请求
                    responseData = {
                        code: 0,
                        message: 'success',
                        data: {
                            token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                            sid: 'f67f62dc1e26491db55770dbc2c93d32',
                            uid: '12345678',
                            isLogin: true,
                            isVip: true,
                            vipExpireTime: '2030-12-31 23:59:59',
                            nickname: 'MetaSO用户'
                        }
                    };
                }
                
                // 模拟XHR响应
                Object.defineProperty(this, 'status', { value: 200 });
                Object.defineProperty(this, 'statusText', { value: 'OK' });
                Object.defineProperty(this, 'readyState', { value: 4 });
                Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseData) });
                Object.defineProperty(this, 'responseURL', { value: this._originalUrl || '' });
                
                // 创建响应头
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                // 重写getResponseHeader和getAllResponseHeaders方法
                this.getResponseHeader = function(name) {
                    return headers[name.toLowerCase()] || null;
                };
                
                this.getAllResponseHeaders = function() {
                    let result = '';
                    for (const key in headers) {
                        result += key + ': ' + headers[key] + '\r\n';
                    }
                    return result;
                };
                
                // 触发回调
                if (typeof this.onreadystatechange === 'function') {
                    this.onreadystatechange();
                }
                
                if (typeof this.onload === 'function') {
                    this.onload();
                }
                
            }, 100); // 短暂延迟以模拟网络请求
            
            return; // 不实际发送请求
        }
        
        // 处理用户信息相关请求的拦截
        if (this._interceptUserInfoRequest) {
            console.log('模拟XHR用户信息响应');
            
            // 延迟模拟XHR响应处理
            setTimeout(() => {
                // 创建模拟的用户信息响应
                const responseData = {
                    code: 0,
                    message: 'success',
                    data: {
                        id: 9527,
                        userId: 12345678,
                        nickname: 'MetaSO用户',
                        avatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJxjnHY3Elib2qgxlNMOvBPnticKpJWlDGBbvAtpUjqx8xhbvvJUfyZ6wJ3Cv5NZa3dCo0LslCUw6xw/132',
                        isVip: true,
                        vipExpireTime: '2030-12-31 23:59:59',
                        email: 'user@metaso.cn',
                        loginTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                        sid: 'f67f62dc1e26491db55770dbc2c93d32'
                    }
                };
                
                // 模拟XHR响应
                Object.defineProperty(this, 'status', { value: 200 });
                Object.defineProperty(this, 'statusText', { value: 'OK' });
                Object.defineProperty(this, 'readyState', { value: 4 });
                Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseData) });
                Object.defineProperty(this, 'responseURL', { value: this._originalUrl || '' });
                
                // 创建响应头
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                // 重写getResponseHeader和getAllResponseHeaders方法
                this.getResponseHeader = function(name) {
                    return headers[name.toLowerCase()] || null;
                };
                
                this.getAllResponseHeaders = function() {
                    let result = '';
                    for (const key in headers) {
                        result += key + ': ' + headers[key] + '\r\n';
                    }
                    return result;
                };
                
                // 触发回调
                if (typeof this.onreadystatechange === 'function') {
                    this.onreadystatechange();
                }
                
                if (typeof this.onload === 'function') {
                    this.onload();
                }
                
            }, 100); // 短暂延迟以模拟网络请求
            
            return; // 不实际发送请求
        }
        
        // 添加metaso.cn认证处理
        if (isMetaso && this._originalUrl) {
            console.log('为metaso.cn XHR请求添加认证信息:', this._originalUrl);
            
            // 添加token到请求头 - 使用真实授权信息
            this.setRequestHeader('X-Token', 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026');
            this.setRequestHeader('Authorization', 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026');
            
            // 保存原始onreadystatechange，以便添加我们的处理逻辑
            const originalOnReadyStateChange = this.onreadystatechange;
            
            // 设置新的onreadystatechange处理函数
            this.onreadystatechange = function() {
                if (this.readyState === 4) {  // 请求完成
                    // 检查是否需要处理特定响应
                    if (this.status === 401 || this.status === 403) {
                        console.log('检测到XHR未授权响应，替换为虚拟登录成功响应');
                        
                        // 创建模拟的登录成功响应
                        const responseData = {
                            code: 0,
                            message: 'success',
                            data: {
                                token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                isLogin: true
                            }
                        };
                        
                        // 覆盖响应属性
                        Object.defineProperty(this, 'status', { value: 200 });
                        Object.defineProperty(this, 'statusText', { value: 'OK' });
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseData) });
                        
                        // 调用原始处理函数
                        if (originalOnReadyStateChange) {
                            originalOnReadyStateChange.apply(this, arguments);
                        }
                        return;
                    }
                    
                    // 检查是否是JSON响应，并且包含登录错误
                    if (this.getResponseHeader('content-type') && 
                        this.getResponseHeader('content-type').includes('application/json')) {
                        try {
                            const response = JSON.parse(this.responseText);
                            
                            // 检查是否含有未登录错误码
                            if ((response.code === 401 || response.code === -1 || response.code === 1001) ||
                                (response.message && (
                                    response.message.includes('未登录') || 
                                    response.message.includes('请登录') || 
                                    response.message.includes('login required') || 
                                    response.message.includes('unauthorized')
                                ))) {
                                console.log('检测到XHR JSON未登录响应，替换为虚拟登录成功响应');
                                
                                // 创建模拟的登录成功响应
                                const responseData = {
                                    code: 0,
                                    message: 'success',
                                    data: {
                                        token: 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026',
                                        sid: 'f67f62dc1e26491db55770dbc2c93d32',
                                        isLogin: true
                                    }
                                };
                                
                                // 覆盖响应属性
                                Object.defineProperty(this, 'status', { value: 200 });
                                Object.defineProperty(this, 'statusText', { value: 'OK' });
                                Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseData) });
                                
                                // 调用原始处理函数
                                if (originalOnReadyStateChange) {
                                    originalOnReadyStateChange.apply(this, arguments);
                                }
                                return;
                            }
                        } catch (e) {
                            // 解析JSON失败，忽略
                        }
                    }
                }
                
                // 调用原始处理函数
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
        }
        
        // 调用原始send方法
        return originalXHRSend.call(this, body);
    };

    // Override window.open to prevent new windows
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
        console.log('Intercepting window.open call:', url, target, features);
        
        // If target is _blank or similar, redirect in current window instead
        if (target === '_blank' || target === '_new' || !target) {
            const proxyUrl = toProxyUrl(url);
            console.log('Redirecting window.open to current window:', proxyUrl);
            window.location.href = proxyUrl;
            return window;
        }
        
        // For other targets, still redirect in current window
        const proxyUrl = toProxyUrl(url);
        window.location.href = proxyUrl;
        return window;
    };

    // Fix existing elements on page load - 增强版，更好地处理静态资源
    const fixExistingElements = () => {
        // Fix forms
        document.querySelectorAll('form[action]').forEach(form => {
            const action = form.getAttribute('action');
            const newAction = toProxyUrl(action);
            if (newAction !== action) {
                console.log('Fixed form action:', action, '->', newAction);
                form.setAttribute('action', newAction);
            }
        });

        // Fix links
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                const newHref = toProxyUrl(href);
                if (newHref !== href) {
                    link.setAttribute('href', newHref);
                }
            }
        });
        
        // Fix CSS style elements - 处理页面内的<style>标签
        document.querySelectorAll('style').forEach(styleEl => {
            const css = styleEl.textContent;
            if (css && css.includes('url(')) {
                const newCss = css.replace(/url\(['"]?([^)'"]+)['"]?\)/g, (match, url) => {
                    if (url.startsWith('data:') || url.startsWith('#')) return match;
                    return `url("${toProxyUrl(url)}")`;
                });
                if (newCss !== css) {
                    styleEl.textContent = newCss;
                }
            }
        });
        
        // Fix inline styles
        document.querySelectorAll('[style]').forEach(element => {
            const style = element.getAttribute('style');
            if (style && style.includes('url(')) {
                const newStyle = style.replace(/url\(['"]?([^)'"]+)['"]?\)/g, (match, url) => {
                    if (url.startsWith('data:') || url.startsWith('#')) return match;
                    return `url("${toProxyUrl(url)}")`;
                });
                if (newStyle !== style) {
                    element.setAttribute('style', newStyle);
                }
            }
        });

        // Fix images, scripts, stylesheets and other resources
        const resourceSelectors = [
            'img[src]',
            'script[src]',
            'link[href]',
            'iframe[src]',
            'source[src]',
            'track[src]',
            'audio[src]',
            'video[src]',
            'embed[src]',
            'object[data]'
        ];

        resourceSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                const attr = element.hasAttribute('src') ? 'src' : 'href';
                const url = element.getAttribute(attr);
                const newUrl = toProxyUrl(url);
                if (newUrl !== url) {
                    element.setAttribute(attr, newUrl);
                }
            });
        });
    };

    // Initialize immediately and also when DOM is ready
    const initializeProxy = () => {
        fixExistingElements();
        interceptFormSubmissions();
        interceptLinkClicks();
        
        // Force remove target attributes from all existing links
        document.querySelectorAll('a').forEach(link => {
            link.removeAttribute('target');
            link.removeAttribute('rel');
            
            // Remove problematic onclick handlers
            const onclick = link.getAttribute('onclick');
            if (onclick && (onclick.includes('window.open') || onclick.includes('_blank'))) {
                link.removeAttribute('onclick');
            }
        });
        
        // Force remove target attributes from all forms
        document.querySelectorAll('form').forEach(form => {
            form.removeAttribute('target');
        });
        
        // 特殊处理metaso.cn的登录
        if (isMetaso) {
            console.log('初始化metaso.cn登录状态检查');
            
            // 设置cookie以确保登录状态 - 使用真实授权信息
            try {
                document.cookie = "token=Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026; path=/;";
                document.cookie = "sid=f67f62dc1e26491db55770dbc2c93d32; path=/;";
            } catch (e) {
                console.log('设置cookie失败，可能是因为跨域限制', e);
            }
            
            // 检查登录状态的函数
            const checkLoginStatus = () => {
                // 检查页面上是否有登录按钮或登录提示
                const loginElements = document.querySelectorAll(
                    '.login-btn, .login, [href*="login"], [onclick*="login"], ' +
                    '.need-login, .please-login, .not-login, ' +
                    'a[href="/login"], button[data-href="/login"]'
                );
                
                // 检查页面内容是否包含"请登录"、"未登录"等文本
                const pageContent = document.body.innerText;
                const needLoginTexts = ['请登录', '未登录', '登录后', '请先登录', '需要登录'];
                const needLogin = needLoginTexts.some(text => pageContent.includes(text));
                
                if (loginElements.length > 0 || needLogin) {
                    console.log('检测到未登录状态，自动应用认证信息');
                    // 直接设置认证信息，无需重定向
                    document.cookie = "token=Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026; path=/;";
                    document.cookie = "sid=f67f62dc1e26491db55770dbc2c93d32; path=/;";
                    document.cookie = "uid=12345678; path=/;";
                    // 刷新当前页面
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            };
            
            // 页面加载完成后检查登录状态
            setTimeout(checkLoginStatus, 1500);
            
            // 定期检查登录状态
            setInterval(checkLoginStatus, 10000);
        }
        
        console.log('Proxy initialization complete');
    };

    // Run immediately
    initializeProxy();
    
    // Also run when DOM is ready (in case we missed some elements)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeProxy);
    }
    
    // Run again after a short delay to catch any dynamically loaded content
    setTimeout(initializeProxy, 100);
    setTimeout(initializeProxy, 500);
    setTimeout(initializeProxy, 1000);

    // Also fix elements added dynamically
    const setupMutationObserver = () => {
        if (!document.body) {
            // If body doesn't exist yet, try again later
            setTimeout(setupMutationObserver, 100);
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Fix the new element and its children
                        const elements = [node, ...node.querySelectorAll('*')];
                        elements.forEach(element => {
                            // Remove target attributes from all links
                            if (element.tagName === 'A') {
                                element.removeAttribute('target');
                                element.removeAttribute('rel');
                                
                                // Handle onclick events that might open new windows
                                const onclick = element.getAttribute('onclick');
                                if (onclick && (onclick.includes('window.open') || onclick.includes('_blank'))) {
                                    element.removeAttribute('onclick');
                                }
                                
                                if (element.hasAttribute('href')) {
                                    const href = element.getAttribute('href');
                                    if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                                        const newHref = toProxyUrl(href);
                                        if (newHref !== href) {
                                            element.setAttribute('href', newHref);
                                        }
                                    }
                                }
                            }
                            
                            if (element.tagName === 'FORM') {
                                element.removeAttribute('target');
                                
                                if (element.hasAttribute('action')) {
                                    const action = element.getAttribute('action');
                                    const newAction = toProxyUrl(action);
                                    if (newAction !== action) {
                                        element.setAttribute('action', newAction);
                                    }
                                }
                            }
                        });
                    }
                });
            });
        });

        try {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('MutationObserver setup complete');
        } catch (error) {
            console.error('Failed to setup MutationObserver:', error);
        }
    };
    
    // Setup mutation observer
    setupMutationObserver();
    
    // 设置定期检查登录状态 - 仅针对metaso.cn
    if (isMetaso) {
        // 检查登录状态的函数
        const checkServerLoginStatus = () => {
            console.log('定期检查服务器登录状态');
            fetch('/api/login-status')
                .then(response => response.json())
                .then(data => {
                    if (data.isLoggedIn) {
                        console.log('服务器确认已登录状态有效');
                        // 更新cookie以保持登录状态
                        document.cookie = "token=" + data.token + "; path=/;";
                    } else {
                        console.log('服务器确认登录状态无效，需要重新登录');
                        console.log('检测到需要登录，自动应用认证信息');
                    }
                })
                .catch(err => {
                    console.error('检查登录状态出错', err);
                });
        };
        
        // 每30分钟检查一次登录状态
        setInterval(checkServerLoginStatus, 30 * 60 * 1000);
        
        // 页面活动后也检查登录状态
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkServerLoginStatus();
            }
        });
    }

    console.log('Proxy script setup complete');
})();
