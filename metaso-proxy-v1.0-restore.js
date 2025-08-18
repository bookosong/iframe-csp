const express = require('express');
const proxy = require('express-http-proxy');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 10101; // 改回原来的端口

// 设置静态资源中间件，将 /static 路径映射到本地的 static 目录
app.use('/static', express.static(path.join(__dirname, 'static')));

// HTML处理函数
function processHtmlResponse(html, requestPath) {
    try {
        const $ = cheerio.load(html);
        
        console.log(`处理HTML请求: ${requestPath}`);
        
        // 移除CSP的meta标签
        $('meta[http-equiv="Content-Security-Policy"]').remove();
        $('meta[http-equiv="content-security-policy"]').remove();
        $('meta[name="content-security-policy"]').remove();
        console.log('已移除CSP meta标签');
        
        // 特殊处理根路径请求
        if (requestPath === '/') {
            console.log('处理根路径，移除微信登录相关元素...');
            
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
                    console.log('=== 代理服务器注入脚本 ===');
                    
                    // 注入授权信息到 localStorage
                    localStorage.setItem('uid', 'demo_user_123');
                    localStorage.setItem('sid', 'demo_session_456');
                    localStorage.setItem('token', 'demo_token_789');
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('loginTime', Date.now().toString());
                    
                    console.log('已注入授权信息到localStorage:');
                    console.log('- UID:', localStorage.getItem('uid'));
                    console.log('- SID:', localStorage.getItem('sid'));
                    console.log('- Token:', localStorage.getItem('token'));
                    
                    // 禁用可能的页面刷新或重定向检查
                    if (window.location !== window.parent.location) {
                        console.log('检测到在iframe中运行');
                        window.addEventListener('beforeunload', function(e) {
                            e.preventDefault();
                            return null;
                        });
                    }
                </script>
            `;
            $('body').append(authScript);
            console.log('已注入授权脚本');
        }
        
        // 将HTML中引用的静态资源路径替换为本地路径
        let replacedCount = 0;
        
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
        
        // 处理CSS文件
        $('link[rel="stylesheet"]').each((index, element) => {
            const href = $(element).attr('href');
            const filename = extractFilename(href);
            if (filename) {
                const localPath = '/static/metaso.cn_files/' + filename;
                $(element).attr('href', localPath);
                replacedCount++;
                console.log(`替换CSS: ${href} -> ${localPath}`);
            }
        });
        
        // 处理JS文件
        $('script[src]').each((index, element) => {
            const src = $(element).attr('src');
            const filename = extractFilename(src);
            if (filename) {
                const localPath = '/static/metaso.cn_files/' + filename;
                $(element).attr('src', localPath);
                replacedCount++;
                console.log(`替换JS: ${src} -> ${localPath}`);
            }
        });
        
        // 处理图片
        $('img[src]').each((index, element) => {
            const src = $(element).attr('src');
            const filename = extractFilename(src);
            if (filename) {
                const localPath = '/static/metaso.cn_files/' + filename;
                $(element).attr('src', localPath);
                replacedCount++;
                console.log(`替换IMG: ${src} -> ${localPath}`);
            }
        });
        
        // 处理preload链接
        $('link[rel="preload"]').each((index, element) => {
            const href = $(element).attr('href');
            const filename = extractFilename(href);
            if (filename) {
                const localPath = '/static/metaso.cn_files/' + filename;
                $(element).attr('href', localPath);
                replacedCount++;
                console.log(`替换Preload: ${href} -> ${localPath}`);
            }
        });
        
        console.log(`已替换 ${replacedCount} 个静态资源路径`);
        
        // 添加iframe友好的脚本
        const iframeScript = `
            <script>
                console.log('=== iframe兼容性脚本 ===');
                
                // 确保页面在iframe中正常工作
                if (window.top !== window.self) {
                    console.log('页面在iframe中运行，启用兼容性处理');
                    
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
                
                console.log('iframe兼容性脚本加载完成');
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

// 创建代理中间件，目标为 https://metaso.cn
app.use('/', proxy('https://metaso.cn', {
    // 在代理响应回调中移除 CSP 和 X-Frame-Options 头
    userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
        console.log(`\n=== 处理响应头 ${userReq.path} ===`);
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
        
        console.log('最终响应头:', Object.keys(headers));
        return headers;
    },
    
    // 处理HTML响应
    userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
        const contentType = proxyRes.headers['content-type'] || '';
        
        console.log(`\n=== 处理响应数据 ${userReq.path} ===`);
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
        
        console.log(`\n=== 代理请求 ${srcReq.path} ===`);
        console.log('目标URL:', proxyReqOpts.href);
        
        return proxyReqOpts;
    }
}));

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== metaso.cn 代理服务器已启动 ===`);
    console.log(`监听端口: ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
    console.log(`静态资源: http://localhost:${PORT}/static/`);
    console.log(`代理目标: https://metaso.cn`);
    console.log(`==============================\n`);
    
    console.log('功能说明:');
    console.log('- ✓ 移除CSP和X-Frame-Options头');
    console.log('- ✓ 删除微信登录相关元素');
    console.log('- ✓ 注入localStorage授权信息');
    console.log('- ✓ 静态资源本地化服务');
    console.log('- ✓ iframe兼容性处理');
    console.log('');
    
    console.log('测试命令:');
    console.log(`curl http://localhost:${PORT} -I`);
    console.log(`curl http://localhost:${PORT}/static/metaso.cn_files/06379910118566c4.css -I`);
    console.log('');
});

app.on('error', (err) => {
    console.error('服务器错误:', err);
});

module.exports = app;
