const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const https = require('https');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 10101;

// 日志功能
const logger = {
    info: (...args) => console.log('[INFO]', new Date().toISOString(), ...args),
    debug: (...args) => console.log('[DEBUG]', new Date().toISOString(), ...args),
    error: (...args) => console.log('[ERROR]', new Date().toISOString(), ...args),
    warn: (...args) => console.log('[WARN]', new Date().toISOString(), ...args)
};

// 添加请求日志中间件
app.use((req, res, next) => {
    logger.debug(`收到请求: ${req.method} ${req.url}`);
    logger.debug(`请求头: ${JSON.stringify(req.headers, null, 2)}`);
    logger.debug(`查询参数: ${JSON.stringify(req.query, null, 2)}`);
    
    // 记录响应完成时间
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.debug(`响应完成: ${req.method} ${req.url} - 状态码: ${res.statusCode}, 耗时: ${duration}ms`);
    });
    
    next();
});

// 代理静态资源 - 解决CORS问题
app.use('/static-1.metaso.cn', proxy('https://static-1.metaso.cn', {
    https: true,
    changeOrigin: true,
    timeout: 30000,
    proxyReqPathResolver: function(req) {
        logger.debug(`代理静态资源: ${req.url}`);
        return req.url;
    },
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        // 添加CORS头
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        return headers;
    }
}));

// 代理_next静态资源
app.use('/_next', proxy('https://static-1.metaso.cn/_next', {
    https: true,
    changeOrigin: true,
    timeout: 30000,
    proxyReqPathResolver: function(req) {
        logger.debug(`代理_next资源: ${req.url}`);
        return req.url;
    },
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        return headers;
    }
}));

// 静态文件服务 - 优先提供本地文件，然后回退到代理
app.use('/static', express.static(path.join(__dirname, 'static'), {
    setHeaders: (res, path) => {
        // 移除阻止iframe的头部
        res.removeHeader('X-Frame-Options');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    }
}));

// 静态资源回退代理 - 如果本地文件不存在，则代理到原始服务器
app.use('/static', proxy('https://static-1.metaso.cn/static', {
    https: true,
    changeOrigin: true,
    timeout: 30000,
    proxyReqPathResolver: function(req) {
        logger.debug(`回退代理static资源: ${req.url}`);
        return req.url;
    },
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        return headers;
    }
}));

// 直接访问本地文件的路由
app.get('/rmb_search_result.html', (req, res) => {
    const filePath = path.join(__dirname, 'rmb_search_result.html');
    logger.info(`访问本地文件: ${filePath}`);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(filePath);
});

app.get('/rmb_search_preview.html', (req, res) => {
    const filePath = path.join(__dirname, 'rmb_search_preview.html');
    logger.info(`访问预览文件: ${filePath}`);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(filePath);
});

// 测试路由
app.get('/test', (req, res) => {
    logger.info('=== 测试路由被访问 ===');
    logger.debug(`请求参数: ${JSON.stringify(req.params)}`);
    logger.debug(`查询参数: ${JSON.stringify(req.query)}`);
    
    const response = { 
        message: '服务器运行正常',
        timestamp: new Date().toISOString(),
        version: 'v2.8',
        requestInfo: {
            method: req.method,
            url: req.url,
            headers: req.headers
        }
    };
    
    logger.info('测试路由响应成功');
    res.json(response);
});

// 测试动态ID生成路由
app.get('/test-dynamic', (req, res) => {
    logger.info('=== 测试动态ID生成 ===');
    
    const dynamicIds = {
        uid: generateUID(),
        sid: generateSID(),
        sessionId: generateSessionId(),
        eventId: generateEventId(),
        finalSearchId: generateFinalSearchId(),
        uuid: uuidv4(),
        timestamp: Date.now()
    };
    
    logger.debug(`生成的动态ID: ${JSON.stringify(dynamicIds, null, 2)}`);
    
    res.json({
        message: '动态ID生成测试',
        dynamicIds: dynamicIds,
        description: {
            uid: '16位十六进制用户ID',
            sid: '32位十六进制会话ID', 
            sessionId: '32位大写十六进制Session ID',
            eventId: '10位随机Event ID',
            finalSearchId: '19位数字搜索ID',
            uuid: '标准UUID v4格式'
        }
    });
});

