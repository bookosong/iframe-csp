# metaso-proxy-autosearch.js 硬编码移除优化报告

## 🎯 优化目标

解决生产环境部署中的硬编码问题，使代码能够灵活适应不同的部署环境。

## 🚨 问题分析

### 原始问题
代码中存在多处硬编码的 `http://localhost:10101`：
1. fetch请求拦截器中的URL替换
2. XMLHttpRequest拦截器中的URL替换  
3. Axios拦截器中的URL替换
4. Cookie域名设置为 localhost
5. 服务器启动日志中的访问地址

### 影响范围
- 无法部署到生产环境的其他域名
- 无法使用不同的端口配置
- 客户端脚本无法适应域名变化
- Cookie设置不兼容生产域名

## ✅ 解决方案

### 1. 环境变量配置支持

添加了智能的环境配置系统：

```javascript
// 动态获取服务器基础URL
const getServerBaseUrl = () => {
    // 优先使用环境变量
    if (process.env.SERVER_BASE_URL) {
        return process.env.SERVER_BASE_URL;
    }
    
    // 生产环境使用相对路径
    if (process.env.NODE_ENV === 'production') {
        return '';
    }
    
    // 开发环境默认使用localhost
    return `http://localhost:${PORT}`;
};
```

### 2. 统一URL处理函数

创建了 `replaceMetasoUrl()` 函数统一处理URL替换：

```javascript
function replaceMetasoUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    if (url.includes('metaso.cn')) {
        if (SERVER_BASE_URL) {
            return url.replace('https://metaso.cn', SERVER_BASE_URL);
        } else {
            // 生产环境使用相对路径
            return url.replace('https://metaso.cn', '');
        }
    }
    return url;
}
```

### 3. 动态Cookie域名设置

客户端脚本中实现动态域名检测：

```javascript
// 获取当前域名
const currentDomain = window.location.hostname;
const domainPart = currentDomain === 'localhost' ? 'localhost' : currentDomain;

// 设置cookies - 动态域名
document.cookie = 'uid=' + uid + '; path=/; domain=' + domainPart + '; SameSite=Lax';
```

### 4. 请求头动态检测

支持反向代理环境的动态URL构建：

```javascript
function getRequestBaseUrl(req) {
    if (SERVER_BASE_URL) {
        return SERVER_BASE_URL;
    }
    
    // 从请求头动态构建URL
    const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
    const host = req.get('X-Forwarded-Host') || req.get('Host') || `localhost:${PORT}`;
    return `${protocol}://${host}`;
}
```

## 🔧 配置选项

### 环境变量

| 变量名 | 默认值 | 说明 | 示例 |
|--------|--------|------|------|
| `NODE_ENV` | `development` | 运行环境 | `production` |
| `PORT` | `10101` | 服务器端口 | `80`, `443`, `8080` |
| `SERVER_BASE_URL` | 自动检测 | 完整服务器URL | `https://proxy.yourdomain.com` |

### 智能配置逻辑

1. **环境变量优先**: 明确设置 `SERVER_BASE_URL` 时直接使用
2. **生产环境自动**: `NODE_ENV=production` 时使用相对路径
3. **开发环境默认**: 自动构建 `http://localhost:${PORT}`

## 🚀 部署示例

### 开发环境
```bash
# 默认配置 - 自动使用 localhost:10101
node metaso-proxy-autosearch.js

# 自定义端口
PORT=8080 node metaso-proxy-autosearch.js

# 明确指定完整URL
SERVER_BASE_URL=http://localhost:8080 node metaso-proxy-autosearch.js
```

### 生产环境
```bash
# 推荐配置 - 使用相对路径，最灵活
NODE_ENV=production PORT=80 node metaso-proxy-autosearch.js

# 反向代理环境
NODE_ENV=production PORT=3000 node metaso-proxy-autosearch.js

# 明确指定域名
NODE_ENV=production SERVER_BASE_URL=https://proxy.yourdomain.com node metaso-proxy-autosearch.js
```

### Docker部署
```dockerfile
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "metaso-proxy-autosearch.js"]
```

### Nginx反向代理
```nginx
upstream proxy_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name proxy.yourdomain.com;
    
    location / {
        proxy_pass http://proxy_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

## ✅ 测试验证

已验证的部署场景：

### 1. 开发环境测试
```bash
# 默认配置
node metaso-proxy-autosearch.js
# ✅ 访问地址: http://localhost:10101

# 自定义端口  
PORT=8080 node metaso-proxy-autosearch.js
# ✅ 访问地址: http://localhost:8080
```

### 2. 生产环境测试
```bash
# 相对路径模式
NODE_ENV=production PORT=8080 node metaso-proxy-autosearch.js
# ✅ Base URL: (relative paths)

# 完整URL模式
SERVER_BASE_URL=https://my-proxy.com PORT=9000 node metaso-proxy-autosearch.js  
# ✅ Base URL: https://my-proxy.com
```

## 🎉 优化成果

### 1. 完全消除硬编码
- ✅ 所有URL引用都支持动态配置
- ✅ Cookie域名自动适配当前域名
- ✅ 客户端脚本支持任意代理地址

### 2. 部署灵活性
- ✅ 支持任意域名和端口
- ✅ 零配置开箱即用（开发环境）
- ✅ 生产环境智能适配

### 3. 向后兼容
- ✅ 保持所有原有功能不变
- ✅ 默认行为与原版本一致
- ✅ 无需修改现有部署脚本

### 4. 生产就绪
- ✅ 支持反向代理和负载均衡
- ✅ 完整的环境变量配置
- ✅ Docker和容器化友好

## 📋 配置文件更新

### `.env.example`
提供了完整的环境变量配置模板：
- 开发环境示例配置
- 生产环境示例配置
- Docker环境示例配置

### `DEPLOYMENT-CONFIG.md`
更新了完整的部署指南：
- 智能URL配置说明
- 多种部署场景示例
- 最佳实践建议

## 🏆 最佳实践建议

### 开发环境
- 使用默认配置即可，零配置启动
- 需要自定义端口时只需设置 `PORT` 环境变量

### 生产环境  
- 推荐使用 `NODE_ENV=production` + 相对路径模式
- 配合反向代理使用，获得最大灵活性
- 避免硬编码域名，让浏览器自动适配

### 容器化部署
- 使用环境变量传递配置
- 不要在镜像中硬编码URL
- 让容器编排系统处理域名和端口

这次优化彻底解决了硬编码问题，使 metaso-proxy-autosearch.js 具备了真正的生产环境部署能力！
