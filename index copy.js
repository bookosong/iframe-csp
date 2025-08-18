const express = require('express');
const proxy = require('express-http-proxy');
const NodeCache = require('node-cache');
const cheerio = require('cheerio');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);
const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);

const app = express();
const cache = new NodeCache({ 
    stdTTL: 3600,  // 1小时缓存过期
    checkperiod: 600  // 每10分钟检查过期的缓存
});

// 添加中间件解析请求体
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 读取代理脚本
const proxyScript = fs.readFileSync(path.join(__dirname, 'static', 'proxy.js'), 'utf8');

// 配置日志
app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));

// 工具函数：检查是否为静态资源 - 移动到顶部以便全局使用
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

// 工具函数：生成缓存键
const generateCacheKey = (url, headers) => {
    const key = `${url}|${headers['accept-encoding'] || ''}`;
    return crypto.createHash('md5').update(key).digest('hex');
};

// 响应头处理函数
const modifyHeaders = (headers) => {
    const newHeaders = { ...headers };
    
    // 删除限制iframe的头
    delete newHeaders['x-frame-options'];
    delete newHeaders['X-Frame-Options'];
    delete newHeaders['frame-options'];
    
    // 修改CSP 或 直接删除 CSP 头，让浏览器使用默认行为
    const cspHeaders = ['content-security-policy', 'content-security-policy-report-only'];
    cspHeaders.forEach(header => {
        // 对于Bing这类使用严格CSP的网站，直接删除CSP头
        delete newHeaders[header];
        
        // 如果未来需要修改而非删除CSP，可以使用以下代码
        /*
        if (newHeaders[header]) {
            newHeaders[header] = newHeaders[header]
                .split(';')
                .map(directive => {
                    const d = directive.trim().toLowerCase();
                    if (d.startsWith('frame-ancestors')) {
                        return "frame-ancestors 'self' *";
                    }
                    if (d.startsWith('default-src')) {
                        return "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:";
                    }
                    if (d.startsWith('script-src')) {
                        return "script-src * 'unsafe-inline' 'unsafe-eval'";
                    }
                    if (d.startsWith('style-src')) {
                        return "style-src * 'unsafe-inline'";
                    }
                    if (d.startsWith('img-src')) {
                        return "img-src * data: blob:";
                    }
                    if (d.startsWith('connect-src')) {
                        return "connect-src * ws: wss:";
                    }
                    return directive;
                })
                .join('; ');
        }
        */
    });

    return newHeaders;
};

