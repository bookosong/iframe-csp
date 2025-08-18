const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 10101;

// 设置静态资源中间件，将 /static 路径映射到本地的 static 目录
app.use('/static', express.static(path.join(__dirname, 'static')));

// HTML处理函数
function processHtmlResponse(html, requestPath) {
    try {
        const $ = cheerio.load(html);
        
        // 移除CSP的meta标签
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $('meta[http-equiv="content-security-policy"]').remove();
        $('meta[name="content-security-policy"]').remove();
        
        // 特殊处理根路径请求
        if (requestPath === '/') {
            // 删除微信扫码登录的相关元素
            $('.wechat-login-container').remove();
            $('#wechat-login').remove();
            $('[class*="wechat"]').remove();
            $('[id*="wechat"]').remove();
            
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
                    localStorage.setItem('uid', 'demo_user_123');
                    localStorage.setItem('sid', 'demo_session_456');
                    localStorage.setItem('token', 'demo_token_789');
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('loginTime', Date.now().toString());
                    
                    console.log('已注入授权信息到localStorage');
                    
                    // 禁用可能的页面刷新或重定向检查
                    if (window.location !== window.parent.location) {
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
                    try {
                        // 尝试阻止可能的framebusting代码
                        Object.defineProperty(window.top, 'location', {
                            get: function() { return window.location; },
                            set: function(val) { window.location = val; }
                        });
                    } catch(e) {
                        // 忽略错误
                    }
                    
                    // 重写可能的反iframe代码
                    window.top = window.self;
                    window.parent = window.self;
                }
                
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
        
        return $.html();
        
    } catch (error) {
        console.error('HTML处理错误:', error);
        return html; // 返回原始HTML
    }
}

// 创建代理中间件，目标为 https://metaso.cn
app.use('/', proxy('https://metaso.cn', {
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        // 删除阻止iframe嵌入的响应头
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];
        delete headers['x-frame-options'];
        delete headers['x-content-type-options'];
        
        // 添加允许iframe的头
        headers['x-frame-options'] = 'ALLOWALL';
        
        return headers;
    },
    
    // 处理HTML响应
    userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
        const contentType = proxyRes.headers['content-type'] || '';
        
        if (contentType.includes('text/html')) {
            const html = proxyResData.toString('utf8');
            const processedHtml = processHtmlResponse(html, userReq.path);
            return processedHtml;
        }
        
        return proxyResData;
    }
}));

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
