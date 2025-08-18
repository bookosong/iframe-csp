# 部署指南 (DEPLOYMENT GUIDE)

## 📋 系统要求

### 最低要求
- **操作系统**: Linux/macOS/Windows
- **Node.js**: >= 14.0.0 (推荐 18.x)
- **内存**: >= 512MB
- **磁盘空间**: >= 100MB (用于静态资源)
- **网络**: 稳定的互联网连接

### 推荐配置
- **操作系统**: Ubuntu 20.04+ / CentOS 8+
- **Node.js**: 18.19.1 LTS
- **内存**: >= 1GB
- **CPU**: >= 1核心
- **磁盘**: >= 500MB SSD

## 🚀 快速部署

### 1. 环境准备

#### Ubuntu/Debian
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应显示 v18.x.x
npm --version   # 应显示 9.x.x
```

#### CentOS/RHEL
```bash
# 安装 Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

#### Windows
1. 下载 Node.js 18.x LTS: https://nodejs.org/
2. 运行安装程序，选择"Add to PATH"
3. 打开命令提示符验证: `node --version`

### 2. 代码部署

```bash
# 创建部署目录
mkdir -p /opt/metaso-proxy
cd /opt/metaso-proxy

# 复制文件 (假设已有源码)
cp -r /path/to/proxy-server-1.0/* .

# 安装依赖
npm install express express-http-proxy cheerio@1.0.0-rc.12

# 验证文件完整性
ls -la
# 应看到: metaso-proxy.js, scripts/, iframe-test.html, package.json
```

### 3. 静态资源准备

```bash
# 首次部署需要下载静态资源
node scripts/download-resources.js

# 验证下载结果
ls static/metaso.cn_files/ | wc -l
# 应显示约94个文件

# 检查文件大小
du -sh static/
# 应显示约10-20MB
```

### 4. 服务启动

#### 开发模式 (前台运行)
```bash
node metaso-proxy.js
```

#### 生产模式 (后台运行)
```bash
# 使用 nohup
nohup node metaso-proxy.js > metaso-proxy.log 2>&1 &

# 记录进程ID
echo $! > metaso-proxy.pid

# 验证启动
curl http://localhost:10101 -I
```

## 🔧 生产环境配置

### 1. 使用 PM2 管理进程

#### 安装 PM2
```bash
npm install -g pm2
```

#### 创建 PM2 配置文件
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'metaso-proxy',
    script: 'metaso-proxy.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 10101
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

#### 启动服务
```bash
# 创建日志目录
mkdir -p logs

# 启动服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs metaso-proxy

# 设置开机自启
pm2 startup
pm2 save
```

### 2. Nginx 反向代理 (可选)

#### 安装 Nginx
```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### 配置文件
```nginx
# /etc/nginx/sites-available/metaso-proxy
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名
    
    location / {
        proxy_pass http://localhost:10101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态资源缓存
    location /static/ {
        proxy_pass http://localhost:10101;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 启用配置
```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/metaso-proxy /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 3. SSL 证书配置 (HTTPS)

#### 使用 Certbot (Let's Encrypt)
```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 监控和维护

### 1. 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

# 检查服务状态
if curl -f http://localhost:10101 > /dev/null 2>&1; then
    echo "✅ 服务正常运行"
else
    echo "❌ 服务异常，尝试重启"
    pm2 restart metaso-proxy
fi

# 检查内存使用
MEMORY=$(ps aux | grep metaso-proxy | grep -v grep | awk '{print $4}')
if (( $(echo "$MEMORY > 10" | bc -l) )); then
    echo "⚠️  内存使用过高: ${MEMORY}%"
fi

# 检查磁盘空间
DISK=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK -gt 90 ]; then
    echo "⚠️  磁盘空间不足: ${DISK}%"
fi
```

### 2. 日志轮转

```bash
# 使用 logrotate
sudo tee /etc/logrotate.d/metaso-proxy << EOF
/opt/metaso-proxy/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reload metaso-proxy
    endscript
}
EOF
```

### 3. 监控脚本

```bash
#!/bin/bash
# monitor.sh

