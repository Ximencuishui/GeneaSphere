<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import MigrationParticles from '@/components/home/MigrationParticles.vue'
import SurnameLegend from '@/components/home/SurnameLegend.vue'
import QuickSearchBar from '@/components/home/QuickSearchBar.vue'
import DemoRoleModal from '@/components/landing/DemoRoleModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const demoModalVisible = ref(false)
const scrollY = ref(0)
const currentYear = new Date().getFullYear()
const highlightedSurname = ref<string | null>(null)

// 检查用户是否为管理员（需求文档: 营销网站后台入口对接）
const isAdmin = computed(() => {
  const token = localStorage.getItem('geneasphere_token')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return ['OWNER', 'ADMIN'].includes(payload.role)
  } catch {
    return false
  }
})

const goToAdmin = () => {
  // 一键体验/演示用户走 slug 直接进入家族后台，避免 /admin/* 重定向到
  // /select-family 后触发 /api/auth/me/admin-clans 返回 401 被踢回登录页
  const demoSlug = localStorage.getItem('demo_clan_slug')
  if (demoSlug) {
    router.push(`/zupu/${demoSlug}/dashboard`)
    return
  }
  router.push('/admin/dashboard')
}

const surnames = [
  { name: '李', color: '#C9A96E', description: '发源于陇西（今甘肃东南部）' },
  { name: '王', color: '#E8A87C', description: '发源于太原（今山西中部）' },
  { name: '张', color: '#85C1A9', description: '发源于清河（今河北南部）' },
  { name: '刘', color: '#7FB3D8', description: '发源于彭城（今江苏徐州）' },
  { name: '陈', color: '#F0B27A', description: '发源于颍川（今河南许昌）' },
  { name: '杨', color: '#A3D4C4', description: '发源于弘农（今河南灵宝）' },
  { name: '赵', color: '#D7A9E4', description: '发源于天水（今甘肃天水）' },
  { name: '黄', color: '#F5CBA7', description: '发源于江夏（今湖北武汉）' },
  { name: '周', color: '#A9CCE3', description: '发源于汝南（今河南平舆）' },
  { name: '吴', color: '#82E0AA', description: '发源于吴郡（今江苏苏州）' },
]

const handleScroll = () => {
  scrollY.value = window.scrollY
}

/**
 * 打开演示账号选择弹窗（营销网页统一入口）。
 * 真实登录逻辑由 DemoRoleModal 组件内部处理。
 */
const openDemoModal = () => {
  demoModalVisible.value = true
}

/**
 * 弹窗内登录成功回调：根据角色跳转到对应落地页。
 * - admin：跳 /zupu/:slug/dashboard（家族管理后台）
 * - member：直接跳 /user-center/families（族员个人中心，无需中转 dashboard）
 */
const onDemoLoginSuccess = async (role: 'admin' | 'member') => {
  demoModalVisible.value = false
  if (role === 'member') {
    await router.push('/user-center/families')
    return
  }
  const slug = localStorage.getItem('demo_clan_slug')
  if (slug) {
    await router.push(`/zupu/${slug}/dashboard`)
  } else {
    await router.push('/clans')
  }
}

const goRegister = () => router.push('/register')

function onSurnameHover(name: string | null) {
  highlightedSurname.value = name
}

function onNodeClick(nodeName: string) {
  ElMessage.info(`点击了迁徙节点：${nodeName}`)
}

onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
  <div class="landing-page">
    <!-- 导航栏 -->
    <header class="navbar" :class="{ scrolled: scrollY > 50 }">
      <div class="nav-inner">
        <div class="logo">
          <span class="logo-icon">寻</span>
          <span class="logo-text">寻根路 · xungenlu.cn</span>
        </div>
        <div class="nav-actions">
          <el-button class="btn-outline" @click="goRegister">注册</el-button>
          <el-button class="btn-outline" @click="router.push('/login')">登录</el-button>
          <el-button
            type="primary"
            size="large"
            class="btn-demo-nav"
            @click="openDemoModal"
          >
            立即体验
          </el-button>
          <el-button
            v-if="isAdmin"
            type="warning"
            plain
            class="btn-admin-nav"
            @click="goToAdmin"
          >
            进入后台
          </el-button>
        </div>
      </div>
    </header>

    <!-- Hero 区域 - 全屏粒子动画 -->
    <section class="hero">
      <div class="hero-canvas-container">
        <MigrationParticles
          :highlighted-surname="highlightedSurname"
          @surname-hover="onSurnameHover"
          @node-click="onNodeClick"
        />
      </div>
      <div class="hero-overlay" :class="{ 'overlay-scrolled': scrollY > 100 }">
        <div class="hero-content">
          <div class="hero-tag">基于时空记忆的族谱共创平台</div>
          <h1 class="hero-title">
            寻根路<br />
            <span class="hero-highlight">让每一支血脉都被铭记</span>
          </h1>
          <p class="hero-desc">
            姓氏迁徙动画 · 可视化族谱树 · 智能寻亲归宗 · 地方记忆拼图
          </p>

          <!-- 搜索框 -->
          <div class="hero-search">
            <QuickSearchBar />
          </div>

          <div class="hero-cta">
            <el-button
              type="primary"
              size="large"
              class="btn-demo-hero"
              @click="openDemoModal"
            >
              <span class="btn-icon">&#9654;</span>
              一键体验演示账号
            </el-button>
            <span class="hero-hint">无需注册，即刻体验完整功能</span>
          </div>
        </div>

        <!-- 姓氏图例 - 仅在桌面端显示 -->
        <SurnameLegend
          :surnames="surnames"
          :highlighted-surname="highlightedSurname"
          @select="highlightedSurname = $event"
        />
      </div>
    </section>

    <!-- 关于时空记忆 -->
    <section class="about-section" id="about">
      <div class="section-header">
        <h2>什么是「时空记忆」</h2>
        <p>三大维度，重构家族记忆的数字连接</p>
      </div>
      <div class="about-grid">
        <div class="about-card">
          <div class="about-icon">
            <svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="20" fill="none" stroke="#C9A96E" stroke-width="2"/><path d="M24 10v14l8 8" stroke="#C9A96E" stroke-width="2" fill="none"/></svg>
          </div>
          <h3>空间维度 · 迁徙之路</h3>
          <p>以姓氏为线索，在中国地图上再现千年迁徙轨迹。从发源地到散居地，每一道光流都是一段家族史诗。</p>
        </div>
        <div class="about-card">
          <div class="about-icon">
            <svg viewBox="0 0 48 48" width="48" height="48"><rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="#C9A96E" stroke-width="2"/><line x1="16" y1="24" x2="32" y2="24" stroke="#C9A96E" stroke-width="2"/><line x1="24" y1="16" x2="24" y2="32" stroke="#C9A96E" stroke-width="2"/></svg>
          </div>
          <h3>时间维度 · 时光长廊</h3>
          <p>按年代组织家族影像与记忆，从清末到当代，跨越百年的家族故事在时间轴上徐徐展开。</p>
        </div>
        <div class="about-card">
          <div class="about-icon">
            <svg viewBox="0 0 48 48" width="48" height="48"><circle cx="14" cy="14" r="6" fill="none" stroke="#C9A96E" stroke-width="2"/><circle cx="34" cy="14" r="6" fill="none" stroke="#C9A96E" stroke-width="2"/><circle cx="24" cy="34" r="6" fill="none" stroke="#C9A96E" stroke-width="2"/><line x1="18" y1="18" x2="22" y2="30" stroke="#C9A96E" stroke-width="1.5"/><line x1="30" y1="18" x2="26" y2="30" stroke="#C9A96E" stroke-width="1.5"/></svg>
          </div>
          <h3>共创维度 · 地方记忆</h3>
          <p>共建地方记忆题库，用本地人的真实回答验证身份。每一份"我知道"都是对历史的证实与传承。</p>
        </div>
      </div>
    </section>

    <!-- 核心卖点 -->
    <section class="features" id="features">
      <div class="section-header">
        <h2>为什么选择寻根路</h2>
        <p>专为家族文化传承打造的全链路数字化工具</p>
      </div>
      <div class="feature-grid">
        <div class="feature-card">
          <div class="feature-icon">&#127795;</div>
          <h3>可视化族谱树</h3>
          <p>交互式族谱树状图，支持缩放、拖拽、点击查看详情。直观展示家族世代传承脉络。</p>
          <ul class="feature-list">
            <li>多代同屏展示</li>
            <li>节点详情面板</li>
            <li>关系图谱浏览</li>
          </ul>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#128270;</div>
          <h3>智能寻亲归宗</h3>
          <p>基于字辈、祖籍地、关键祖先等信息的智能匹配算法，帮助失散支系找到根源。</p>
          <ul class="feature-list">
            <li>自动信息比对</li>
            <li>匹配度评分</li>
            <li>安全归宗合并</li>
          </ul>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#128274;</div>
          <h3>隐私安全守护</h3>
          <p>精细化的权限控制体系，支持在世人员信息隐藏、亲属验证登录、游客访问限制。</p>
          <ul class="feature-list">
            <li>四级角色权限</li>
            <li>亲属验证登录</li>
            <li>操作全程审计</li>
          </ul>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#128248;</div>
          <h3>时光长廊</h3>
          <p>按年份组织的家族影像档案馆，支持照片上传、地点标记、人物关联。</p>
          <ul class="feature-list">
            <li>年份轴浏览</li>
            <li>智能标签分类</li>
            <li>同村照片发现</li>
          </ul>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#128229;</div>
          <h3>Excel 一键导入</h3>
          <p>支持从 Excel 表格批量导入族谱数据，智能列映射自动识别字段。</p>
          <ul class="feature-list">
            <li>拖拽上传文件</li>
            <li>智能列映射</li>
            <li>错误自动校验</li>
          </ul>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#128424;</div>
          <h3>族谱印刷服务</h3>
          <p>支持在线预览和下单族谱印刷，多种装订规格可选。</p>
          <ul class="feature-list">
            <li>PDF 在线预览</li>
            <li>多规格可选</li>
            <li>订单全程跟踪</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 3 步体验 -->
    <section class="demo-flow" id="demo">
      <div class="section-header">
        <h2>3 步体验完整功能</h2>
        <p>无需注册、无需下载，即刻开始您的家族数字化之旅</p>
      </div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="step-number">1</div>
          <div class="step-icon">&#128074;</div>
          <h3>点击"一键体验"</h3>
          <p>点击任意页面上的"一键体验演示账号"按钮，系统自动为您创建临时体验环境。</p>
        </div>
        <div class="flow-arrow">&#8594;</div>
        <div class="flow-step">
          <div class="step-number">2</div>
          <div class="step-icon">&#127795;</div>
          <h3>浏览演示族谱</h3>
          <p>进入真实的李氏宗族演示数据，浏览6代12人的完整族谱树，查看人物传记和家族历史。</p>
        </div>
        <div class="flow-arrow">&#8594;</div>
        <div class="flow-step">
          <div class="step-number">3</div>
          <div class="step-icon">&#10024;</div>
          <h3>探索全部功能</h3>
          <p>自由探索时光长廊、寻亲广场、Excel导入、族谱打印等全部核心功能。</p>
        </div>
      </div>
      <div class="flow-cta">
        <el-button
          type="primary"
          size="large"
          class="btn-demo-hero"
          @click="openDemoModal"
        >
          <span class="btn-icon">&#9654;</span>
          开始体验
        </el-button>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta-section">
      <div class="cta-content">
        <h2>准备好开启寻根之旅了吗？</h2>
        <p>让每一支血脉都被铭记</p>
        <div class="cta-buttons">
          <el-button
            type="primary"
            size="large"
            class="btn-demo-hero"
            @click="openDemoModal"
          >
            <span class="btn-icon">&#9654;</span>
            一键体验演示
          </el-button>
          <el-button size="large" class="btn-outline-light" @click="goRegister">
            创建我的家族
          </el-button>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="logo-icon">寻</span>
          <span class="logo-text">寻根路 · xungenlu.cn</span>
        </div>
        <div class="footer-links">
          <a href="#features">核心功能</a>
          <a href="#demo">演示流程</a>
          <a href="#" @click.prevent="router.push('/login')">登录</a>
          <a href="#" @click.prevent="goRegister">注册</a>
        </div>
        <div class="footer-legal">
          <a href="/privacy" target="_blank">隐私政策</a>
          <span class="legal-divider">|</span>
          <a href="/terms" target="_blank">用户协议</a>
          <span class="legal-divider">|</span>
          <a href="/service-terms" target="_blank">服务条款</a>
          <span class="legal-divider">|</span>
          <a href="/cookie-policy" target="_blank">Cookie 政策</a>
        </div>
        <div class="footer-copy">
          &copy; {{ currentYear }} 寻根路 · xungenlu.cn. All rights reserved.
        </div>
      </div>
    </footer>

    <!-- 演示账号一键登录弹窗（PC 居中 Modal + 移动端底部 Drawer 内部自动切换） -->
    <DemoRoleModal v-model:visible="demoModalVisible" @success="onDemoLoginSuccess" />
  </div>
