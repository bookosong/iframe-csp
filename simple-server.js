const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// 简单的静态文件服务器
const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    if (req.url.startsWith('/static/')) {
        // 处理静态文件
        const filePath = path.join(__dirname, req.url);
        
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('文件未找到');
                return;
            }
            
            // 获取文件扩展名来设置Content-Type
            const ext = path.extname(filePath).toLowerCase();
            const contentTypes = {
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml'
            };
            
            const contentType = contentTypes[ext] || 'application/octet-stream';
            
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('服务器错误');
                    return;
                }
                
                // 移除CSP相关的头
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600'
                });
                res.end(data);
            });
        });
    } else if (req.url === '/' || req.url === '') {
        // 处理根路径
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
            // 注意：这里没有CSP和X-Frame-Options头
        });
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>代理服务器测试</title>
    <meta charset="utf-8">
</head>
<body>
    <h1>代理服务器运行正常</h1>
    <p>端口: ${PORT}</p>
    <p>时间: ${new Date().toISOString()}</p>
    <p>静态资源测试:</p>
    <ul>
        <li><a href="/static/metaso.cn_files/06379910118566c4.css" target="_blank">CSS文件测试</a></li>
        <li><a href="/static/metaso.cn_files/23362-2bb0da0da92b2600.js" target="_blank">JS文件测试</a></li>
        <li><a href="/static/metaso.cn_files/132.jpeg" target="_blank">图片文件测试</a></li>
    </ul>
    
    <script>
        // 测试localStorage注入
        localStorage.setItem('uid', 'demo_user_123');
        localStorage.setItem('sid', 'demo_session_456');
        localStorage.setItem('token', 'demo_token_789');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', Date.now().toString());
        
        console.log('已注入授权信息到localStorage');
        console.log('UID:', localStorage.getItem('uid'));
        console.log('SID:', localStorage.getItem('sid'));
        console.log('Token:', localStorage.getItem('token'));
        
        // 重写window.open
        window.open = function(url, name, features) {
            if (url) {
                window.location.href = url;
            }
            return window;
        };
        
        document.addEventListener('DOMContentLoaded', function() {
            const status = document.createElement('div');
            status.innerHTML = '<h3>状态检查:</h3>' +
                              '<p>✓ CSP已移除（无Content-Security-Policy头）</p>' +
                              '<p>✓ X-Frame-Options已移除</p>' +
                              '<p>✓ localStorage已注入授权信息</p>' +
                              '<p>✓ window.open已重写为当前窗口导航</p>';
            document.body.appendChild(status);
        });
    </script>
</body>
</html>
        `;
        
        res.end(html);
    } else {
        // 其他路径返回404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('页面未找到');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== 代理服务器已启动 ===`);
    console.log(`监听端口: ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
    console.log(`静态资源: http://localhost:${PORT}/static/`);
    console.log(`========================\n`);
});

server.on('error', (err) => {
    console.error('服务器错误:', err);
});

module.exports = server;
