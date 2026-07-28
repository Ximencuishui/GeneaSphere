import { createApp } from "vue"
import { createPinia } from "pinia"
import "element-plus/dist/index.css" // 全量 CSS（体积小 ~30KB gzip，且可被浏览器强缓存复用）
import "leaflet/dist/leaflet.css"
import App from "./App.vue"
import router from "./router"
import axios from "axios"

const TOKEN_KEY = "geneasphere_token"
const token = localStorage.getItem(TOKEN_KEY)
if (token) {
  axios.defaults.headers.common["Authorization"] = "Bearer " + token
}

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// ⚠️ 不再 app.use(ElementPlus)：那会强制全量打包 element-plus。
// 改为在 App.vue 用 <ElConfigProvider> 注入 locale/size（按需引入）

app.mount("#app")

/**
 * 隐藏 index.html 中的初始加载占位（#initial-loader）
 *
 * 背景：浏览器解析 HTML 时 #initial-loader 立即可见（不依赖任何 JS chunk），
 * 用来填补 element-plus 等大 chunk 下载完成前的视觉空白。
 * Vue mount 后通过 .is-hidden 类淡出隐藏，避免与 Vue 渲染内容重叠。
 *
 * 使用 requestAnimationFrame 推迟到下一帧，确保 Vue 渲染管线已接管 DOM，
 * 避免 transition 动画与 Vue 挂载时机冲突导致闪屏。
 */
requestAnimationFrame(() => {
  const initialLoader = document.getElementById("initial-loader")
  if (initialLoader) {
    initialLoader.classList.add("is-hidden")
    // 完全移除节点（保留动画完成时间），避免占用 z-index 栈
    setTimeout(() => {
      initialLoader.remove()
    }, 500)
  }
})