</template>

<style scoped>
.landing-page {
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  color: #2c3e50;
  background: #1e1c22;
  overflow-x: hidden;
}

/* ====== 导航栏 ====== */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 16px 0;
  transition: all 0.3s ease;
}
.navbar.scrolled {
  background: rgba(30, 28, 34, 0.9);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
  padding: 10px 0;
}
.nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #C9A96E, #A08050);
  color: #1e1c22;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
}
.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-outline {
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border-radius: 8px;
  padding: 8px 20px;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-outline:hover {
  border-color: #C9A96E;
  color: #C9A96E;
  background: rgba(201, 169, 110, 0.08);
}
.btn-demo-nav {
  background: linear-gradient(135deg, #C9A96E, #A08050);
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-weight: 600;
  font-size: 14px;
  color: #1e1c22;
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-demo-nav:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(201, 169, 110, 0.35);
}

.btn-admin-nav {
  border: 1.5px solid #E6A23C;
  color: #E6A23C;
  background: transparent;
  border-radius: 8px;
  padding: 10px 24px;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-admin-nav:hover {
  background: rgba(230, 162, 60, 0.1);
  color: #E6A23C;
}

/* ====== Hero ====== */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.hero-canvas-container {
  position: absolute;
  inset: 0;
  background: #1e1c22;
}
.hero-overlay {
  position: relative;
  z-index: 5;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 24px 80px;
  background: linear-gradient(
    180deg,
    rgba(30, 28, 34, 0.3) 0%,
    rgba(30, 28, 34, 0.15) 40%,
    rgba(30, 28, 34, 0.3) 70%,
    rgba(30, 28, 34, 0.6) 100%
  );
  transition: background 0.5s;
}
.hero-overlay.overlay-scrolled {
  background: linear-gradient(
    180deg,
    rgba(30, 28, 34, 0.6) 0%,
    rgba(30, 28, 34, 0.3) 50%,
    rgba(30, 28, 34, 0.7) 100%
  );
}
.hero-content {
  text-align: center;
  max-width: 700px;
}
.hero-tag {
  display: inline-block;
  background: rgba(201, 169, 110, 0.15);
  color: #C9A96E;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 24px;
  letter-spacing: 1px;
  border: 1px solid rgba(201, 169, 110, 0.2);
}
.hero-title {
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 800;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.95);
  margin: 0 0 16px;
}
.hero-highlight {
  background: linear-gradient(135deg, #C9A96E, #E8D5A3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-desc {
  font-size: 17px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 32px;
}
.hero-search {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}
.hero-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.btn-demo-hero {
  background: linear-gradient(135deg, #C9A96E, #A08050);
  border: none;
  border-radius: 12px;
  padding: 16px 40px;
  font-size: 18px;
  font-weight: 700;
  color: #1e1c22;
  transition: all 0.3s;
  box-shadow: 0 6px 25px rgba(201, 169, 110, 0.25);
  letter-spacing: 0.5px;
}
.btn-demo-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 35px rgba(201, 169, 110, 0.35);
}
.btn-demo-hero:active {
  transform: translateY(0);
}
.btn-icon {
  margin-right: 6px;
  font-size: 14px;
}
.hero-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
}

/* ====== About ====== */
.about-section {
  padding: 100px 24px;
  max-width: 1200px;
  margin: 0 auto;
  background: #faf8f5;
}
.about-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}
.about-card {
  background: white;
  border-radius: 16px;
  padding: 36px 32px;
  text-align: center;
  border: 1px solid #f1f5f9;
  transition: transform 0.3s, box-shadow 0.3s;
}
.about-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
}
.about-icon {
  margin-bottom: 20px;
}
.about-card h3 {
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 12px;
}
.about-card p {
  font-size: 14px;
  line-height: 1.7;
  color: #5a6a7a;
  margin: 0;
}