# 服务状态监控
echo "=== 服务状态 ==="
pm2 status metaso-proxy

# 内存监控
echo "=== 内存使用 ==="
free -h

# 网络监控
echo "=== 网络连接 ==="
netstat -tlnp | grep :10101

# 日志监控
echo "=== 最近错误 ==="
tail -20 logs/error.log 2>/dev/null || echo "无错误日志"

# 请求统计
echo "=== 请求统计 ==="
grep "处理HTML请求" logs/combined.log | tail -10
```

## 🔒 安全配置

### 1. 防火墙设置

```bash
# Ubuntu (UFW)
sudo ufw allow 10101/tcp
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=10101/tcp
sudo firewall-cmd --reload
```

### 2. 系统用户配置

```bash
# 创建专用用户
sudo useradd -r -s /bin/false metaso-proxy
sudo chown -R metaso-proxy:metaso-proxy /opt/metaso-proxy

# 限制权限
chmod 750 /opt/metaso-proxy
chmod 640 /opt/metaso-proxy/*.js
```

### 3. 资源限制

```bash
# 设置用户限制
sudo tee /etc/security/limits.d/metaso-proxy.conf << EOF
metaso-proxy soft nofile 65536
metaso-proxy hard nofile 65536
metaso-proxy soft nproc 4096
metaso-proxy hard nproc 4096
EOF
```

## 🚨 故障排除

### 常见问题和解决方案

#### 1. 端口占用
```bash
# 检查端口占用
sudo netstat -tlnp | grep :10101

# 杀死占用进程
sudo kill $(sudo lsof -t -i:10101)
```

#### 2. 静态资源404
```bash
# 检查文件存在
ls -la static/metaso.cn_files/

# 重新下载
rm -rf static/metaso.cn_files/
node scripts/download-resources.js
```

#### 3. 内存泄漏
```bash
# 监控内存使用
watch -n 5 'ps aux | grep metaso-proxy'

# 重启服务
pm2 restart metaso-proxy
```

#### 4. 网络连接问题
```bash
# 检查DNS解析
nslookup metaso.cn

# 检查网络连通性
curl -I https://metaso.cn

# 检查代理连接
curl -I http://localhost:10101
```

### 日志分析

```bash
# 查看实时日志
pm2 logs metaso-proxy --lines 100

# 搜索错误
grep -i error logs/error.log

# 统计请求量
grep "处理HTML请求" logs/combined.log | wc -l

# 分析响应时间
grep "HTML处理完成" logs/combined.log | tail -20
```

## 📈 性能优化

### 1. Node.js 优化

```bash
# 设置环境变量
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=512"

# PM2 集群模式 (多核CPU)
pm2 start metaso-proxy.js -i max
```

### 2. 系统优化

```bash
# 调整系统参数
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
echo 'fs.file-max = 100000' >> /etc/sysctl.conf
sysctl -p
```

### 3. 缓存优化

在代理服务器中添加缓存层：

```javascript
// 简单内存缓存示例
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 在代理处理中添加缓存逻辑
if (cache.has(url) && Date.now() - cache.get(url).time < CACHE_TTL) {
    return cache.get(url).data;
}
```

---

## 📞 技术支持

### 获取帮助
1. **文档**: 查看 README.md 和 CHANGELOG.md
2. **日志**: 检查 logs/ 目录下的日志文件
3. **健康检查**: 运行 health-check.sh 脚本
4. **社区**: GitHub Issues 或相关技术论坛

### 联系方式
- **邮箱**: admin@yourcompany.com
- **文档**: https://your-docs-site.com
- **监控**: http://your-monitor-dashboard.com

---

**最后更新**: 2025-08-15  
**文档版本**: 1.0.0
