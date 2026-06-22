---
name: ui-design-to-code
description: Convert Figma design files into Vue 3 + Element Plus component code. Use when the user pastes a Figma link, asks to implement a UI design, create a page from mockup, or convert design to code. Supports responsive layout and follows project design conventions.
---

# UI Design to Code

## Overview

将 Figma 设计稿转换为项目中可用的 Vue 3 + Element Plus 组件代码。

## Prerequisites

需要 Figma MCP 服务器已配置（项目 `.mcp.json` 中已有 Figma 远程 MCP）。

## Workflow

### Step 1: 获取 Figma 设计上下文

用户提供 Figma 链接时：
1. 使用 Figma MCP 的 `get_file_context` 工具获取设计文件元数据
2. 使用 `get_selection_context` 获取用户选中的具体 frame/layer
3. 提取布局结构、颜色、字体、间距等设计信息

### Step 2: 分析设计结构

从 Figma 上下文中识别：
- **布局层级**：Flex/Grid 容器结构
- **组件映射**：哪些部分可用 Element Plus 组件替代
- **交互模式**：按钮、表单、对话框等交互元素
- **响应式断点**：设计中的适配规则

### Step 3: 生成 Vue 3 组件代码

遵循项目规范生成代码：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
// Element Plus 组件按需导入
import { ElButton, ElForm, ElMessage } from 'element-plus'
// 图标按需导入
import { Plus, Edit, Delete } from '@element-plus/icons-vue'

// 响应式数据
const loading = ref(false)
</script>

<template>
  <div class="page-container">
    <!-- 使用 Element Plus 组件 -->
  </div>
</template>

<style scoped>
/* BEM 风格命名，与项目现有样式一致 */
.page-container {
  /* 样式 */
}
</style>
```

## 项目设计规范

### 技术栈
- **框架**：Vue 3 Composition API (`<script setup lang="ts">`)
- **UI 库**：Element Plus 2.x
- **图标**：`@element-plus/icons-vue`（按需导入）
- **样式**：`<style scoped>` + CSS（非预处理器）
- **状态管理**：Pinia

### Element Plus 组件映射规则

| 设计元素 | Element Plus 组件 |
|---------|-------------------|
| 主按钮 | `<el-button type="primary">` |
| 次要按钮 | `<el-button>` |
| 输入框 | `<el-input>` |
| 表单 | `<el-form>` + `<el-form-item>` |
| 卡片 | `<el-card>` |
| 对话框 | `<el-dialog>` |
| 表格 | `<el-table>` |
| 标签页 | `<el-tabs>` + `<el-tab-pane>` |
| 下拉菜单 | `<el-dropdown>` |
| 消息提示 | `ElMessage` / `ElMessageBox` |
| 标签 | `<el-tag>` |
| 头像 | `<el-avatar>` |
| 空状态 | `<el-empty>` |

### CSS 命名规范

- 页面级容器：`.page-name-container` 或 `.page-name`
- 区块：`.section-name`
- 组件内部：`.component-name-header`, `.component-name-body`
- 使用项目已有颜色变量：
  - 主色（深棕）：`#5D4037`
  - 强调色（金色）：`#C9A96E`
  - 背景色：`#FAF8F5`
  - 文字色：`#333`（主）、`#666`（次）、`#999`（辅）

### 响应式布局

```css
/* 桌面优先，使用 min-width 断点 */
.container { width: 100%; }

@media (min-width: 768px) {
  .container { max-width: 720px; }
}
@media (min-width: 1024px) {
  .container { max-width: 960px; }
}
@media (min-width: 1280px) {
  .container { max-width: 1200px; }
}
```

## 生成代码检查清单

- [ ] 使用 `<script setup lang="ts">` 语法
- [ ] Element Plus 组件和图标按需导入
- [ ] 所有 props 有 TypeScript 类型定义
- [ ] `<style scoped>` 使用 BEM 命名
- [ ] 响应式断点覆盖
- [ ] 交互反馈（ElMessage 成功/错误提示）
- [ ] 加载状态处理（`v-loading` 指令或 `loading` ref）
- [ ] 空状态展示（`<el-empty>`）

## 示例 Prompt

```
用户：请根据这个 Figma 设计实现登录页面 https://www.figma.com/design/xxx
助手：[获取 Figma 上下文] → [分析设计] → [生成 Vue 3 + Element Plus 组件代码]
```