// HTML 内容处理函数
const processHtml = async (html, targetHost) => {
    try {
        const $ = cheerio.load(html);
        
        // 强制注入代理脚本到每个页面
        // 先移除已有的代理脚本（如果存在）
        $('script[data-proxy-script]').remove();
        
        // 在head的最前面注入代理脚本，确保它最先执行
        if ($('head').length) {
            $('head').prepend(`<script data-proxy-script>${proxyScript}</script>`);
        } else {
            // 如果没有head标签，在body前面添加
            $('body').before(`<script data-proxy-script>${proxyScript}</script>`);
        }
        
        // 同时在body的最后也添加一份，确保在所有内容加载后也能执行
        $('body').append(`<script data-proxy-script-late>${proxyScript}</script>`);
        
        // 修改所有绝对路径 - 增强版，更好地处理静态资源
        const updateAttribute = (elem, attr) => {
            const value = $(elem).attr(attr);
            if (!value) return;
            
            // 如果已经是代理URL，跳过处理
            if (value.startsWith('/proxy/')) {
                return;
            }
            
            // 跳过特殊URL
            if (value.startsWith('javascript:') || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:')) {
                return;
            }
            
            // 获取元素类型，以便进行特殊处理
            const tagName = elem.tagName.toLowerCase();
            let finalUrl;
            
            // 处理不同类型的URL
            if (value.startsWith('http://') || value.startsWith('https://')) {
                // 检查是否已经包含代理URL，如果是则提取原始URL
                if (value.includes('/proxy/')) {
                    // 提取最终的目标URL
                    const proxyMatch = value.match(/\/proxy\/(.+)$/);
                    if (proxyMatch) {
                        try {
                            finalUrl = decodeURIComponent(proxyMatch[1]);
                        } catch (e) {
                            finalUrl = value;
                        }
                    } else {
                        finalUrl = value;
                    }
                } else {
                    finalUrl = value;
                }
            } else if (value.startsWith('//')) {
                // 处理协议相对URL
                finalUrl = 'https:' + value;
            } else if (value.startsWith('/')) {
                // 处理根路径URL
                finalUrl = 'https://' + targetHost + value;
            } else {
                // 处理相对路径URL
                finalUrl = 'https://' + targetHost + '/' + value;
            }
            
            // 检查是否为CSS文件或其他静态资源，为其添加特殊处理
            const isStaticResource = (url) => {
                const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf'];
                return staticExtensions.some(ext => url.toLowerCase().endsWith(ext));
            };
            
            // 特殊处理静态资源
            if (tagName === 'link' && $(elem).attr('rel') === 'stylesheet') {
                // 这是一个CSS链接，添加特殊处理
                console.log('处理CSS链接:', finalUrl);
            }
            
            // 对于所有资源，使用代理URL
            $(elem).attr(attr, `/proxy/${encodeURIComponent(finalUrl)}`);
        };

        // 处理常见的URL属性
        const urlAttributes = ['src', 'href', 'action', 'data-src'];
        urlAttributes.forEach(attr => {
            $(`[${attr}]`).each((_, elem) => updateAttribute(elem, attr));
        });

        // 移除所有链接的target属性，确保在iframe内打开
        $('a[target]').each((_, elem) => {
            $(elem).removeAttr('target');
        });

        // 移除表单的target属性
        $('form[target]').each((_, elem) => {
            $(elem).removeAttr('target');
        });

        // 处理所有链接，确保它们在当前窗口打开
        $('a').each((_, elem) => {
            const $elem = $(elem);
            // 移除可能导致新窗口打开的属性
            $elem.removeAttr('target');
            $elem.removeAttr('rel');
            
            // 如果有onclick事件可能包含window.open，尝试移除
            const onclick = $elem.attr('onclick');
            if (onclick && (onclick.includes('window.open') || onclick.includes('_blank') || onclick.includes('target='))) {
                $elem.removeAttr('onclick');
            }
        });

        // 处理所有脚本标签
        $('script').each((_, elem) => {
            const $elem = $(elem);
            const scriptContent = $elem.html();
            
            // 处理内容
            if (scriptContent && (scriptContent.includes('window.open') || scriptContent.includes('target="_blank"') || scriptContent.includes("target='_blank'"))) {
                // 替换window.open调用为当前窗口导航
                let newContent = scriptContent
                    .replace(/window\.open\s*\([^)]*\)/g, 'window.location.href = arguments[0]')
                    .replace(/target\s*=\s*["']_blank["']/g, '')
                    .replace(/target\s*:\s*["']_blank["']/g, '');
                $elem.html(newContent);
            }
            
            // 处理带有nonce的脚本标签 - 给所有脚本添加unsafe-inline属性
            $elem.attr('data-proxy-unsafe-inline', 'true');
            
            // 如果有nonce，保留它以便于调试，但不用于安全控制
            if ($elem.attr('nonce')) {
                $elem.attr('data-original-nonce', $elem.attr('nonce'));
                // 不要删除nonce，而是保留它
            }
        });

        // 处理内联事件处理器
        $('[onclick], [onmousedown], [onmouseup]').each((_, elem) => {
            const $elem = $(elem);
            ['onclick', 'onmousedown', 'onmouseup'].forEach(eventAttr => {
                const eventCode = $elem.attr(eventAttr);
                if (eventCode && (eventCode.includes('window.open') || eventCode.includes('_blank'))) {
                    // 替换或移除有问题的事件处理器
                    const newEventCode = eventCode
                        .replace(/window\.open\s*\([^)]*\)/g, 'window.location.href = arguments[0]')
                        .replace(/target\s*=\s*["']_blank["']/g, '');
                    if (newEventCode !== eventCode) {
                        $elem.attr(eventAttr, newEventCode);
                    }
                }
            });
        });

        // 特别处理表单的action属性
        $('form').each((_, elem) => {
            const $form = $(elem);
            const action = $form.attr('action');
            
            // 记录表单信息，用于调试
            console.log('处理表单:', {
                action: action,
                method: $form.attr('method') || 'GET',
                id: $form.attr('id') || '无ID',
                class: $form.attr('class') || '无class'
            });
            
            if (!action || action === '') {
                // 如果没有action或action为空，设置为当前页面的代理URL
                $form.attr('action', `/proxy/${encodeURIComponent('https://' + targetHost)}`);
                console.log('  - 设置空action为当前页面URL');
            } else if (action.startsWith('/')) {
                // 如果是绝对路径（站点内），转换为代理URL
                $form.attr('action', `/proxy/${encodeURIComponent('https://' + targetHost + action)}`);
                console.log('  - 转换绝对路径action:', action);
            }
            
            // 添加表单拦截属性，确保我们的客户端脚本能够处理它
            $form.attr('data-proxy-form', 'true');
            
            // 百度特殊处理 - 如果是百度搜索表单
            if (targetHost.includes('baidu.com')) {
                // 识别百度搜索表单 - 通过action为'/s'或包含搜索输入框
                if (action === '/s' || action === 'https://www.baidu.com/s' || 
                    (!action && ($form.find('input[name="wd"]').length > 0 || 
                               $form.find('input[name="word"]').length > 0))) {
                    console.log('  - 检测到百度搜索表单，添加特殊处理');
                    
                    // 直接使用我们的特殊路由处理百度搜索
                    $form.attr('action', '/s');
                    
                    // 确保表单使用GET方法，百度搜索通常使用GET
                    $form.attr('method', 'GET');
                    
                    // 保留所有原始表单字段
                    console.log('  - 百度表单字段:', $form.find('input').map((_, el) => 
                        `${$(el).attr('name')}=${$(el).val()}`).get().join(', '));
                    
                    // 添加标记以便客户端脚本识别
                    $form.attr('data-baidu-search', 'true');
                }
            }
        });

                        // 处理内联样式中的URL
        $('[style]').each((_, elem) => {
            const style = $(elem).attr('style');
            if (style) {
                // 处理不同格式的URL，包括相对路径和绝对路径
                const newStyle = style.replace(/url\(['"]?([^)'"]+)['"]?\)/g, 
                    (match, url) => {
                        // 跳过数据URI
                        if (url.startsWith('data:')) return match;
                        
                        // 处理绝对URL
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                            return `url('/proxy/${encodeURIComponent(url)}')`;
                        }
                        
                        // 处理协议相对URL
                        if (url.startsWith('//')) {
                            return `url('/proxy/${encodeURIComponent('https:' + url)}')`;
                        }
                        
                        // 处理根路径URL
                        if (url.startsWith('/')) {
                            return `url('/proxy/${encodeURIComponent('https://' + targetHost + url)}')`;
                        }
                        
                        // 处理相对路径
                        return `url('/proxy/${encodeURIComponent('https://' + targetHost + '/' + url)}')`;
                    });
                
                $(elem).attr('style', newStyle);
            }
        });

        // 处理CSS中的URL
        $('style').each((_, elem) => {
            const css = $(elem).html();
            if (css) {
                // 处理不同格式的URL，包括相对路径和绝对路径
                const newCss = css.replace(/url\(['"]?([^)'"]+)['"]?\)/g, 
                    (match, url) => {
                        // 跳过数据URI
                        if (url.startsWith('data:')) return match;
                        
                        // 处理绝对URL
                        if (url.startsWith('http://') || url.startsWith('https://')) {
                            return `url('/proxy/${encodeURIComponent(url)}')`;
                        }
                        
                        // 处理协议相对URL
                        if (url.startsWith('//')) {
                            return `url('/proxy/${encodeURIComponent('https:' + url)}')`;
                        }
                        
                        // 处理根路径URL
                        if (url.startsWith('/')) {
                            return `url('/proxy/${encodeURIComponent('https://' + targetHost + url)}')`;
                        }
                        
                        // 处理相对路径
                        return `url('/proxy/${encodeURIComponent('https://' + targetHost + '/' + url)}')`;
                    });
                
                $(elem).html(newCss);
            }
        });        // 处理 <base> 标签
        $('base').each((_, elem) => {
            const href = $(elem).attr('href');
            if (href) {
                $(elem).attr('href', `/proxy/${encodeURIComponent(href)}`);
            }
        });

        // 处理meta refresh
        $('meta[http-equiv="refresh"]').each((_, elem) => {
            const content = $(elem).attr('content');
            if (content) {
                const newContent = content.replace(/url=([^;]+)/i, (match, url) => {
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        return `url=/proxy/${encodeURIComponent(url)}`;
                    } else if (url.startsWith('/')) {
                        return `url=/proxy/${encodeURIComponent('https://' + targetHost + url)}`;
                    }
                    return match;
                });
                $(elem).attr('content', newContent);
            }
        });
        
        // 处理 CSP meta 标签，删除它们
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        
        // 注入额外的脚本来修复Bing的API路径问题
        if (targetHost.includes('bing.com')) {
            // 插入脚本来修复Bing的API调用问题
            $('head').append(`
                <script>
                    // 重写 fetch 和 XMLHttpRequest 以修复路径问题
                    (function() {
                        // 保存原始方法
                        const originalFetch = window.fetch;
                        const originalXHROpen = XMLHttpRequest.prototype.open;
                        
                        // 修复相对URL
                        function fixUrl(url) {
                            if (!url) return url;
                            if (url.startsWith('http')) return url;
                            if (url.startsWith('/')) {
                                // 这是一个绝对路径
                                return '/proxy/' + encodeURIComponent('https://${targetHost}' + url);
                            }
                            // 这是一个相对路径
                            return '/proxy/' + encodeURIComponent('https://${targetHost}/' + url);
                        }
                        
                        // 重写 fetch
                        window.fetch = function(url, options) {
                            return originalFetch.call(this, fixUrl(url), options);
                        };
                        
                        // 重写 XMLHttpRequest
                        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                            return originalXHROpen.call(this, method, fixUrl(url), async, user, password);
                        };
                    })();
                </script>
            `);
        }

        return $.html();
    } catch (error) {
        console.error('Error processing HTML:', error);
        return html;
    }
};

// 缓存中间件
const cacheMiddleware = async (req, res, next) => {
    if (!isStaticResource(req.url) || 
        req.method !== 'GET' || 
        req.headers['cache-control']?.includes('no-cache')) {
        return next();
    }

    const cacheKey = generateCacheKey(req.url, req.headers);
    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
        // 检查条件请求
        if (req.headers['if-none-match'] === cachedResponse.etag) {
            return res.status(304).end();
        }
        
        res.set(cachedResponse.headers);
        return res.send(cachedResponse.body);
    }

    next();
};


// URL 验证中间件
const validateUrl = (req, res, next) => {
    try {
        // 记录请求信息
        console.log('收到代理请求:', {
            url: req.url,
            originalUrl: req.originalUrl,
            method: req.method,
            referer: req.headers.referer
        });

        // 解码 URL - 移除 /proxy/ 前缀
        const fullUrl = req.originalUrl || req.url;
        
        // 检查URL是否包含完整的/proxy/前缀
        if (!fullUrl.startsWith('/proxy/')) {
            throw new Error('URL must start with /proxy/ prefix');
        }
        
        // 移除 /proxy/ 前缀
        let targetUrl = fullUrl.substring('/proxy/'.length);
        
        // 尝试解码直到没有更多需要解码的内容
        let prevUrl;
        let decodingIterations = 0;
        const MAX_DECODING_ITERATIONS = 5; // 防止无限循环
        
        do {
            prevUrl = targetUrl;
            try {
                targetUrl = decodeURIComponent(prevUrl);
                decodingIterations++;
                
                // 检测并处理嵌套代理情况
                if (targetUrl.startsWith('http://localhost:') && targetUrl.includes('/proxy/')) {
                    console.log('检测到嵌套代理请求，提取真实目标URL');
                    const nestedProxyMatch = targetUrl.match(/\/proxy\/([^\/].+)$/);
                    if (nestedProxyMatch && nestedProxyMatch[1]) {
                        // 直接使用嵌套的目标URL
                        targetUrl = decodeURIComponent(nestedProxyMatch[1]);
                        console.log('提取的真实目标URL:', targetUrl);
                        break; // 找到真实目标后不再继续解码
                    }
                }
            } catch (e) {
                // 如果解码失败，使用最后一次成功解码的结果
                console.error('解码URL失败:', e.message);
                targetUrl = prevUrl;
                break;
            }
        } while (targetUrl !== prevUrl && decodingIterations < MAX_DECODING_ITERATIONS);

        // 验证 URL 格式
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            throw new Error('URL must start with http:// or https://');
        }

        // 验证 URL 结构
        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
            if (!parsedUrl.hostname) {
                throw new Error('URL must have a valid hostname');
            }
        } catch (e) {
            throw new Error(`Invalid URL structure: ${e.message}`);
        }

        // 保存处理后的 URL 和额外信息
        req.targetUrl = targetUrl;
        req.parsedTargetUrl = parsedUrl;
        
        console.log('URL 验证通过:', {
            originalUrl: req.originalUrl,
            targetUrl: targetUrl,
            targetHost: parsedUrl.hostname,
            targetPath: parsedUrl.pathname,
            targetSearch: parsedUrl.search
        });

        next();
    } catch (error) {
        console.error('URL 验证错误:', error);
        console.error('- 请求URL:', req.originalUrl);
        console.error('- Referer:', req.headers.referer);
        next(error);
    }
};

