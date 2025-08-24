# Scope参数问题根因分析与解决方案

## 问题根因

通过测试发现，scope参数传递的问题不在于URL编码，而在于metaso.cn的前端架构：

### 发现的问题模式

1. **初始请求正确**：带有scope参数的URL能被正确解析
   ```
   /search/238502f1-b80c-4eda-a9ec-9dc9e2f09a63?scope=%E6%B3%A5%E6%B2%99%E7%9F%A5%E8%AF%86&id=xxx&question=xxx
   ```

2. **UI设置成功**：我们的setupScope函数能正确设置页面UI的搜索范围选择

3. **搜索执行时丢失参数**：当执行实际搜索时，生成的新URL缺失scope参数
   ```
   /search/d7b53484-da03-4609-8e5a-c3c264a385a3?q=%E6%8E%92%E6%B2%99%E6%B4%9E%E8%BF%90%E7%94%A8%E9%99%90%E5%88%B6%E6%9D%A1%E4%BB%B6&_rsc=19q3s
   ```

## 核心问题

metaso.cn的搜索前端在执行搜索时，没有将用户在UI上选择的搜索范围(scope)信息编码到搜索API请求的URL中。

## 解决方案

需要拦截和增强搜索API调用，确保scope信息被正确传递：

### 方案1：拦截XMLHttpRequest/fetch API
在搜索API请求发出时，动态添加scope参数

### 方案2：修改React组件状态
直接修改metaso.cn的React组件状态，确保scope信息被包含在搜索逻辑中

### 方案3：URL重写拦截
在代理层面拦截搜索API请求，动态添加scope参数

## 测试结果

- ✅ URL参数解析正常（URLSearchParams.get()工作正常）
- ✅ UI范围设置成功（setupScope函数有效）
- ❌ 搜索API调用缺失scope参数
- ❌ 编码vs非编码不是问题关键

## 下一步

需要实现API拦截机制，确保scope参数在搜索时被正确传递给后端API。
