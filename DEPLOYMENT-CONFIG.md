# metaso-proxy-autosearch 部署配置指南

## 概述

`metaso-proxy-autosearch.js` 已经优化为支持灵活的环境配置，摆脱了硬编码的 `localhost:10101` 限制，现在可以轻松部署到各种环境。

## 配置参数

### 环境变量

| 变量名 | 默认值 | 说明 | 示例 |
|--------|--------|------|------|
| `NODE_ENV` | `development` | 运行环境 | `production` |
| `PORT` | `10101` | 服务器端口 | `443`, `8080` |
| `SERVER_BASE_URL` | 自动检测 | 完整的服务器基础URL | `https://proxy.yourdomain.com` |

### 自动URL构建

系统支持多种URL配置方式：

1. **环境变量优先**: 如果设置了 `SERVER_BASE_URL`，直接使用该值
2. **生产环境自动检测**: 在生产环境中使用相对路径，让浏览器自动使用当前域名
3. **开发环境默认**: 开发环境自动使用 `http://localhost:${PORT}`

### 动态特性

- **客户端脚本**: 所有 `https://metaso.cn` 请求会被自动替换为配置的代理URL
- **动态域名**: Cookie域名会根据当前访问域名自动设置
- **请求头检测**: 支持通过 `X-Forwarded-Host` 和 `X-Forwarded-Proto` 自动检测

## 部署场景

### 1. 本地开发环境

```bash
# 方式一：直接运行（推荐）
node metaso-proxy-autosearch.js

# 方式二：自定义端口
PORT=8080 node metaso-proxy-autosearch.js

# 方式三：完全自定义
SERVER_BASE_URL=http://localhost:8080 node metaso-proxy-autosearch.js

### 2. 生产环境（云服务器）

```bash
# 设置环境变量
export NODE_ENV=production
```

### 2. 生产环境（云服务器）

```bash
# 方式一：使用相对路径（推荐）
NODE_ENV=production PORT=80 node metaso-proxy-autosearch.js

# 方式二：明确指定完整URL
NODE_ENV=production PORT=443 SERVER_BASE_URL=https://proxy.yourdomain.com node metaso-proxy-autosearch.js

# 方式三：配置反向代理时
NODE_ENV=production PORT=3000 node metaso-proxy-autosearch.js
```

### 3. Docker 部署

```dockerfile
# Dockerfile 示例
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "metaso-proxy-autosearch.js"]
```

```bash
# 构建和运行 Docker
docker build -t metaso-proxy .
docker run -p 443:3000 -e HOST=proxy.yourdomain.com -e PROTOCOL=https metaso-proxy
```

### 4. PM2 部署

```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'metaso-proxy',
    script: 'metaso-proxy-autosearch.js',
    env: {
      NODE_ENV: 'development',
      PORT: 10101,
      HOST: 'localhost',
      PROTOCOL: 'http'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 443,
      HOST: 'proxy.yourdomain.com',
      PROTOCOL: 'https'
    }
  }]
};
```

```bash
# 生产环境启动
pm2 start ecosystem.config.js --env production
```

### 5. Nginx 反向代理

```nginx
# /etc/nginx/sites-available/metaso-proxy
server {
    listen 443 ssl;
    server_name proxy.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:10101;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 配置验证

启动服务后，检查日志输出确认配置是否正确：

```
=== metaso.cn 代理服务器已启动 ===
环境: Production
日志级别: INFO
监听端口: 443
主机: proxy.yourdomain.com
协议: https
代理服务器URL: https://proxy.yourdomain.com
访问地址: https://proxy.yourdomain.com
静态资源: https://proxy.yourdomain.com/static/
代理目标: https://metaso.cn
==============================
```

## 注意事项

### 安全性
1. **生产环境必须使用 HTTPS**
2. **配置防火墙规则**
3. **使用强密码和SSL证书**

### 性能优化
1. **启用 gzip 压缩**
2. **配置缓存策略**
3. **使用 CDN（如需要）**

### 监控
1. **配置日志收集**
2. **设置健康检查**
3. **监控资源使用情况**

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   lsof -i :10101
   kill -9 <PID>
   ```

2. **权限不足（绑定低端口）**
   ```bash
   sudo setcap cap_net_bind_service=+ep /usr/bin/node
   ```

3. **SSL证书问题**
   - 检查证书路径和权限
   - 确认证书有效期
   - 验证域名匹配

4. **DNS解析问题**
   ```bash
   nslookup proxy.yourdomain.com
   ```

## 更新和维护

### 配置更新
1. 修改环境变量或 .env 文件
2. 重启服务
3. 验证新配置

### 版本升级
1. 备份当前配置
2. 更新代码文件
3. 检查配置兼容性
4. 重启服务并验证

通过这种配置方式，代理服务器现在具有了完全的环境适应性，可以轻松部署到任何环境中。