// 设置路由
app.use('/static', express.static(path.join(__dirname, 'static')));
// 代理中间件
// 增强型解压缩函数
async function decompress(buffer, encoding) {
    if (!buffer || buffer.length === 0 || !encoding) {
        return buffer;
    }
    
    // 特别处理 metaso.cn 的响应
    try {
        const contentStr = buffer.toString('utf8', 0, 50);  // 检查前50个字节
        if (contentStr.includes('<!DOCTYPE html>') || contentStr.includes('<html>')) {
            console.log('检测到HTML内容，直接返回不进行解压缩');
            return buffer;  // 如果看起来已经是HTML内容，就不需要解压了
        }
    } catch (err) {
        console.log('检查内容类型失败，继续尝试解压', err.message);
    }
    
    try {
        // 处理多种编码格式的情况，如 'gzip, deflate'
        const encodings = encoding.split(',').map(e => e.trim().toLowerCase());
        let result = buffer;
        
        // 按顺序尝试不同的解压方法
        for (const enc of encodings) {
            if (enc.includes('gzip')) {
                // 首先尝试标准解压
                try {
                    result = await gunzip(result);
                    console.log('Gzip 解压成功');
                } catch (err) {
                    console.error('标准 Gzip 解压失败:', err.message);
                    
                    // 尝试使用低级API，提供更多选项
                    try {
                        result = await new Promise((resolve) => {
                            zlib.gunzip(result, {
                                finishFlush: zlib.constants.Z_SYNC_FLUSH,
                                flush: zlib.constants.Z_SYNC_FLUSH,
                                chunkSize: 256 * 1024  // 增大块大小更多
                            }, (err2, decompressed) => {
                                if (err2) {
                                    console.error('低级 Gzip 解压也失败:', err2.message);
                                    resolve(buffer); // 使用原始内容，而不是部分解压的结果
                                } else {
                                    console.log('低级 Gzip 解压成功');
                                    resolve(decompressed);
                                }
                            });
                        });
                    } catch (lowLevelError) {
                        console.error('所有 Gzip 解压尝试都失败:', lowLevelError.message);
                        // 保持原样
                    }
                }
            } else if (enc.includes('deflate')) {
                try {
                    result = await inflate(result);
                } catch (err) {
                    console.error('Deflate 解压失败:', err.message);
                    
                    // 尝试原始 deflate (无 zlib 头)
                    try {
                        result = await new Promise((resolve) => {
                            zlib.inflateRaw(result, (rawErr, rawResult) => {
                                if (rawErr) {
                                    console.error('Raw deflate 也失败:', rawErr.message);
                                    resolve(result);
                                } else {
                                    console.log('Raw deflate 解压成功');
                                    resolve(rawResult);
                                }
                            });
                        });
                    } catch (rawError) {
                        // 保持原样
                    }
                }
            } else if (enc.includes('br')) {
                try {
                    result = await brotliDecompress(result);
                } catch (err) {
                    console.error('Brotli 解压失败:', err.message);
                    // 保持原样
                }
            }
        }
        
        return result;
    } catch (error) {
        console.error('解压缩总体错误:', error);
        // 如果解压缩失败，返回原始数据
        return buffer;
    }
}

