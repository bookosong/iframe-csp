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

// 读取代理脚本
const proxyScript = fs.readFileSync(path.join(__dirname, 'static', 'proxy.js'), 'utf8');

// 配置日志
app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));

// 工具函数：检查是否为静态资源
const isStaticResource = (url) => {
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
                            '.mp4', '.webp', '.woff', '.woff2', '.ttf', '.ico'];
    return staticExtensions.some(ext => url.toLowerCase().endsWith(ext));
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
    
    // 修改CSP
    const cspHeaders = ['content-security-policy', 'content-security-policy-report-only'];
    cspHeaders.forEach(header => {
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
        
        // 修改所有绝对路径
        const updateAttribute = (elem, attr) => {
            const value = $(elem).attr(attr);
            if (!value) return;
            
            // 如果已经是代理URL，跳过处理
            if (value.startsWith('/proxy/') || value.includes('/proxy/')) {
                return;
            }
            
            // 跳过特殊URL
            if (value.startsWith('javascript:') || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:')) {
                return;
            }
            
            let finalUrl = '';
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
                $(elem).attr(attr, `/proxy/${encodeURIComponent(finalUrl)}`);
            } else if (value.startsWith('//')) {
                $(elem).attr(attr, `/proxy/${encodeURIComponent('https:' + value)}`);
            } else if (value.startsWith('/')) {
                $(elem).attr(attr, `/proxy/${encodeURIComponent('https://' + targetHost + value)}`);
            }
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

        // 移除所有可能导致新窗口打开的JavaScript代码
        $('script').each((_, elem) => {
            const scriptContent = $(elem).html();
            if (scriptContent && (scriptContent.includes('window.open') || scriptContent.includes('target="_blank"') || scriptContent.includes("target='_blank'"))) {
                // 替换window.open调用为当前窗口导航
                let newContent = scriptContent
                    .replace(/window\.open\s*\([^)]*\)/g, 'window.location.href = arguments[0]')
                    .replace(/target\s*=\s*["']_blank["']/g, '')
                    .replace(/target\s*:\s*["']_blank["']/g, '');
                $(elem).html(newContent);
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
            const action = $(elem).attr('action');
            if (!action || action === '') {
                // 如果没有action或action为空，设置为当前页面的代理URL
                $(elem).attr('action', `/proxy/${encodeURIComponent('https://' + targetHost)}`);
            }
        });

        // 处理内联样式中的URL
        $('[style]').each((_, elem) => {
            const style = $(elem).attr('style');
            if (style) {
                const newStyle = style.replace(/url\(['"]?(http[s]?:\/\/[^)'"]+)['"]?\)/g, 
                    (match, url) => `url('/proxy/${encodeURIComponent(url)}')`);
                $(elem).attr('style', newStyle);
            }
        });

        // 处理CSS中的URL
        $('style').each((_, elem) => {
            const css = $(elem).html();
            if (css) {
                const newCss = css.replace(/url\(['"]?(http[s]?:\/\/[^)'"]+)['"]?\)/g, 
                    (match, url) => `url('/proxy/${encodeURIComponent(url)}')`);
                $(elem).html(newCss);
            }
        });

        // 处理 <base> 标签
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
            method: req.method,
            headers: req.headers
        });

        // 解码 URL - 移除 /proxy/ 前缀
        // 注意：Express 路由匹配后，req.url 可能已经被修改
        const fullUrl = req.originalUrl || req.url;
        // 移除 /proxy/ 前缀
        let targetUrl = fullUrl.substring('/proxy/'.length);
        
        // 尝试解码直到没有更多需要解码的内容
        let prevUrl;
        do {
            prevUrl = targetUrl;
            try {
                targetUrl = decodeURIComponent(prevUrl);
            } catch (e) {
                // 如果解码失败，使用最后一次成功解码的结果
                targetUrl = prevUrl;
                break;
            }
        } while (targetUrl !== prevUrl);

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
            originalUrl: req.url,
            targetUrl: targetUrl,
            targetHost: parsedUrl.hostname,
            targetPath: parsedUrl.pathname
        });

        next();
    } catch (error) {
        console.error('URL 验证错误:', error);
        next(error);
    }
};

