# Scope参数传递问题最终解决报告

## 问题状态: ✅ 已解决

## 根本问题
HTTP头部中不能包含未编码的中文字符，导致 `Invalid character in header content` 错误。

## 解决方案

### 1. HTTP头编码修复
修复了设置HTTP头时的中文字符编码问题：

**原代码（有问题）:**
```javascript
req.headers['x-search-scope'] = scope; // "泥沙知识" - 导致HTTP头错误
```

**修复后:**
```javascript
const encodedScope = encodeURIComponent(scope);
req.headers['x-search-scope'] = encodedScope; // "%E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86"
```

### 2. 参数解码修复
在使用HTTP头参数时正确解码：

```javascript
if (encodedScope) {
    try {
        scope = decodeURIComponent(encodedScope);
    } catch (e) {
        scope = encodedScope;
    }
}
```

## 测试验证

### 测试命令
```bash
curl -X POST "http://localhost:10101/api/searchV2" \
  -H "Content-Type: application/json" \
  -H "Referer: http://localhost:10101/search/test-id?scope=%E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86&question=test" \
  -d '{"question":"排沙洞运用限制条件","scope":"全网","kits":"极速"}'
```

### 测试结果
```
🔍 [API拦截] 从Referer提取参数 (原始): { scope: '泥沙知识', kits: null }
🎯 [API拦截] 设置scope头: 泥沙知识 (编码后: %E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86 )
🔍 [API拦截] 从请求中提取参数: { scope: '%E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86', kits: undefined }
🎯 [API拦截] 注入scope参数: 泥沙知识
🔍 [请求体拦截] 原始请求体: {"question":"排沙洞运用限制条件","scope":"全网","kits":"极速"}
🎯 [请求体拦截] 注入scope参数: 泥沙知识
🔍 [请求体拦截] 修改后的请求体: {"question":"排沙洞运用限制条件","scope":"泥沙知识","kits":"极速"}
```

## 关键修复点

1. **✅ URL参数传递**: 添加了`proxyReqPathResolver`确保查询参数正确传递
2. **✅ HTTP头编码**: 修复了中文字符在HTTP头中的编码问题  
3. **✅ 参数注入**: 正确从Referer提取scope参数并注入到请求体
4. **✅ 错误处理**: 添加了编码/解码的错误处理机制

## 流程验证

### 完整流程测试
1. 用户访问: `http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识`
2. ✅ URL参数被正确解析: `{ q: '排沙洞运用限制条件', scope: '泥沙知识' }`
3. ✅ 重定向到搜索页面，scope参数保留
4. ✅ 搜索API调用时，scope从"全网"被替换为"泥沙知识"
5. ✅ 请求体正确修改: `"scope":"泥沙知识"`

## 最终状态
**✅ 问题已完全解决**

现在当访问 `http://localhost:10101/?q=排沙洞运用限制条件&scope=泥沙知识` 时：
- scope参数正确传递到搜索API
- 搜索范围被限定为"泥沙知识"而不是"全网"
- 所有中文字符编码问题已解决

## 技术细节

### 编码流程
1. URL参数: `scope=泥沙知识` 
2. HTTP头编码: `x-search-scope: %E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86`
3. 参数解码: `scope = "泥沙知识"`
4. 请求体注入: `{"scope":"泥沙知识"}`

修复完成，scope参数现在能够正确设置为"泥沙知识"。