/* ====== Section Header ====== */
.section-header {
  text-align: center;
  margin-bottom: 56px;
}
.section-header h2 {
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 12px;
}
.section-header p {
  font-size: 16px;
  color: #5a6a7a;
  margin: 0;
}

/* ====== Features ====== */
.features {
  padding: 100px 24px;
  max-width: 1200px;
  margin: 0 auto;
  background: #faf8f5;
}
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px;
}
.feature-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  transition: transform 0.3s, box-shadow 0.3s;
  border: 1px solid #f1f5f9;
}
.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
}
.feature-icon {
  font-size: 40px;
  margin-bottom: 16px;
}
.feature-card h3 {
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 12px;
}
.feature-card > p {
  font-size: 14px;
  line-height: 1.7;
  color: #5a6a7a;
  margin: 0 0 16px;
}
.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.feature-list li {
  font-size: 12px;
  color: #5D4037;
  background: rgba(93, 64, 55, 0.06);
  padding: 4px 12px;
  border-radius: 12px;
}

/* ====== Demo Flow ====== */
.demo-flow {
  padding: 80px 24px 100px;
  background: linear-gradient(180deg, #faf8f5, #f5f0eb);
}
.flow-steps {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto 48px;
  flex-wrap: nowrap;
}
.flow-step {
  background: white;
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  flex: 1 1 0;
  min-width: 0;
  max-width: 360px;
  position: relative;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.step-number {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #C9A96E, #A08050);
  color: #1e1c22;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-icon {
  font-size: 48px;
  margin: 12px 0 16px;
}
.flow-step h3 {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 8px;
}
.flow-step p {
  font-size: 14px;
  color: #5a6a7a;
  line-height: 1.6;
  margin: 0;
}
.flow-arrow {
  font-size: 28px;
  color: #c4b5a5;
  align-self: center;
  padding-bottom: 20px;
}
.flow-cta {
  text-align: center;
}

/* ====== CTA ====== */
.cta-section {
  padding: 80px 24px;
  background: linear-gradient(135deg, #2c2a30, #1e1c22);
}
.cta-content {
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}
.cta-content h2 {
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 700;
  color: white;
  margin: 0 0 12px;
}
.cta-content p {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 32px;
}
.cta-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-outline-light {
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border-radius: 12px;
  padding: 14px 32px;
  font-weight: 600;
  transition: all 0.2s;
}
.btn-outline-light:hover {
  border-color: #C9A96E;
  color: #C9A96E;
  background: rgba(201, 169, 110, 0.08);
}

/* ====== Footer ====== */
.footer {
  padding: 48px 24px 32px;
  background: #141318;
  color: rgba(255, 255, 255, 0.5);
}
.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.footer-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-brand .logo-icon {
  width: 32px;
  height: 32px;
  font-size: 16px;
}
.footer-brand .logo-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
}
.footer-links {
  display: flex;
  gap: 24px;
}
.footer-links a {
  color: rgba(255, 255, 255, 0.4);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
  cursor: pointer;
}
.footer-links a:hover {
  color: #C9A96E;
}
.footer-legal {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 12px;
}
.footer-legal a {
  color: rgba(255, 255, 255, 0.35);
  text-decoration: none;
  font-size: 12px;
  transition: color 0.2s;
}
.footer-legal a:hover {
  color: rgba(255, 255, 255, 0.7);
}
.legal-divider {
  color: rgba(255, 255, 255, 0.15);
  font-size: 12px;
}
.footer-copy {
  font-size: 13px;
  width: 100%;
  text-align: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ====== Responsive ====== */
@media (max-width: 1024px) {
  .flow-steps {
    flex-wrap: wrap;
  }
  .flow-step {
    flex: 1 1 calc(50% - 12px);
    max-width: calc(50% - 12px);
  }
  .flow-arrow {
    display: none;
  }
}
@media (max-width: 768px) {
  .nav-actions .btn-outline {
    display: none;
  }
  .about-grid {
    grid-template-columns: 1fr;
  }
  .feature-grid {
    grid-template-columns: 1fr;
  }
  .flow-steps {
    flex-direction: column;
    align-items: center;
  }
  .flow-arrow {
    display: block;
    transform: rotate(90deg);
    padding: 0;
  }
  .flow-step {
    flex: 1 1 100%;
    max-width: 100%;
  }
  .hero {
    padding: 100px 16px 60px;
  }
  .hero-title {
    font-size: 30px;
  }
  .footer-inner {
    flex-direction: column;
    text-align: center;
  }
}
</style>