// 压缩函数
async function compress(buffer, encoding) {
    if (!buffer || buffer.length === 0 || !encoding) {
        return buffer;
    }

    try {
        const options = {
            level: zlib.Z_BEST_COMPRESSION,
            windowBits: 15
        };

        if (encoding === 'gzip') {
            return await new Promise((resolve, reject) => {
                zlib.gzip(buffer, options, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } else if (encoding === 'deflate') {
            return await new Promise((resolve, reject) => {
                zlib.deflate(buffer, options, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } else if (encoding === 'br') {
            return await new Promise((resolve, reject) => {
                zlib.brotliCompress(buffer, {
                    params: {
                        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
                    }
                }, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        }
        
        return buffer;
    } catch (error) {
        console.error('压缩错误:', error);
        // 如果压缩失败，返回原始数据
        return buffer;
    }
}

const proxyMiddleware = (req, res, next) => {
    try {
        const url = new URL(req.targetUrl);
        const proxyOpts = {
            parseReqBody: false,
            proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
                const targetHost = url.host;
                // 确定正确的 Referer 和 Origin 头
                let referer, origin;
                
                // 为 metaso.cn 设置特殊处理
                if (targetHost.includes('metaso.cn')) {
                    // 为 metaso.cn 设置特殊的 Referer 和 Origin
                    referer = `https://metaso.cn/`;
                    origin = 'https://metaso.cn';
                    
                    // 如果路径是静态资源，使用更精确的 Referer
                    if (isStaticResource(srcReq.targetUrl)) {
                        // 对于静态资源，设置 Referer 为首页
                        referer = 'https://metaso.cn/';
                    }
                } else {
                    // 常规情况下使用目标主机的域名
                    referer = `https://${targetHost}/`;
                    origin = `https://${targetHost}`;
                }
                
                // 保留原始请求的一些头，以应对一些网站的反爬措施
                proxyReqOpts.headers = {
                    ...proxyReqOpts.headers,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    // 明确指定编码类型，但包括所有主要格式以确保兼容性
                    'accept-encoding': 'gzip, deflate, br',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
                    'host': targetHost,
                    'referer': referer,
                    'origin': origin,
                    'cache-control': 'no-cache',
                    'sec-ch-ua': '"Microsoft Edge";v="121", "Not A(Brand";v="99", "Chromium";v="121"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': srcReq.headers['sec-fetch-dest'] || 'document',
                    'sec-fetch-mode': srcReq.headers['sec-fetch-mode'] || 'navigate',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1'
                }
                
                // 只为 metaso.cn 添加授权信息
                if (targetHost.includes('metaso.cn')) {
                    console.log('为 metaso.cn 请求添加专用授权令牌');
                    // 添加授权头和Cookie
                    proxyReqOpts.headers['token'] = AUTH_TOKEN;
                    proxyReqOpts.headers['x-token'] = AUTH_TOKEN;
                    proxyReqOpts.headers['authorization'] = AUTH_TOKEN;
                    proxyReqOpts.headers['x-authorization'] = AUTH_TOKEN;
                    proxyReqOpts.headers['cookie'] = `token=${AUTH_TOKEN.replace('Bearer ', '')}; sid=${AUTH_SID}; uid=9527; aliyungf_tc=${crypto.randomBytes(32).toString('hex')}; _metasocn_session=${crypto.randomBytes(16).toString('hex')}`;
                }
                
                // 移除可能导致304响应或其他缓存问题的头
                delete proxyReqOpts.headers['if-none-match'];
                delete proxyReqOpts.headers['if-modified-since'];
                
                // 记录最终的请求头
                console.log('代理请求头:', {
                    url: srcReq.targetUrl,
                    referer: proxyReqOpts.headers.referer,
                    origin: proxyReqOpts.headers.origin,
                    host: proxyReqOpts.headers.host
                });

                return proxyReqOpts;
            },
            userResDecorator: async (proxyRes, proxyResData, userReq, userRes) => {
                try {
                    // 记录响应信息
                    const contentType = proxyRes.headers['content-type'] || '';
                    const encoding = proxyRes.headers['content-encoding'];
                    const statusCode = proxyRes.statusCode;
                    
                // 修复 Content-Length 和 Transfer-Encoding 冲突
                // 删除造成冲突的头部
                if (proxyRes.headers['content-length'] && proxyRes.headers['transfer-encoding']) {
                    delete proxyRes.headers['transfer-encoding'];
                }
                
                // 拦截用户信息API请求，返回模拟的已登录用户数据
                if (userReq.targetUrl.includes('/api/my-info') || 
                    userReq.targetUrl.includes('/api/user/info') ||
                    userReq.targetUrl.includes('/api/user/profile')) {
                    console.log('拦截用户信息API请求，返回真实授权数据:', userReq.targetUrl);
                    // 创建用户信息响应，使用真实授权信息
                    const mockUserInfo = {
                        code: 0,
                        message: 'success',
                        data: {
                            id: 9527, // 真实ID将由系统自动识别
                            nickname: 'MetaSO用户',
                            avatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJxjnHY3Elib2qgxlNMOvBPnticKpJWlDGBbvAtpUjqx8xhbvvJUfyZ6wJ3Cv5NZa3dCo0LslCUw6xw/132',
                            isVip: true,
                            vipExpireTime: '2030-12-31 23:59:59',
                            email: 'user@metaso.cn',
                            loginTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
                            token: AUTH_TOKEN,
                            sid: AUTH_SID,
                            
                            // 附加属性，用于各种API响应
                            userId: 12345678,
                            username: '自动登录用户',
                            phone: '13800138000',
                            level: 3,
                            points: 9999,
                            status: 1,
                            lastLoginTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
                            createdAt: '2023-01-01 00:00:00'
                        }
                    };
                    
                    // 设置响应头
                    userRes.setHeader('content-type', 'application/json;charset=UTF-8');
                    return Buffer.from(JSON.stringify(mockUserInfo), 'utf8');
                }
                
                // 拦截登录状态检查API请求
                if (userReq.targetUrl.includes('/api/auth/status') || 
                    userReq.targetUrl.includes('/api/user/status') ||
                    userReq.targetUrl.includes('/api/user/check') ||
                    userReq.targetUrl.includes('/api/login/check')) {
                    console.log('拦截登录状态检查请求，返回已登录状态:', userReq.targetUrl);
                    const loginStatus = {
                        code: 0,
                        message: 'success',
                        data: {
                            isLogin: true,
                            isAuth: true,
                            isVip: true,
                            token: AUTH_TOKEN
                        }
                    };
                    
                    // 设置响应头
                    userRes.setHeader('content-type', 'application/json;charset=UTF-8');
                    return Buffer.from(JSON.stringify(loginStatus), 'utf8');
                }
                
                // 修改一般性API响应，如果返回未登录错误，则替换为已登录成功
                if (contentType.includes('application/json') && userReq.targetUrl.includes('/api/')) {
                    // 尝试解析JSON响应
                    try {
                        let jsonData;
                        let responseBody = proxyResData.toString('utf8');
                        
                        // 尝试解析JSON
                        try {
                            jsonData = JSON.parse(responseBody);
                        } catch (e) {
                            console.log('API响应不是有效的JSON格式，跳过处理');
                            return proxyResData;
                        }
                        
                        // 检查是否含有未登录错误代码或消息
                        if ((jsonData.code === 401 || jsonData.code === -1 || jsonData.code === 1001) ||
                            (jsonData.message && (
                                jsonData.message.includes('未登录') || 
                                jsonData.message.includes('请登录') || 
                                jsonData.message.includes('login required') || 
                                jsonData.message.includes('unauthorized')
                            ))) {
                            console.log('检测到API未登录响应，使用真实授权信息替换:', userReq.targetUrl);
                            
                            // 替换为已登录成功的响应，使用真实授权凭据
                            const successResponse = {
                                code: 0,
                                message: 'success',
                                data: jsonData.data || {
                                    token: AUTH_TOKEN,
                                    sid: AUTH_SID,
                                    isLogin: true
                                }
                            };
                            
                            return Buffer.from(JSON.stringify(successResponse), 'utf8');
                        }
                    } catch (e) {
                        console.error('处理API响应时出错:', e);
                    }
                }
                
                // 微信登录相关特殊处理 - 已不需要，但保留代码以备将来需要
                if (userReq.targetUrl.includes('weixin.qq.com') || userReq.targetUrl.includes('open.weixin.qq.com')) {
                    console.log('检测到微信登录相关请求:', userReq.targetUrl);
                    // 微信登录请求特殊处理，保持响应头
                    Object.keys(proxyRes.headers).forEach(key => {
                        if (key !== 'content-length' && key !== 'transfer-encoding') {
                            userRes.setHeader(key, proxyRes.headers[key]);
                        }
                    });
                    
                    // 微信登录不修改响应体，直接返回
                    if (statusCode === 302 || statusCode === 301) {
                        console.log('处理微信登录重定向，保持原始 Location:', proxyRes.headers.location);
                        return proxyResData;
                    }
                }                    console.log('处理响应:', {
                        contentType: contentType,
                        contentEncoding: encoding,
                        contentLength: proxyResData.length,
                        statusCode: statusCode,
                        url: userReq.targetUrl
                    });

                    // 如果是 403 或 401 错误，检查是否为静态资源
                    const isStaticResource = (url) => {
                        const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf'];
                        return staticExtensions.some(ext => url.toLowerCase().endsWith(ext));
                    };
                    
                    if ((statusCode === 403 || statusCode === 401) && isStaticResource(userReq.targetUrl)) {
                        console.log('检测到静态资源访问被拒绝:', userReq.targetUrl);
                        // 对于被拒绝的静态资源，我们不进行特殊处理，保持原样
                        return proxyResData;
                    }

                    // 处理重定向响应
                    if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) {
                        console.log('检测到重定向响应:', statusCode, '目标:', proxyRes.headers.location);
                        
                        if (proxyRes.headers.location) {
                            // 如果location是绝对URL
                            let redirectUrl = proxyRes.headers.location;
                            
                            // 将重定向URL转换为代理URL
                            if (redirectUrl.startsWith('http')) {
                                // 绝对URL，直接转换为代理URL
                                redirectUrl = `/proxy/${encodeURIComponent(redirectUrl)}`;
                            } else if (redirectUrl.startsWith('/')) {
                                // 相对于根的URL
                                const targetOrigin = new URL(userReq.targetUrl).origin;
                                redirectUrl = `/proxy/${encodeURIComponent(targetOrigin + redirectUrl)}`;
                            } else {
                                // 相对URL，需要基于当前URL计算
                                const targetUrl = new URL(userReq.targetUrl);
                                const basePath = targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf('/') + 1);
                                const fullRedirectUrl = new URL(redirectUrl, targetUrl.origin + basePath).href;
                                redirectUrl = `/proxy/${encodeURIComponent(fullRedirectUrl)}`;
                            }
                            
                            console.log('重定向已转换为:', redirectUrl);
                            
                            // 创建新的头部对象
                            const redirectHeaders = { ...proxyRes.headers };
                            
                            // 设置新的location头
                            redirectHeaders.location = redirectUrl;
                            
                            // 直接返回修改后的响应，不需要进一步处理
                            Object.entries(redirectHeaders).forEach(([key, value]) => {
                                if (value !== undefined && value !== null) {
                                    userRes.setHeader(key, value);
                                }
                            });
                            
                            // 不需要任何内容体
                            return Buffer.alloc(0);
                        }
                    }
                
                    // 1. 尝试解压缩响应数据
                    let decompressedData;
                    try {
                        // 如果数据很小或没有编码或状态码不是200，跳过解压缩
                        if (!encoding || proxyResData.length < 100 || statusCode !== 200) {
                            decompressedData = proxyResData;
                        } else {
                            decompressedData = await decompress(proxyResData, encoding);
                            // 打印解压后大小，用于调试
                            console.log(`解压缩完成: ${proxyResData.length} -> ${decompressedData.length} 字节`);
                        }
                    } catch (decompressError) {
                        console.error('解压缩失败，使用原始数据:', decompressError);
                        decompressedData = proxyResData;
                    }
                    
                    // 2. 处理内容（如果是HTML且状态码是200）
                    let processedData = decompressedData;
                    if (contentType.includes('text/html') && statusCode === 200) {
                        try {
                            const htmlContent = decompressedData.toString('utf8');
                            const processedHtml = await processHtml(htmlContent, url.host);
                            processedData = Buffer.from(processedHtml, 'utf8');
                        } catch (htmlError) {
                            console.error('HTML处理失败:', htmlError);
                            console.error(htmlError.stack);
                            processedData = decompressedData;
                        }
                    }

                    // 3. 直接使用解压缩后的数据，不重新压缩
                    let finalData = processedData;
                    
                    // 4. 设置响应头
                    const headers = { ...proxyRes.headers };
                    
                    // 删除所有与内容编码相关的头，因为我们已经解压缩了数据
                    delete headers['content-encoding'];
                    delete headers['Content-Encoding'];
                    
                    // 更新内容长度
                    headers['content-length'] = finalData.length;
                    headers['vary'] = 'Accept-Encoding';  // 添加Vary头，帮助缓存服务器
                    
                    // 删除限制性头部 - 完全移除所有安全相关头，确保内联脚本可以执行
                    delete headers['x-frame-options'];
                    delete headers['X-Frame-Options'];
                    delete headers['content-security-policy'];
                    delete headers['Content-Security-Policy'];
                    delete headers['content-security-policy-report-only'];
                    delete headers['Content-Security-Policy-Report-Only'];
                    delete headers['strict-transport-security'];
                    delete headers['Strict-Transport-Security'];
                    
                    // 为Bing特别处理
                    if (userReq.targetUrl.includes('bing.com')) {
                        // 添加允许内联脚本执行的头部
                        headers['content-security-policy'] = "script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; default-src * data: blob:; frame-ancestors * 'self';";
                    }

                    // 设置所有响应头
                    Object.entries(headers).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            userRes.setHeader(key, value);
                        }
                    });

                    return finalData;
                } catch (error) {
                    console.error('响应处理错误:', error);
                    // 在发生错误时，尝试返回未修改的原始响应
                    Object.entries(proxyRes.headers).forEach(([key, value]) => {
                        if (value !== undefined && value !== null) {
                            try {
                                userRes.setHeader(key, value);
                            } catch (headerError) {
                                console.error('设置响应头失败:', headerError);
                            }
                        }
                    });
                    return proxyResData;
                }
            },
            proxyErrorHandler: (err, res, next) => {
                console.error('代理错误:', err);
                next(err);
            }
        };

        // 创建代理实例
        const proxyInstance = proxy(url.origin, {
            ...proxyOpts,
            // 设置请求路径
            proxyReqPathResolver: () => {
                const path = url.pathname + url.search;
                console.log('代理路径:', path);
                return path;
            }
        });

        // 执行代理
        return proxyInstance(req, res, next);
    } catch (error) {
        console.error('代理中间件错误:', error);
        next(error);
    }
};

// 预设的授权令牌 - 从真实登录获取的有效凭证
const AUTH_TOKEN = 'Bearer mk-4465AFED0CEAFB47AD2EFA726A88C026';
const AUTH_SID = 'f67f62dc1e26491db55770dbc2c93d32';

// API 状态检查端点 - 返回当前登录状态
app.get('/api/login-status', (req, res) => {
    console.log('接收到登录状态检查请求');
    res.json({
        isLoggedIn: true,
        username: '自动登录用户',
        userId: 12345678,
        token: AUTH_TOKEN.substring(0, 20) + '...' // 不要显示完整token
    });
});

// 捕获所有非代理路径的请求，重定向到代理
app.get('*', (req, res, next) => {
    // 跳过静态文件、代理路径和百度搜索路径(/s)
    if (req.path.startsWith('/static/') || 
        req.path.startsWith('/proxy/') || 
        req.path === '/s') {
        return next();
    }
    
    // 如果是根路径，显示主页
    if (req.path === '/') {
        return res.send(`
            <html>
                <head>
                    <title>Proxy Server</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                        pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <h1>Proxy Server</h1>
                    <p>使用方法：</p>
                    <pre>http://localhost:10101/proxy/https://example.com</pre>
                    <p>在iframe中使用：</p>
                    <pre>&lt;iframe src="http://localhost:10101/proxy/https://example.com"&gt;&lt;/iframe&gt;</pre>
                    <h2>示例：</h2>
                    <ul>
                        <li><a href="/proxy/https://example.com">访问 example.com</a></li>
                        <li><a href="/proxy/https://github.com">访问 GitHub</a></li>
                        <li><a href="/proxy/https://www.baidu.com">访问 百度</a></li>
                        <li><a href="/proxy/https://cn.bing.com">访问 必应</a></li>
                    </ul>
                </body>
            </html>
        `);
    }
    
    // 对于其他路径，尝试从referer中获取目标域名并重定向
    const referer = req.headers.referer;
    if (referer && referer.includes('/proxy/')) {
        try {
            // 从referer中提取目标域名和完整路径
            const proxyMatch = referer.match(/\/proxy\/([^?#]+)/);
            if (proxyMatch) {
                const encodedTargetUrl = proxyMatch[1];
                const targetUrl = decodeURIComponent(encodedTargetUrl);
                const targetUrlObj = new URL(targetUrl);
                
                // 提取当前页面在目标网站上的路径
                let targetBasePath = targetUrlObj.pathname;
                // 如果当前页面是一个文件（包含扩展名），则取其目录部分
                if (targetBasePath.includes('.')) {
                    targetBasePath = targetBasePath.substring(0, targetBasePath.lastIndexOf('/') + 1);
                } else if (!targetBasePath.endsWith('/')) {
                    targetBasePath = targetBasePath + '/';
                }
                
                // 构建完整的目标URL - 考虑相对路径
                let fullTargetUrl;
                
                if (req.path.startsWith('/')) {
                    // 绝对路径
                    fullTargetUrl = targetUrlObj.origin + req.path;
                } else {
                    // 相对路径 - 相对于当前页面的路径
                    fullTargetUrl = targetUrlObj.origin + targetBasePath + req.path;
                }
                
                // 添加查询字符串（如果有）
                if (req.url.includes('?')) {
                    fullTargetUrl += '?' + req.url.split('?')[1];
                }
                
                const proxyUrl = `/proxy/${encodeURIComponent(fullTargetUrl)}`;
                
                console.log(`重定向路径 ${req.path} 到代理URL: ${proxyUrl}`);
                console.log(`目标URL详情: Origin=${targetUrlObj.origin}, BasePath=${targetBasePath}, FullPath=${fullTargetUrl}`);
                
                return res.redirect(proxyUrl);
            }
        } catch (error) {
            console.error('解析referer失败:', error);
            console.error('- Referer:', referer);
            console.error('- 请求路径:', req.path);
            console.error('- 错误详情:', error.stack);
        }
    }
    
    // 如果无法确定目标域名，返回404
    res.status(404).json({
        error: 'Not Found',
        message: `路径 ${req.path} 未找到。请使用代理格式: /proxy/[目标URL]`,
        path: req.path,
        referer: referer || '无'
    });
});

// 添加特殊路由处理百度搜索 - 改进版
app.get('/s', (req, res) => {
    console.log('收到百度搜索请求:', {
        url: req.url,
        query: req.query,
        referer: req.headers.referer
    });
    
    // 无论是什么情况，都直接将请求重定向到百度搜索
    // 保留所有查询参数
    const searchParams = new URLSearchParams(req.query).toString();
    const baiduSearchUrl = `https://www.baidu.com/s${searchParams ? '?' + searchParams : ''}`;
    
    console.log('重定向到百度搜索:', baiduSearchUrl);
    
    // 重定向到代理的百度搜索结果页
    return res.redirect(`/proxy/${encodeURIComponent(baiduSearchUrl)}`);
});

// 处理百度搜索的POST请求
app.post('/s', express.urlencoded({ extended: true }), (req, res) => {
    console.log('收到百度搜索POST请求:', {
        body: req.body,
        referer: req.headers.referer
    });
    
    // 构建查询字符串
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body)) {
        searchParams.append(key, value);
    }
    
    const baiduSearchUrl = `https://www.baidu.com/s?${searchParams.toString()}`;
    
    console.log('重定向到百度搜索 (POST):', baiduSearchUrl);
    
    // 重定向到代理的百度搜索结果页
    return res.redirect(`/proxy/${encodeURIComponent(baiduSearchUrl)}`);
});

// 应用中间件 - 只对 /proxy/ 路径应用验证和代理中间件
app.use('/proxy/*', validateUrl, cacheMiddleware, proxyMiddleware);

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Detailed Error Info:');
    console.error('- Message:', err.message);
    console.error('- Code:', err.code);
    console.error('- Stack:', err.stack);
    console.error('- Request URL:', req.url);
    console.error('- Target URL:', req.targetUrl);
    console.error('- Headers:', req.headers);

    // 根据错误类型返回适当的状态码和消息
    if (err.message === 'Invalid proxy URL format' || err.message === 'Invalid URL format') {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid URL format. URL should be properly encoded and in the format: /proxy/[encoded-url]',
            details: {
                errorMessage: err.message,
                requestUrl: req.url,
                targetUrl: req.targetUrl
            }
        });
    } else if (err.code === 'ENOTFOUND') {
        res.status(404).json({
            error: 'Not Found',
            message: 'The requested host could not be found',
            details: {
                errorMessage: err.message,
                requestUrl: req.url,
                targetUrl: req.targetUrl
            }
        });
    } else if (err.code === 'ECONNREFUSED') {
        res.status(503).json({
            error: 'Service Unavailable',
            message: 'Could not connect to the target server',
            details: {
                errorMessage: err.message,
                requestUrl: req.url,
                targetUrl: req.targetUrl
            }
        });
    } else {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
            details: {
                errorMessage: err.message,
                errorCode: err.code,
                requestUrl: req.url,
                targetUrl: req.targetUrl
            }
        });
    }
});

const PORT = 10101;
app.listen(PORT, () => {
    console.log(`代理服务器运行在 http://localhost:${PORT}`);
    console.log(`使用方式: http://localhost:${PORT}/proxy/目标网址`);
});
