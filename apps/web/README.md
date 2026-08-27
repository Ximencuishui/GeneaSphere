# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## 树谱布局 Demo（运行时验收用）

启动 dev server 后访问下列路由验收 v4 布局引擎（一夫多妻 + 子树避让）：

| 路由 | 用途 |
| --- | --- |
| [`/demo/tree-multi-wife`](http://localhost:5173/demo/tree-multi-wife) | 直接调用 `LayoutEngine` 渲染 SVG，4 个最小场景（**一夫四妻 / 单妻多子女 / 连襟 / 双重身份**）+ 节点点击高亮配偶边交互 |

配套文档：
- [`docs/树谱模块‑需求文档（PRD）.md`](../../docs/树谱模块‑需求文档（PRD）.md) §2.7 / §7 / §8
- [`docs/族谱树布局引擎 v3：Reingold-Tilford 轮廓算法需求文档.md`](../../docs/族谱树布局引擎%20v3：Reingold-Tilford%20轮廓算法需求文档.md) §11
- [`docs/树谱一夫多妻与子树避让优化-验收测试清单.md`](../../docs/树谱一夫多妻与子树避让优化-验收测试清单.md)
