import { createApp } from "vue"
import { createPinia } from "pinia"
import ElementPlus from "element-plus"
import "element-plus/dist/index.css"
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
app.use(ElementPlus)

app.mount("#app")