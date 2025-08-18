const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 10101;

// 设置静态资源中间件，将 /static 路径映射到本地的 static 目录
app.use('/static', express.static(path.join(__dirname, 'static')));

// 创建代理中间件，目标为 https://metaso.cn
const proxyMiddleware = createProxyMiddleware({
    target: 'https://metaso.cn',
    changeOrigin: true,
    selfHandleResponse: true, // 我们要自己处理响应
    
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    onProxyRes: function (proxyRes, req, res) {
        // 删除阻止iframe嵌入的响应头
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['content-security-policy-report-only'];
        delete proxyRes.headers['x-frame-options'];
        
        // 确保不会出现iframe递归嵌套
        delete proxyRes.headers['x-content-type-options'];
        
        // 收集响应数据
        let body = '';
        let chunks = [];
        
        proxyRes.on('data', function (chunk) {
            chunks.push(chunk);
        });
        
        proxyRes.on('end', function () {
            body = Buffer.concat(chunks);
            
            // 如果是HTML响应，进行处理
            const contentType = proxyRes.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                processHtmlResponse(body.toString(), res, req.path);
            } else {
                // 非HTML响应直接返回
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                res.end(body);
            }
        });
    },
    
    onError: function (err, req, res) {
        console.error('代理错误:', err);
        res.status(500).send('代理服务器错误');
    }
});

// HTML处理函数
function processHtmlResponse(html, res, requestPath) {
    try {
        const $ = cheerio.load(html);
        
        // 移除CSP的meta标签
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $('meta[http-equiv="content-security-policy"]').remove();
        $('meta[name="content-security-policy"]').remove();
        
        // 特殊处理根路径请求
        if (requestPath === '/') {
            // 删除微信扫码登录的相关元素
            // 根据实际HTML结构，这里需要根据具体的选择器来删除
            $('.wechat-login-container').remove(); // 示例选择器
            $('#wechat-login').remove(); // 示例选择器
            $('[class*="wechat"]').remove(); // 移除所有包含wechat的class元素
            $('[id*="wechat"]').remove(); // 移除所有包含wechat的id元素
            
            // 移除微信登录相关的脚本
            $('script[src*="wxLogin"]').remove();
            $('script[id="wxLogin"]').remove();
            $('script[src*="wx.qq.com"]').remove();
            
            // 移除二维码相关元素
            $('img[src*="qrcode"]').remove();
            $('[class*="qrcode"]').remove();
            $('[id*="qrcode"]').remove();
            
            // 移除扫码提示文本
            $('p:contains("扫码")').remove();
            $('div:contains("扫码")').remove();
            
            // 在body末尾注入脚本，将UID和SID写入localStorage
            const authScript = `
                <script>
                    // 注入授权信息到 localStorage
                    // 注意：请替换为实际的授权信息
                    localStorage.setItem('uid', 'demo_user_123');
                    localStorage.setItem('sid', 'demo_session_456');
                    localStorage.setItem('token', 'demo_token_789');
                    
                    // 可以添加更多授权相关的localStorage项
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('loginTime', Date.now().toString());
                    
                    console.log('已注入授权信息到localStorage');
                    
                    // 禁用可能的页面刷新或重定向检查
                    if (window.location !== window.parent.location) {
                        // 在iframe中运行时的处理
                        window.addEventListener('beforeunload', function(e) {
                            e.preventDefault();
                            return null;
                        });
                    }
                </script>
            `;
            $('body').append(authScript);
        }
        
        // 将HTML中引用的静态资源路径替换为本地路径
        // 处理CSS文件
        $('link[rel="stylesheet"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('metaso.cn_files/')) {
                const localPath = '/static/' + href.split('metaso.cn_files/')[1];
                $(element).attr('href', localPath);
            }
        });
        
        // 处理JS文件
        $('script[src]').each((index, element) => {
            const src = $(element).attr('src');
            if (src && src.includes('metaso.cn_files/')) {
                const localPath = '/static/' + src.split('metaso.cn_files/')[1];
                $(element).attr('src', localPath);
            }
        });
        
        // 处理图片
        $('img[src]').each((index, element) => {
            const src = $(element).attr('src');
            if (src && src.includes('metaso.cn_files/')) {
                const localPath = '/static/' + src.split('metaso.cn_files/')[1];
                $(element).attr('src', localPath);
            }
        });
        
        // 处理preload链接
        $('link[rel="preload"]').each((index, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('metaso.cn_files/')) {
                const localPath = '/static/' + href.split('metaso.cn_files/')[1];
                $(element).attr('href', localPath);
            }
        });
        
        // 添加iframe友好的脚本
        const iframeScript = `
            <script>
                // 确保页面在iframe中正常工作
                if (window.top !== window.self) {
                    // 在iframe中运行
                    
                    // 禁用可能阻止iframe的代码
                    if (window.top && window.top.location) {
                        try {
                            // 尝试阻止可能的framebusting代码
                            Object.defineProperty(window.top, 'location', {
                                get: function() { return window.location; },
                                set: function(val) { window.location = val; }
                            });
                        } catch(e) {
                            // 忽略错误
                        }
                    }
                    
                    // 重写可能的反iframe代码
                    window.top = window.self;
                    window.parent = window.self;
                }
                
                // 禁用右键菜单中的"在新窗口中打开"等选项
                document.addEventListener('contextmenu', function(e) {
                    // 可以选择性地禁用右键菜单
                    // e.preventDefault();
                });
                
                // 重写window.open为当前窗口导航
                window.open = function(url, name, features) {
                    if (url) {
                        window.location.href = url;
                    }
                    return window;
                };
            </script>
        `;
        $('head').append(iframeScript);
        
        // 发送处理后的HTML响应
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end($.html());
        
    } catch (error) {
        console.error('HTML处理错误:', error);
        res.status(500).send('HTML处理错误');
    }
}

// 对根路径和其他路径使用代理中间件
app.use('/', proxyMiddleware);

// 启动服务器
app.listen(PORT, () => {
    console.log(`代理服务器运行在 http://localhost:${PORT}`);
    console.log(`静态资源服务: http://localhost:${PORT}/static/`);
    console.log('');
    console.log('测试命令:');
    console.log(`curl http://localhost:${PORT} -I`);
    console.log(`curl http://localhost:${PORT}`);
    console.log(`curl http://localhost:${PORT}/static/metaso.cn_files/06379910118566c4.css`);
});

module.exports = app;