// 简化搜索测试路由
app.get('/search-simple/:id', async (req, res) => {
    const searchId = req.params.id;
    const query = req.query.q;
    
    logger.info(`=== 简化搜索测试 ===`);
    logger.info(`搜索ID: ${searchId}, 查询词: ${query}`);
    
    if (!query) {
        return res.status(400).json({ error: '缺少查询参数q' });
    }
    
    try {
        // 生成动态会话信息
        const sessionInfo = {
            uid: generateUID(),
            sid: generateSID(),
            timestamp: Date.now()
        };
        
        logger.info(`生成动态会话: ${JSON.stringify(sessionInfo)}`);
        
        // 直接访问metaso.cn的搜索页面
        const searchUrl = `https://metaso.cn/search/${uuidv4()}?q=${encodeURIComponent(query)}`;
        logger.info(`访问搜索URL: ${searchUrl}`);
        
        const response = await makeHttpsRequest(searchUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',
                'Cookie': `uid=${sessionInfo.uid}; sid=${sessionInfo.sid}; token=mk-4A9944E6F3917711EFCF7B772BC3A5AE; isLoggedIn=true`
            }
        });
        
        logger.info(`搜索页面获取成功: 状态码 ${response.statusCode}, 长度 ${response.data.length}`);
        
        // 基本HTML处理
        const processedHtml = processHtmlResponse(response.data);
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(processedHtml);
        
        logger.info(`简化搜索完成: "${query}"`);
        
    } catch (error) {
        logger.error('简化搜索错误:', error);
        res.status(500).json({
            error: '搜索错误',
            message: error.message,
            query: query,
            searchId: searchId
        });
    }
});
app.get('/search/:id', async (req, res) => {
    const searchId = req.params.id;
    const query = req.query.q;
    
    logger.info(`=== 搜索请求开始 ===`);
    logger.info(`搜索ID: ${searchId}`);
    logger.info(`查询词: ${query}`);
    logger.debug(`完整URL: ${req.url}`);
    logger.debug(`请求方法: ${req.method}`);
    logger.debug(`请求头: ${JSON.stringify(req.headers, null, 2)}`);
    
    if (!query) {
        logger.warn('缺少查询参数q');
        const errorResponse = { 
            error: '缺少查询参数q', 
            usage: '/search/ID?q=查询词',
            receivedParams: {
                searchId: searchId,
                query: query,
                allParams: req.params,
                allQuery: req.query
            }
        };
        logger.debug(`错误响应: ${JSON.stringify(errorResponse, null, 2)}`);
        return res.status(400).json(errorResponse);
    }
    
    try {
        logger.info('开始执行搜索流程...');
        
        // 按照您提供的抓包分析，实现完整的搜索流程
        const searchResult = await performCompleteSearchFlow(searchId, query);
        
        if (searchResult.success) {
            logger.info(`搜索流程完成，最终URL: ${searchResult.finalUrl}`);
            logger.debug(`HTML长度: ${searchResult.html.length}`);
            
            // 返回处理后的HTML
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Frame-Options', 'ALLOWALL');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(searchResult.html);
            
            logger.info(`搜索完成: "${query}" [ID:${searchId}]`);
        } else {
            logger.error(`搜索流程失败: ${searchResult.error}`);
            throw new Error(searchResult.error || '搜索流程失败');
        }
        
    } catch (error) {
        logger.error('搜索处理错误:', error);
        logger.error(`错误堆栈: ${error.stack}`);
        
        const errorResponse = {
            error: '搜索处理错误',
            message: error.message,
            query: query,
            searchId: searchId,
            timestamp: new Date().toISOString()
        };
        
        res.status(500).json(errorResponse);
    }
});

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 实现完整的搜索流程 - 按照抓包分析，增强版本
async function performCompleteSearchFlow(searchId, query) {
    logger.info('=== 开始执行完整搜索流程 ===');
    logger.debug(`输入参数 - searchId: ${searchId}, query: ${query}`);
    
    // 初始化会话状态 - 只保留必要的授权token，其他值动态获取
    let cookies = {
        'token': 'mk-4A9944E6F3917711EFCF7B772BC3A5AE'  // 用户权限token，保持固定
    };
    
    // 生成动态的会话标识
    const sessionInfo = {
        uid: generateUID(),           // 动态生成用户ID
        sid: generateSID(),           // 动态生成会话ID
        timestamp: Date.now()
    };
    
    logger.debug(`初始cookies: ${JSON.stringify(cookies, null, 2)}`);
    logger.debug(`会话信息: ${JSON.stringify(sessionInfo, null, 2)}`);
    
    const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://metaso.cn/',
        'Authorization': 'Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE',  // 保持固定的授权token
        'X-User-ID': sessionInfo.uid,     // 使用动态生成的用户ID
        'X-Session-ID': sessionInfo.sid   // 使用动态生成的会话ID
    };
    
    function getCookieString() {
        // 合并固定token、动态会话信息和从服务器获取的cookies
        const allCookies = {
            ...cookies,  // 包含token和从服务器获取的cookies
            'uid': sessionInfo.uid,
            'sid': sessionInfo.sid,
            'isLoggedIn': 'true'
        };
        
        const cookieStr = Object.entries(allCookies).map(([k, v]) => `${k}=${v}`).join('; ');
        logger.debug(`生成cookie字符串: ${cookieStr}`);
        return cookieStr;
    }
    
    try {
        // 步骤1: 访问 https://metaso.cn/search/[id]?_rsc=1p5af
        logger.info('=== 步骤1: 访问初始搜索页面 ===');
        const step1Url = `https://metaso.cn/search/[id]?_rsc=1p5af`;
        logger.debug(`步骤1 URL: ${step1Url}`);
        
        const step1Response = await makeHttpsRequest(step1Url, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'text/x-component',
                'Cookie': getCookieString()
            }
        });
        
        logger.info(`步骤1完成，状态码: ${step1Response.statusCode}, 数据长度: ${step1Response.data.length}`);
        updateCookiesFromResponse(step1Response.headers, cookies);
        
        // 等待1秒避免请求过快
        await delay(1000);
        
        // 步骤2: 访问 https://metaso.cn/search/[id]?_rsc=e6vkl 获取tid
        logger.info('=== 步骤2: 获取tid ===');
        const step2Url = `https://metaso.cn/search/[id]?_rsc=e6vkl`;
        logger.debug(`步骤2 URL: ${step2Url}`);
        
        const step2Response = await makeHttpsRequest(step2Url, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'text/x-component',
                'Cookie': getCookieString()
            }
        });
        
        logger.info(`步骤2完成，状态码: ${step2Response.statusCode}, 数据长度: ${step2Response.data.length}`);
        updateCookiesFromResponse(step2Response.headers, cookies);
        
        // 等待1秒避免请求过快
        await delay(1000);
        
        // 确保有tid
        if (!cookies.tid) {
            cookies.tid = uuidv4();
            logger.warn(`生成新的tid: ${cookies.tid}`);
        } else {
            logger.info(`从响应获取到tid: ${cookies.tid}`);
        }
        
        // 步骤3: POST https://metaso.cn/api/searchV2
        logger.info('=== 步骤3: 执行搜索API调用 ===');
        const searchPayload = JSON.stringify({
            query: query,
            searchMode: 'basic',
            source: 'web'
        });
        
        logger.debug(`搜索载荷: ${searchPayload}`);
        
        // 添加额外必需的cookies
        if (!cookies.JSESSIONID) {
            cookies.JSESSIONID = generateSessionId();
            logger.debug(`生成JSESSIONID: ${cookies.JSESSIONID}`);
        }
        if (!cookies.__eventn_id_UMO2dYNwFz) {
            cookies.__eventn_id_UMO2dYNwFz = generateEventId();
            logger.debug(`生成__eventn_id_UMO2dYNwFz: ${cookies.__eventn_id_UMO2dYNwFz}`);
        }
        
        const step3Response = await makeHttpsRequest('https://metaso.cn/api/searchV2', {
            method: 'POST',
            headers: {
                ...baseHeaders,
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(searchPayload),
                'Origin': 'https://metaso.cn',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': getCookieString()
            },
            body: searchPayload
        });
        
        logger.info(`步骤3完成，搜索API状态码: ${step3Response.statusCode}, 响应长度: ${step3Response.data.length}`);
        logger.debug(`搜索API响应数据: ${step3Response.data.substring(0, 500)}...`);
        updateCookiesFromResponse(step3Response.headers, cookies);
        
        // 等待1.5秒避免请求过快
        await delay(1500);
        
        // 步骤4: 访问中间结果页面
        logger.info('=== 步骤4: 访问中间结果页面 ===');
        const intermediateId = uuidv4();
        const step4Url = `https://metaso.cn/search/${intermediateId}?q=${encodeURIComponent(query)}&_rsc=16hus`;
        logger.debug(`步骤4 URL: ${step4Url}`);
        
        // 添加 newSearch cookie
        cookies['newSearch'] = 'true';
        logger.debug(`添加 newSearch cookie: true`);
        
        const step4Response = await makeHttpsRequest(step4Url, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cookie': getCookieString(),'newSearch': 'true'
            }
        });
        
        logger.info(`步骤4完成，状态码: ${step4Response.statusCode}, 数据长度: ${step4Response.data.length}`);
        updateCookiesFromResponse(step4Response.headers, cookies);
        
        // 等待2秒，最后一步前稍微久一点
        await delay(2000);
        
        // 新增步骤5: 调用share-key API
        logger.info('=== 步骤4.5: 调用share-key API ===');
        const finalSearchId = generateFinalSearchId();
        
        // 设置 newSearch cookie 为 false
        cookies['newSearch'] = 'false';
        logger.debug(`设置 newSearch cookie: false`);
        
        const shareKeyUrl = `https://metaso.cn/api/session/${finalSearchId}/share-key`;
        logger.debug(`Share-key API URL: ${shareKeyUrl}`);
        
        const shareKeyResponse = await makeHttpsRequest(shareKeyUrl, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'application/json, text/plain, */*',
                'Cookie': getCookieString(),'newSearch': 'false',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        logger.info(`Share-key API完成，状态码: ${shareKeyResponse.statusCode}, 响应长度: ${shareKeyResponse.data.length}`);
        logger.debug(`Share-key API响应: ${shareKeyResponse.data.substring(0, 300)}...`);
        updateCookiesFromResponse(shareKeyResponse.headers, cookies);
        
        // 等待1秒
        await delay(1000);
        
        // 步骤6: hideLeftMenu
        logger.info('=== 步骤6: hideLeftMenu ===');
        
        // 设置 hideLeftMenu cookie
        cookies['hideLeftMenu'] = '1';
        logger.debug(`设置 hideLeftMenu cookie: 1`);
        
        const presentationConfigUrl = 'https://metaso.cn/api/presentation/config';
        logger.debug(`Presentation config API URL: ${presentationConfigUrl}`);
        
        const presentationConfigResponse = await makeHttpsRequest(presentationConfigUrl, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'application/json, text/plain, */*',
                'Cookie': getCookieString(),
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        logger.info(`Presentation config API完成，状态码: ${presentationConfigResponse.statusCode}, 响应长度: ${presentationConfigResponse.data.length}`);
        logger.debug(`Presentation config API响应: ${presentationConfigResponse.data.substring(0, 300)}...`);
        updateCookiesFromResponse(presentationConfigResponse.headers, cookies);
        
        // 等待1秒
        await delay(1000);
        
        // 步骤7: 访问最终结果页面
        logger.info('=== 步骤7: 访问最终结果页面 ===');
        const finalUrl = `https://metaso.cn/search/${finalSearchId}?q=${encodeURIComponent(query)}`;
        logger.debug(`步骤7 最终URL: ${finalUrl}`);
        
        const finalResponse = await makeHttpsRequest(finalUrl, {
            method: 'GET',
            headers: {
                ...baseHeaders,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cookie': getCookieString()
            }
        });
        
        logger.info(`步骤7完成，最终页面状态码: ${finalResponse.statusCode}, 长度: ${finalResponse.data.length}`);
        logger.debug(`最终cookies状态: ${JSON.stringify(cookies, null, 2)}`);
        logger.debug(`会话信息: ${JSON.stringify(sessionInfo, null, 2)}`);
        
        return {
            success: true,
            html: finalResponse.data,
            finalUrl: finalUrl,
            finalSearchId: finalSearchId,
            cookies: cookies,
            sessionInfo: sessionInfo,  // 包含动态生成的会话信息
            steps: {
                step1: { statusCode: step1Response.statusCode, dataLength: step1Response.data.length },
                step2: { statusCode: step2Response.statusCode, dataLength: step2Response.data.length },
                step3: { statusCode: step3Response.statusCode, dataLength: step3Response.data.length },
                step4: { statusCode: step4Response.statusCode, dataLength: step4Response.data.length },
                step5: { statusCode: finalResponse.statusCode, dataLength: finalResponse.data.length }
            }
        };
        
    } catch (error) {
        logger.error('搜索流程执行失败:', error);
        logger.error(`错误堆栈: ${error.stack}`);
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

// HTTP请求工具函数 - 增强版，支持重试和更好的错误处理
function makeHttpsRequest(url, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    
    async function attemptRequest(attempt = 1) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'Connection': 'keep-alive',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    ...options.headers
                },
                timeout: 15000, // 缩短为15秒超时
                // SSL/TLS配置
                rejectUnauthorized: false, // 允许自签名证书
                secureProtocol: 'TLSv1_2_method',
                // 连接配置
                keepAlive: true,
                keepAliveMsecs: 30000
            };
            
            if (attempt === 1) {
                logger.debug(`=== 发起HTTPS请求 (尝试 ${attempt}/${maxRetries}) ===`);
                logger.debug(`方法: ${options.method || 'GET'}`);
                logger.debug(`URL: ${url}`);
                logger.debug(`请求头: ${JSON.stringify(requestOptions.headers, null, 2)}`);
                if (options.body) {
                    logger.debug(`请求体: ${options.body}`);
                }
            } else {
                logger.warn(`重试HTTPS请求 (尝试 ${attempt}/${maxRetries}): ${url}`);
            }
            
            const req = https.request(requestOptions, (res) => {
                logger.debug(`收到响应: 状态码 ${res.statusCode} (尝试 ${attempt})`);
                
                // 处理重定向
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    logger.debug(`收到重定向: ${res.headers.location}`);
                    resolve(makeHttpsRequest(res.headers.location, options));
                    return;
                }
                
                // 处理压缩响应
                let responseStream = res;
                const encoding = res.headers['content-encoding'];
                
                if (encoding === 'gzip') {
                    responseStream = res.pipe(zlib.createGunzip());
                } else if (encoding === 'deflate') {
                    responseStream = res.pipe(zlib.createInflate());
                } else if (encoding === 'br') {
                    responseStream = res.pipe(zlib.createBrotliDecompress());
                }
                
                let data = '';
                responseStream.setEncoding('utf8');
                
                responseStream.on('data', chunk => {
                    data += chunk;
                });
                
                responseStream.on('end', () => {
                    logger.debug(`请求完成: ${url}, 总数据长度: ${data.length} (尝试 ${attempt})`);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                });
                
                responseStream.on('error', (error) => {
                    logger.error(`响应流错误: ${error.message} (尝试 ${attempt})`);
                    if (attempt < maxRetries) {
                        logger.info(`等待 ${retryDelay}ms 后重试...`);
                        setTimeout(() => {
                            attemptRequest(attempt + 1).then(resolve).catch(reject);
                        }, retryDelay);
                    } else {
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                logger.error(`HTTPS请求失败: ${url} (尝试 ${attempt}/${maxRetries})`);
                logger.error(`错误详情: ${error.message}`);
                logger.error(`错误代码: ${error.code}`);
                
                // 如果是连接错误且还有重试次数，则重试
                if (attempt < maxRetries && (
                    error.code === 'ECONNRESET' || 
                    error.code === 'ENOTFOUND' || 
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT'
                )) {
                    logger.info(`等待 ${retryDelay}ms 后重试...`);
                    setTimeout(() => {
                        attemptRequest(attempt + 1).then(resolve).catch(reject);
                    }, retryDelay);
                } else {
                    reject(error);
                }
            });
            
            req.on('timeout', () => {
                req.destroy();
                const timeoutError = new Error(`请求超时: ${url} (尝试 ${attempt})`);
                logger.error(timeoutError.message);
                
                if (attempt < maxRetries) {
                    logger.info(`等待 ${retryDelay}ms 后重试...`);
                    setTimeout(() => {
                        attemptRequest(attempt + 1).then(resolve).catch(reject);
                    }, retryDelay);
                } else {
                    reject(timeoutError);
                }
            });
            
            // 监听socket事件以获取更多调试信息
            req.on('socket', (socket) => {
                socket.on('connect', () => {
                    logger.debug(`Socket连接建立: ${url} (尝试 ${attempt})`);
                });
                
                socket.on('secureConnect', () => {
                    logger.debug(`SSL握手完成: ${url} (尝试 ${attempt})`);
                });
                
                socket.on('error', (error) => {
                    logger.error(`Socket错误: ${error.message} (尝试 ${attempt})`);
                });
            });
            
            if (options.body) {
                logger.debug(`写入请求体: ${options.body.length} 字节 (尝试 ${attempt})`);
                req.write(options.body);
            }
            
            req.end();
            logger.debug(`请求已发送: ${url} (尝试 ${attempt})`);
        });
    }
    
    return attemptRequest();
}

