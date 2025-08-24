const express = require('express');
const app = express();
const PORT = 10102;

// 简单的测试路由
app.get('/', (req, res) => {
    console.log('收到请求:', req.path);
    console.log('查询参数:', req.query);
    
    const q = req.query.q;
    const scope = req.query.scope;
    
    console.log('q参数:', q);
    console.log('scope参数:', scope);
    
    res.send(`
        <html>
        <head><title>测试结果</title></head>
        <body>
            <h1>测试成功</h1>
            <p>查询参数 q: ${q || '未提供'}</p>
            <p>scope参数: ${scope || '未提供'}</p>
            <p>原始URL: ${req.originalUrl}</p>
        </body>
        </html>
    `);
});

// 错误处理
app.on('error', (err) => {
    console.error('服务器错误:', err);
});

process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`测试服务器已启动在端口 ${PORT}`);
});
