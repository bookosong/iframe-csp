# Scope参数传递问题修复报告 - 最终版

## 问题描述
当访问 `http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识` 时，scope参数没有被正确设置为"泥沙知识"，仍然采用全网知识。

## 问题根因
1. **URL路径解析缺失**: 代理配置缺少 `proxyReqPathResolver` 函数来处理查询参数的传递
2. **API参数拦截问题**: `/api/searchV2` 请求时没有正确从Referer中提取scope参数
3. **中文编码问题**: 中文字符在URL传递过程中出现编码问题

## 修复措施

### 1. 添加URL路径解析器
在代理配置中添加了 `proxyReqPathResolver` 函数：
```javascript
proxyReqPathResolver: function(req) {
    console.log('\n=== URL路径解析 ===');
    console.log('原始路径:', req.path);
    console.log('原始查询参数:', req.query);
    
    // 保留所有原始查询参数
    let targetPath = req.path;
    const queryParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(req.query)) {
        queryParams.set(key, value);
        console.log(`📋 保留参数: ${key} = ${value}`);
    }
    
    if (queryParams.toString()) {
        targetPath = `${req.path}?${queryParams.toString()}`;
    }
    
    console.log('目标路径:', targetPath);
    return targetPath;
}
```

### 2. 改进API参数拦截
修复了从Referer中提取scope参数的逻辑，确保中文字符正确处理。

## 测试结果

### 测试1: URL参数传递
```bash
curl -v "http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识"
```
**结果**: ✅ 成功传递scope参数，日志显示：
- 原始查询参数: `{ q: '排沙洞运用限制条件', scope: '泥沙知识' }`
- 目标路径: `/?q=排沙洞运用限制条件&scope=泥沙知识`

### 测试2: 搜索API调用
浏览器访问搜索页面后，searchV2 API被正确调用，日志显示：
- URL包含正确的scope参数: `scope=%E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86`
- 搜索请求成功执行

### 测试3: 完整流程
1. 用户访问: `http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识`
2. 系统重定向到搜索页面
3. 搜索页面加载并执行搜索
4. scope参数被正确传递给后端API

## 修复状态
✅ **已修复** - scope参数现在能够正确传递到搜索API

## 验证方法
1. 启动代理服务器: `nohup node metaso-proxy-autosearch.js > nohup.out 2>&1 &`
2. 访问测试URL: `http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识`
3. 查看日志: `tail -f nohup.out` 确认scope参数被正确处理
4. 在搜索结果页面确认搜索范围限定在"泥沙知识"

## 关键改进点
1. **参数传递完整性**: 确保所有URL查询参数都被正确传递
2. **中文编码支持**: 正确处理中文字符的URL编码和解码
3. **API拦截增强**: 改进了searchV2 API的参数拦截和注入机制
4. **日志可观测性**: 增加了详细的调试日志，便于问题排查

修复后，scope参数能够正确地从URL传递到搜索API，实现了预期的功能。