// 更新cookies
function updateCookiesFromResponse(headers, cookies) {
    logger.debug('=== 更新Cookies ===');
    logger.debug(`响应头中的Set-Cookie: ${JSON.stringify(headers['set-cookie'], null, 2)}`);
    
    const setCookieHeaders = headers['set-cookie'];
    if (setCookieHeaders) {
        setCookieHeaders.forEach(cookie => {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=');
            if (name && value) {
                const oldValue = cookies[name.trim()];
                cookies[name.trim()] = value.trim();
                logger.debug(`更新cookie: ${name.trim()}=${value.trim()} (旧值: ${oldValue})`);
            }
        });
        logger.debug(`更新后的cookies: ${JSON.stringify(cookies, null, 2)}`);
    } else {
        logger.debug('响应中没有Set-Cookie头');
    }
}

// 生成动态用户ID（模拟真实的16位十六进制ID）
function generateUID() {
    return Array.from({length: 16}, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
}

// 生成动态会话ID（模拟真实的32位十六进制ID）
function generateSID() {
    return Array.from({length: 32}, () => 
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
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

// 生成最终搜索ID（19位数字）
function generateFinalSearchId() {
    return '86' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

// 基本的HTML处理
function processHtmlResponse(html) {
    try {
        const $ = cheerio.load(html);
        
        // 移除CSP相关标签
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $('meta[http-equiv="content-security-policy"]').remove();
        
        // 重写静态资源URL - 解决CORS问题
        $('link[href*="static-1.metaso.cn"]').each(function() {
            const href = $(this).attr('href');
            if (href) {
                const newHref = href.replace('https://static-1.metaso.cn', 'http://localhost:10101/static-1.metaso.cn');
                $(this).attr('href', newHref);
                logger.debug(`重写CSS链接: ${href} -> ${newHref}`);
            }
        });
        
        $('script[src*="static-1.metaso.cn"]').each(function() {
            const src = $(this).attr('src');
            if (src) {
                const newSrc = src.replace('https://static-1.metaso.cn', 'http://localhost:10101/static-1.metaso.cn');
                $(this).attr('src', newSrc);
                logger.debug(`重写JS链接: ${src} -> ${newSrc}`);
            }
        });
        
        // 重写_next资源URL
        $('link[href*="_next/static"]').each(function() {
            const href = $(this).attr('href');
            if (href && href.startsWith('https://static-1.metaso.cn/_next')) {
                const newHref = href.replace('https://static-1.metaso.cn/_next', 'http://localhost:10101/_next');
                $(this).attr('href', newHref);
                logger.debug(`重写_next CSS: ${href} -> ${newHref}`);
            }
        });
        
        $('script[src*="_next/static"]').each(function() {
            const src = $(this).attr('src');
            if (src && src.startsWith('https://static-1.metaso.cn/_next')) {
                const newSrc = src.replace('https://static-1.metaso.cn/_next', 'http://localhost:10101/_next');
                $(this).attr('src', newSrc);
                logger.debug(`重写_next JS: ${src} -> ${newSrc}`);
            }
        });
        
        // 重写其他静态资源
        $('img[src*="static-1.metaso.cn"]').each(function() {
            const src = $(this).attr('src');
            if (src) {
                const newSrc = src.replace('https://static-1.metaso.cn', 'http://localhost:10101/static-1.metaso.cn');
                $(this).attr('src', newSrc);
                logger.debug(`重写图片链接: ${src} -> ${newSrc}`);
            }
        });
        
        // 移除微信登录相关元素
        $('script[src*="wxLogin"]').remove();
        $('script[src*="wx.qq.com"]').remove();
        $('.wx-login').remove();
        $('.qrcode').remove();
        $('[id*="wx"]').remove();
        $('[class*="wx"]').remove();
        $('[class*="qr"]').remove();
        $('img[src*="qrcode"]').remove();
        
        // 移除扫码相关文本和元素
        $(':contains("扫码")').not('script').each(function() {
            if ($(this).children().length === 0) {
                $(this).remove();
            }
        });
        
        // 直接注入token授权，无需登录
        $('head').prepend(`
            <meta name="authorization" content="Bearer mk-4A9944E6F3917711EFCF7B772BC3A5AE">
            <meta name="auth-token" content="mk-4A9944E6F3917711EFCF7B772BC3A5AE">
            <script>
                // 自动设置登录状态
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('authToken', 'mk-4A9944E6F3917711EFCF7B772BC3A5AE');
                    localStorage.setItem('uid', '${generateUID()}');
                    localStorage.setItem('sid', '${generateSID()}');
                }
                // 覆盖登录检查函数
                window.checkLoginStatus = function() { return true; };
                window.isLoggedIn = true;
            </script>
        `);
        
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
                html = processHtmlResponse(html);
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
    logger.info(`=== metaso.cn 代理服务器 v2.8 已启动 ===`);
    logger.info(`监听端口: ${PORT}`);
    logger.info(`访问地址: http://localhost:${PORT}`);
    logger.info(`搜索测试: http://localhost:${PORT}/search/test001?q=人工智能`);
    logger.info(`基本测试: http://localhost:${PORT}/test`);
    logger.info(`=====================================`);
});

module.exports = app;