// 设置路由
app.use('/static', express.static(path.join(__dirname, 'static')));
// 代理中间件
// 解压缩函数
async function decompress(buffer, encoding) {
    if (!buffer || buffer.length === 0) {
        return buffer;
    }
    try {
        // 先检查数据是否已经被解压缩
        const magicBytes = buffer.slice(0, 2);
        const isBrotli = buffer[0] === 0x1b;  // Brotli magic byte
        const isGzip = magicBytes[0] === 0x1f && magicBytes[1] === 0x8b;  // Gzip magic bytes
        const isDeflate = magicBytes[0] === 0x78;  // Deflate magic byte

        // 如果已经解压缩过或者格式不正确，返回原始数据
        if (!encoding || (!isBrotli && !isGzip && !isDeflate)) {
            return buffer;
        }

        let result;
        if (encoding === 'gzip' && isGzip) {
            result = await new Promise((resolve, reject) => {
                zlib.gunzip(buffer, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } else if (encoding === 'deflate' && isDeflate) {
            result = await new Promise((resolve, reject) => {
                zlib.inflate(buffer, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } else if (encoding === 'br' && isBrotli) {
            result = await new Promise((resolve, reject) => {
                zlib.brotliDecompress(buffer, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } else {
            console.warn(`无法识别的压缩格式: ${encoding}`);
            return buffer;
        }
        return result;
    } catch (error) {
        console.error('解压缩错误:', error);
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
            proxyReqOptDecorator: (proxyReqOpts) => {
                proxyReqOpts.headers = {
                    ...proxyReqOpts.headers,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'accept-encoding': 'gzip, deflate, br',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'host': url.host
                };

                delete proxyReqOpts.headers['if-none-match'];
                delete proxyReqOpts.headers['if-modified-since'];

                return proxyReqOpts;
            },
            userResDecorator: async (proxyRes, proxyResData, userReq, userRes) => {
                try {
                    // 记录响应信息
                    const contentType = proxyRes.headers['content-type'] || '';
                    const encoding = proxyRes.headers['content-encoding'];
                    console.log('处理响应:', {
                        contentType: contentType,
                        contentEncoding: encoding,
                        contentLength: proxyResData.length
                    });

                    // 1. 尝试解压缩响应数据
                    let decompressedData;
                    try {
                        decompressedData = await decompress(proxyResData, encoding);
                    } catch (decompressError) {
                        console.error('解压缩失败，使用原始数据:', decompressError);
                        decompressedData = proxyResData;
                    }
                    
                    // 2. 处理内容（如果是HTML）
                    let processedData = decompressedData;
                    if (contentType.includes('text/html')) {
                        try {
                            const htmlContent = decompressedData.toString('utf8');
                            const processedHtml = await processHtml(htmlContent, url.host);
                            processedData = Buffer.from(processedHtml, 'utf8');
                        } catch (htmlError) {
                            console.error('HTML处理失败:', htmlError);
                            processedData = decompressedData;
                        }
                    }

                    // 3. 不进行压缩，直接使用解压缩后的数据
                    let finalData = processedData;
                    let finalEncoding = null;

                    // 4. 设置响应头
                    const headers = { ...proxyRes.headers };
                    if (finalEncoding) {
                        headers['content-encoding'] = finalEncoding;
                    } else {
                        delete headers['content-encoding'];  // 如果不压缩，删除content-encoding头
                    }
                    headers['content-length'] = finalData.length;
                    headers['vary'] = 'Accept-Encoding';  // 添加Vary头，帮助缓存服务器
                    
                    // 删除限制性头部
                    delete headers['x-frame-options'];
                    delete headers['X-Frame-Options'];
                    delete headers['content-security-policy'];
                    delete headers['Content-Security-Policy'];
                    delete headers['strict-transport-security'];
                    delete headers['Strict-Transport-Security'];

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

// 捕获所有非代理路径的请求，重定向到代理
app.get('*', (req, res, next) => {
    // 跳过静态文件和代理路径
    if (req.path.startsWith('/static/') || req.path.startsWith('/proxy/')) {
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
                    </ul>
                </body>
            </html>
        `);
    }
    
    // 对于其他路径，尝试从referer中获取目标域名并重定向
    const referer = req.headers.referer;
    if (referer && referer.includes('/proxy/')) {
        try {
            // 从referer中提取目标域名
            const proxyMatch = referer.match(/\/proxy\/([^\/]+)/);
            if (proxyMatch) {
                const encodedTargetUrl = proxyMatch[1];
                const targetUrl = decodeURIComponent(encodedTargetUrl);
                const targetUrlObj = new URL(targetUrl);
                
                // 构建完整的目标URL
                const fullTargetUrl = targetUrlObj.origin + req.path + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
                const proxyUrl = `/proxy/${encodeURIComponent(fullTargetUrl)}`;
                
                console.log(`重定向路径 ${req.path} 到代理URL: ${proxyUrl}`);
                return res.redirect(proxyUrl);
            }
        } catch (error) {
            console.error('解析referer失败:', error);
        }
    }
    
    // 如果无法确定目标域名，返回404
    res.status(404).json({
        error: 'Not Found',
        message: `路径 ${req.path} 未找到。请使用代理格式: /proxy/[目标URL]`,
        path: req.path
    });
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
