const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');

// 动态导入cheerio以避免版本兼容性问题
let cheerio;
try {
    cheerio = require('cheerio');
} catch (error) {
    console.error('无法加载cheerio模块，请确保已安装兼容版本:', error.message);
    process.exit(1);
}

class ResourceDownloader {
    constructor(htmlFilePath, staticDir) {
        this.htmlFilePath = htmlFilePath;
        this.staticDir = staticDir;
        this.downloadedUrls = new Set();
        this.baseUrl = 'https://metaso.cn';
        
        // 确保静态目录存在
        if (!fs.existsSync(staticDir)) {
            fs.mkdirSync(staticDir, { recursive: true });
        }
    }

    // 从HTML文件中提取所有资源URL
    extractResourceUrls(html) {
        const $ = cheerio.load(html);
        const resources = new Set();

        // 提取CSS文件
        $('link[rel="stylesheet"]').each((_, elem) => {
            const href = $(elem).attr('href');
            if (href) {
                resources.add(this.normalizeUrl(href));
            }
        });

        // 提取JS文件
        $('script[src]').each((_, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                resources.add(this.normalizeUrl(src));
            }
        });

        // 提取图片
        $('img[src]').each((_, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                resources.add(this.normalizeUrl(src));
            }
        });

        // 提取preload链接
        $('link[rel="preload"]').each((_, elem) => {
            const href = $(elem).attr('href');
            if (href) {
                resources.add(this.normalizeUrl(href));
            }
        });

        // 提取其他类型的资源
        $('[href], [src]').each((_, elem) => {
            const $elem = $(elem);
            const href = $elem.attr('href') || $elem.attr('src');
            if (href && this.isStaticResource(href)) {
                resources.add(this.normalizeUrl(href));
            }
        });

        return Array.from(resources);
    }

    // 规范化URL
    normalizeUrl(resourceUrl) {
        if (resourceUrl.startsWith('//')) {
            return 'https:' + resourceUrl;
        } else if (resourceUrl.startsWith('/')) {
            return this.baseUrl + resourceUrl;
        } else if (!resourceUrl.startsWith('http')) {
            return this.baseUrl + '/' + resourceUrl;
        }
        return resourceUrl;
    }

    // 检查是否为静态资源
    isStaticResource(url) {
        const staticExtensions = [
            '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
            '.woff', '.woff2', '.ttf', '.ico', '.json', '.xml', '.mp4',
            '.webm', '.pdf', '.zip', '.eot', '.otf'
        ];
        const urlLower = url.toLowerCase();
        return staticExtensions.some(ext => urlLower.includes(ext)) ||
               urlLower.includes('/static/') ||
               urlLower.includes('/assets/') ||
               urlLower.includes('metaso.cn_files/') ||
               urlLower.includes('/fonts/') ||
               urlLower.includes('static-1.metaso.cn');
    }

    // 获取预定义的字体文件列表
    getPredefinedFontUrls() {
        const baseFontUrl = 'https://static-1.metaso.cn/static/output/chtml/fonts/woff-v2';
        const fontFiles = [
            'MathJax_Zero.woff',
            'MathJax_Main-Regular.woff',
            'MathJax_Main-Bold.woff',
            'MathJax_Math-Italic.woff',
            'MathJax_Main-Italic.woff',
            'MathJax_Math-Regular.woff',
            'MathJax_Size1-Regular.woff',
            'MathJax_Size2-Regular.woff',
            'MathJax_Size3-Regular.woff',
            'MathJax_Size4-Regular.woff',
            'MathJax_Script-Regular.woff',
            'MathJax_Fraktur-Regular.woff',
            'MathJax_SansSerif-Regular.woff',
            'MathJax_SansSerif-Bold.woff',
            'MathJax_SansSerif-Italic.woff',
            'MathJax_Monospace-Regular.woff',
            'MathJax_Typewriter-Regular.woff',
            'MathJax_Caligraphic-Regular.woff',
            'MathJax_Caligraphic-Bold.woff'
        ];
        
        return fontFiles.map(file => `${baseFontUrl}/${file}`);
    }

    // 生成本地文件路径
    getLocalPath(resourceUrl) {
        const urlObj = url.parse(resourceUrl);
        let pathname = urlObj.pathname;
        
        // 处理特殊路径
        if (pathname.includes('/metaso.cn_files/')) {
            // 保持原始的文件夹结构
            return path.join(this.staticDir, pathname.replace(/^\//, ''));
        }
        
        // 处理MathJax字体文件
        if (pathname.includes('/output/chtml/fonts/woff-v2/')) {
            const fontFileName = path.basename(pathname);
            return path.join(this.staticDir, 'metaso.cn_files/output/chtml/fonts/woff-v2', fontFileName);
        }
        
        // 对于其他静态资源，创建合理的目录结构
        if (pathname.startsWith('/static/')) {
            return path.join(this.staticDir, 'metaso.cn_files', pathname.replace(/^\/static\//, ''));
        }
        
        // 根据文件扩展名分类
        const ext = path.extname(pathname);
        let subDir = '';
        
        if (['.css'].includes(ext)) {
            subDir = 'metaso.cn_files';
        } else if (['.js'].includes(ext)) {
            subDir = 'metaso.cn_files';
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
            subDir = 'metaso.cn_files';
        } else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) {
            subDir = 'metaso.cn_files/fonts';
        } else {
            subDir = 'metaso.cn_files/other';
        }
        
        const filename = path.basename(pathname) || 'index.html';
        return path.join(this.staticDir, subDir, filename);
    }

    // 下载单个资源
    async downloadResource(resourceUrl) {
        if (this.downloadedUrls.has(resourceUrl)) {
            console.log(`已跳过（已下载）: ${resourceUrl}`);
            return;
        }

        try {
            const localPath = this.getLocalPath(resourceUrl);
            const localDir = path.dirname(localPath);
            
            // 确保目录存在
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }

            // 如果文件已存在，跳过下载
            if (fs.existsSync(localPath)) {
                console.log(`已跳过（文件存在）: ${resourceUrl}`);
                this.downloadedUrls.add(resourceUrl);
                return;
            }

            console.log(`正在下载: ${resourceUrl} -> ${localPath}`);
            
            const data = await this.httpGet(resourceUrl);
            fs.writeFileSync(localPath, data);
            
            this.downloadedUrls.add(resourceUrl);
            console.log(`下载完成: ${resourceUrl}`);
            
            // 如果是CSS文件，递归下载其中引用的资源
            if (resourceUrl.toLowerCase().includes('.css')) {
                await this.downloadCssResources(data.toString(), resourceUrl);
            }
            
        } catch (error) {
            console.error(`下载失败 ${resourceUrl}:`, error.message);
        }
    }

    // 下载CSS中引用的资源
    async downloadCssResources(cssContent, cssUrl) {
        const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
        let match;
        
        while ((match = urlRegex.exec(cssContent)) !== null) {
            let resourceUrl = match[1];
            
            // 处理相对URL
            if (resourceUrl.startsWith('//')) {
                resourceUrl = 'https:' + resourceUrl;
            } else if (resourceUrl.startsWith('/')) {
                resourceUrl = this.baseUrl + resourceUrl;
            } else if (!resourceUrl.startsWith('http')) {
                // 相对于CSS文件的URL
                const cssUrlObj = url.parse(cssUrl);
                const baseDir = path.dirname(cssUrlObj.pathname);
                resourceUrl = this.baseUrl + path.posix.join(baseDir, resourceUrl);
            }
            
            if (this.isStaticResource(resourceUrl)) {
                console.log(`从CSS中发现资源: ${resourceUrl}`);
                await this.downloadResource(resourceUrl);
            }
        }
    }

    // 下载预定义的字体文件
    async downloadPredefinedFonts() {
        console.log('开始下载预定义的字体文件...');
        const fontUrls = this.getPredefinedFontUrls();
        
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;
        
        for (const fontUrl of fontUrls) {
            try {
                const localPath = this.getLocalPath(fontUrl);
                
                if (fs.existsSync(localPath)) {
                    console.log(`字体已存在: ${path.basename(fontUrl)}`);
                    skipCount++;
                    continue;
                }
                
                console.log(`下载字体: ${path.basename(fontUrl)}`);
                await this.downloadResource(fontUrl);
                successCount++;
                
            } catch (error) {
                console.error(`字体下载失败 ${fontUrl}:`, error.message);
                failCount++;
            }
        }
        
        console.log(`字体下载完成: 成功=${successCount}, 跳过=${skipCount}, 失败=${failCount}`);
    }

    // HTTP请求包装器
    httpGet(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https:') ? https : http;
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            };
            
            const req = client.get(url, options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // 处理重定向
                    this.httpGet(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            
            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    // 主下载方法
    async downloadAll(includeFonts = true) {
        try {
            console.log('正在读取HTML文件...');
            const html = fs.readFileSync(this.htmlFilePath, 'utf8');
            
            console.log('正在提取资源URL...');
            const resourceUrls = this.extractResourceUrls(html);
            
            console.log(`找到 ${resourceUrls.length} 个资源需要下载`);
            
            // 先下载预定义的字体文件
            if (includeFonts) {
                await this.downloadPredefinedFonts();
            }
            
            // 并发下载（限制并发数）
            const concurrency = 5;
            for (let i = 0; i < resourceUrls.length; i += concurrency) {
                const batch = resourceUrls.slice(i, i + concurrency);
                await Promise.all(batch.map(url => this.downloadResource(url)));
            }
            
            console.log('所有资源下载完成！');
            console.log(`成功下载了 ${this.downloadedUrls.size} 个资源`);
            
            // 显示下载统计
            this.showDownloadStats();
            
        } catch (error) {
            console.error('下载过程中出现错误:', error);
        }
    }

    // 显示下载统计信息
    showDownloadStats() {
        console.log('\n=== 下载统计 ===');
        
        const stats = {
            total: this.downloadedUrls.size,
            css: 0,
            js: 0,
            images: 0,
            fonts: 0,
            other: 0
        };
        
        for (const url of this.downloadedUrls) {
            const urlLower = url.toLowerCase();
            if (urlLower.includes('.css')) {
                stats.css++;
            } else if (urlLower.includes('.js')) {
                stats.js++;
            } else if (urlLower.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)/)) {
                stats.images++;
            } else if (urlLower.match(/\.(woff|woff2|ttf|eot|otf)/)) {
                stats.fonts++;
            } else {
                stats.other++;
            }
        }
        
        console.log(`总计: ${stats.total}`);
        console.log(`CSS文件: ${stats.css}`);
        console.log(`JS文件: ${stats.js}`);
        console.log(`图片文件: ${stats.images}`);
        console.log(`字体文件: ${stats.fonts}`);
        console.log(`其他文件: ${stats.other}`);
        
        // 检查字体目录
        const fontDir = path.join(this.staticDir, 'metaso.cn_files/output/chtml/fonts/woff-v2');
        if (fs.existsSync(fontDir)) {
            const fontFiles = fs.readdirSync(fontDir).filter(f => f.endsWith('.woff'));
            console.log(`本地字体文件: ${fontFiles.length} 个`);
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const htmlFilePath = path.join(__dirname, '../static/metaso.cn.html');
    const staticDir = path.join(__dirname, '../static');
    
    // 处理命令行参数
    const args = process.argv.slice(2);
    const fontsOnly = args.includes('--fonts-only');
    const skipFonts = args.includes('--skip-fonts');
    const includeFonts = !skipFonts;
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('使用方法:');
        console.log('  node download-resources.js              # 下载所有资源（包括字体）');
        console.log('  node download-resources.js --fonts-only # 仅下载字体文件');
        console.log('  node download-resources.js --skip-fonts # 跳过字体文件下载');
        console.log('  node download-resources.js --help       # 显示帮助信息');
        process.exit(0);
    }
    
    const downloader = new ResourceDownloader(htmlFilePath, staticDir);
    
    if (fontsOnly) {
        console.log('仅下载字体文件模式');
        downloader.downloadPredefinedFonts().then(() => {
            console.log('字体下载完成！');
        }).catch(error => {
            console.error('字体下载失败:', error);
        });
    } else {
        console.log(includeFonts ? '下载所有资源（包括字体）' : '下载所有资源（跳过字体）');
        downloader.downloadAll(includeFonts);
    }
}

module.exports = ResourceDownloader;
