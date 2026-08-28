import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import * as ElementPlusIcons from '@element-plus/icons-vue'
import { resolve } from 'path'

/**
 * Element Plus 图标白名单
 * 解决：DashboardPage.vue 等页面模板里用 <UserFilled /> 但没手写 import。
 * ElementPlusResolver 只管 El* 前缀，icons-vue 的具名导出（293 个）需要单独映射。
 * 不用正则匹配 PascalCase 是因为 RouterView / Suspense / 业务组件等也会误命中。
 */
const ElementPlusIconsSet = new Set<string>(Object.keys(ElementPlusIcons))
const ElementPlusIconsResolver = {
  type: 'component' as const,
  resolve: (name: string) => {
    if (ElementPlusIconsSet.has(name)) {
      return {
        name,
        from: '@element-plus/icons-vue',
      }
    }
  },
}

/**
 * Vite 构建配置
 *
 * 关键优化：
 * 1. unplugin-auto-import + unplugin-vue-components + ElementPlusResolver
 *    实现 element-plus 的**按需引入**：
 *    - 模板中用到的组件自动注册（不再打包全量 element-plus）
 *    - 命令式 API（ElMessage / ElMessageBox 等）自动 import
 *    - 预期：vendor-element-plus 从 ~946KB 降至仅用到的组件总和
 *
 * 2. 自定义 ElementPlusIconsResolver：把 PascalCase 的图标名
 *    （如 <UserFilled />、<Lock />）自动解析为 @element-plus/icons-vue 的具名导出，
 *    免去每个使用页面手写 import（DashboardPage.vue 等用了 12 个图标）。
 *
 * 3. manualChunks 把其他第三方重库（xlsx、html2canvas、antv/g6、pdfjs）
 *    拆分为独立 chunk，避免单个主 chunk 超过告警阈值。
 */
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      // 自动 import 以下 API：Vue / Vue Router / Pinia + element-plus 命令式 API
      imports: [
        'vue',
        'vue-router',
        'pinia',
      ],
      resolvers: [ElementPlusResolver()],
      // 把自动生成的 import 声明落到 .gitignore 的目录，避免污染 git
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      // 自动注册模板中出现的 <ElXxx /> 组件
      // 关闭 importStyle：main.ts 已全量 import 'element-plus/dist/index.css'，
      // 避免 resolver 注入的 style/css 子路径在 element-plus 2.14 上解析失败
      resolvers: [
        ElementPlusResolver({ importStyle: false }),
        // 白名单匹配 @element-plus/icons-vue 的 293 个具名图标
        ElementPlusIconsResolver,
      ],
      // 同上，避免污染 git
      dts: 'src/components.d.ts',
    }),
  ],
  // G6 5.x 内部存在深层循环依赖 —— esbuild 预构建时把多个 ESM 文件拍平到一个 chunk 后
  // class extends 顺序错乱（Circle extends BaseNode 在 BaseNode 定义前执行），导致
  // "Class extends value undefined"。
  //
  // 修复：仅 exclude @antv/g6（有循环依赖），@g6 的父包 @antv/g 和 @antv/component
  // 保留预构建（它们自身的模块结构无循环依赖，进行预构建可以顺便处理 color-string 等
  // CJS 子依赖的 ESM interop）。
  // 对于其他 CJS/UMD 格式的依赖，加入 include 让 esbuild 做 commonjs interop。
  optimizeDeps: {
    exclude: ['@antv/g6'],
    include: [
      '@antv/hierarchy',
      // CJS → ESM interop
      'eventemitter3',
      'svg-path-parser',
      'dayjs',
      'color-string',
    ],
    // 不自定义 esbuildOptions：使用 Vite 5.x 默认配置（target: es2020, format: esm），
    // 与 element-plus 2.14 + Vue 3.5 兼容；自定义 target: 'esnext' 会破坏 Element Plus
    // ElConfigProvider 的 renderSlot 上下文，导致 currentRenderingInstance 为 null。
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      // 所有 /api/* 直接代理到后端，保留 /api 前缀（与生产环境 Nginx 行为一致）。
      // 不再为 auth 模块做特殊重写：所有 Controller 已统一为 @Controller('api/xxx')。
      '/api': {
        target: 'http://localhost:3101',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
  build: {
    // 提高 chunk 警告阈值（原 500kB）
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 生态（与 element-plus 分离，因为 element-plus 已按需拆到各路由 chunk）
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // 图标按需从 @element-plus/icons-vue 引入
          // 如果某些页面大量使用图标，可考虑单独打 vendor-icons
          // 'vendor-icons': ['@element-plus/icons-vue'],

          // 重型第三方库（按需懒加载页面才会命中）
          'vendor-xlsx': ['xlsx'],
          'vendor-html2canvas': ['html2canvas'],
          // @antv/g6 不放在 manualChunks 中：G6 5.x 内部存在深层循环依赖，
          // 强制合并在一个 chunk 会导致 class extends 初始化顺序错乱
          // （如 "Cannot access 'zn'/'Bn' before initialization"）。
          // 让 Rollup 自然分块处理，配合 optimizeDeps.exclude 避免该问题；
          // GenealogyTree 内对 G6 的所有导入均为动态 import（见 loadG6Runtime），
          // 不会把循环依赖拖进静态合并路径。
          // 'vendor-antv': ['@antv/g6'],
          'vendor-pdfjs': ['pdfjs-dist'],

          // lodash-es 多模块（omit / omitBy / ...）各自独立 chunk 后会重复声明变量 `h`
          // （Rollup 报错 "Identifier 'h' has already been declared"），
          // 强制合并到单一 chunk 后所有 lodash 函数在同一作用域，声明顺序受控。
          'vendor-lodash': ['lodash-es'],

          // axios 不再独占 manualChunks：
          // axios 内部某些内部模块（如 defaults / helpers）使用了与业务代码（request.ts 的
          // 错误码常量 const h = {UNAUTHORIZED: ...}）同名的局部变量 `h`。
          // 强制独占 chunk 后 Rollup 的 hoistTranscripts 会把 chunk 中的 `var h` 提升为
          // module-scope，与 request chunk 中的 `const h` 冲突（Identifier h already declared）。
          // 取消独占后，axios 被内联到使用方 chunk，自然复用同一作用域。
          // 'vendor-utils': ['axios'],
        },
      },
    },
  },
})
