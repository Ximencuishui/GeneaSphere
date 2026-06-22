<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

const router = useRouter()
const authStore = useAuthStore()
const demoLoading = ref(false)
const scrollY = ref(0)
const currentYear = new Date().getFullYear()

// 视差滚动效果
const handleScroll = () => {
  scrollY.value = window.scrollY
}
onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))

// 一键演示登录
const handleDemoLogin = async () => {
  demoLoading.value = true
  try {
    const response = await axios.post('/api/auth/demo-login')
    const { access_token, demoClanId } = response.data

    // 存储 token
    localStorage.setItem('geneasphere_token', access_token)
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + access_token

    // 更新 auth store
    authStore.token = access_token
    authStore.user = {
      sub: response.data.user.id,
      phone: response.data.user.phone,
      role: 'OWNER',
    }

    ElMessage.success('欢迎体验寻根路！')

    // 引导到最能展示核心卖点的页面：族谱树
    if (demoClanId) {
      router.push(`/tree/${demoClanId}`)
    } else {
      router.push('/clans')
    }
  } catch (error: any) {
    const msg = error.response?.data?.message || '演示服务暂不可用，请稍后再试'
    ElMessage.error(msg)
  } finally {
    demoLoading.value = false
  }
}

// 跳转注册
const goRegister = () => router.push('/register')
</script>

<template>
  <div class="landing-page">
    <!-- ====== 导航栏 ====== -->
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
            :loading="demoLoading"
            @click="handleDemoLogin"
          >
            立即体验
          </el-button>
        </div>
      </div>
    </header>

    <!-- ====== Hero 区域 ====== -->
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <div class="hero-tag">新一代家谱数字化平台</div>
        <h1 class="hero-title">
          让每一支血脉<br />
          <span class="hero-highlight">都被铭记</span>
        </h1>
        <p class="hero-desc">
          可视化族谱树 · 智能寻亲归宗 · 隐私安全守护 · 云端永续传承<br />
          为全球华人家庭提供一站式家谱数字化解决方案
        </p>
        <div class="hero-cta">
          <el-button
            type="primary"
            size="large"
            class="btn-demo-hero"
            :loading="demoLoading"
            @click="handleDemoLogin"
          >
            <span class="btn-icon">▶</span>
            一键体验演示账号
          </el-button>
          <span class="hero-hint">无需注册，即刻体验完整功能</span>
        </div>
        <div class="hero-stats">
          <div class="stat-item">
            <span class="stat-number">12</span>
            <span class="stat-label">位演示族人</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number">6</span>
            <span class="stat-label">代家族传承</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-number">100+</span>
            <span class="stat-label">年历史跨度</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ====== 核心卖点 ====== -->
    <section class="features" id="features">
      <div class="section-header">
        <h2>为什么选择寻根路</h2>
        <p>专为家族文化传承打造的全链路数字化工具</p>
      </div>

      <div class="feature-grid">
        <div class="feature-card">
          <div class="feature-icon">🌳</div>
          <h3>可视化族谱树</h3>
          <p>交互式族谱树状图，支持缩放、拖拽、点击查看详情。直观展示家族世代传承脉络，让复杂的家族关系一目了然。</p>
          <ul class="feature-list">
            <li>多代同屏展示</li>
            <li>节点详情面板</li>
            <li>关系图谱浏览</li>
          </ul>
        </div>

        <div class="feature-card">
          <div class="feature-icon">🔍</div>
          <h3>智能寻亲归宗</h3>
          <p>基于字辈、祖籍地、关键祖先等信息的智能匹配算法，帮助失散支系找到根源，实现家族团圆。</p>
          <ul class="feature-list">
            <li>自动信息比对</li>
            <li>匹配度评分</li>
            <li>安全归宗合并</li>
          </ul>
        </div>

        <div class="feature-card">
          <div class="feature-icon">🔒</div>
          <h3>隐私安全守护</h3>
          <p>精细化的权限控制体系，支持在世人员信息隐藏、亲属验证登录、游客访问限制等多层安全防护。</p>
          <ul class="feature-list">
            <li>四级角色权限</li>
            <li>亲属验证登录</li>
            <li>操作全程审计</li>
          </ul>
        </div>

        <div class="feature-card">
          <div class="feature-icon">📸</div>
          <h3>时光长廊</h3>
          <p>按年份组织的家族影像档案馆，支持照片上传、地点标记、人物关联。同村推荐功能发现更多家族故事。</p>
          <ul class="feature-list">
            <li>年份轴浏览</li>
            <li>智能标签分类</li>
            <li>同村照片发现</li>
          </ul>
        </div>

        <div class="feature-card">
          <div class="feature-icon">📥</div>
          <h3>Excel 一键导入</h3>
          <p>支持从 Excel 表格批量导入族谱数据，智能列映射自动识别字段，大幅降低数据录入门槛。</p>
          <ul class="feature-list">
            <li>拖拽上传文件</li>
            <li>智能列映射</li>
            <li>错误自动校验</li>
          </ul>
        </div>

        <div class="feature-card">
          <div class="feature-icon">🖨️</div>
          <h3>族谱印刷服务</h3>
          <p>支持在线预览和下单族谱印刷，多种装订规格可选。经典宣纸、现代精装、简约风格满足不同需求。</p>
          <ul class="feature-list">
            <li>PDF 在线预览</li>
            <li>多规格可选</li>
            <li>订单全程跟踪</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ====== 演示流程 ====== -->
    <section class="demo-flow" id="demo">
      <div class="section-header">
        <h2>3 步体验完整功能</h2>
        <p>无需注册、无需下载，即刻开始您的家族数字化之旅</p>
      </div>

      <div class="flow-steps">
        <div class="flow-step">
          <div class="step-number">1</div>
          <div class="step-icon">👆</div>
          <h3>点击"一键体验"</h3>
          <p>点击任意页面上的"一键体验演示账号"按钮，系统自动为您创建临时体验环境。</p>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="step-number">2</div>
          <div class="step-icon">🌳</div>
          <h3>浏览演示族谱</h3>
          <p>进入真实的李氏宗族演示数据，浏览6代12人的完整族谱树，查看人物传记和家族历史。</p>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="step-number">3</div>
          <div class="step-icon">✨</div>
          <h3>探索全部功能</h3>
          <p>自由探索时光长廊、寻亲广场、Excel导入、族谱打印等全部核心功能，完整体验项目价值。</p>
        </div>
      </div>

      <div class="flow-cta">
        <el-button
          type="primary"
          size="large"
          class="btn-demo-hero"
          :loading="demoLoading"
          @click="handleDemoLogin"
        >
          <span class="btn-icon">▶</span>
          开始体验
        </el-button>
      </div>
    </section>

    <!-- ====== 底部 CTA ====== -->
    <section class="cta-section">
      <div class="cta-content">
        <h2>准备好开启家族数字化之旅了吗？</h2>
        <p>立即体验寻根路，让家族记忆永续传承</p>
        <div class="cta-buttons">
          <el-button
            type="primary"
            size="large"
            class="btn-demo-hero"
            :loading="demoLoading"
            @click="handleDemoLogin"
          >
            <span class="btn-icon">▶</span>
            一键体验演示
          </el-button>
          <el-button size="large" class="btn-outline-light" @click="goRegister">
            创建我的家族
          </el-button>
        </div>
      </div>
    </section>

    <!-- ====== 页脚 ====== -->
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
  </div>
</template>

<style scoped>
/* ====== 全局重置 ====== */
.landing-page {
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  color: #2c3e50;
  background: #fafbfc;
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
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.06);
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
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  color: white;
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
  color: #5D4037;
}
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-outline {
  border: 1.5px solid #5D4037;
  color: #5D4037;
  background: transparent;
  border-radius: 8px;
  padding: 8px 20px;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-outline:hover {
  background: #5D4037;
  color: white;
}
.btn-demo-nav {
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-weight: 600;
  font-size: 14px;
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-demo-nav:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(93, 64, 55, 0.35);
}

/* ====== Hero ====== */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 120px 24px 80px;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 30%, rgba(141, 110, 99, 0.08), transparent),
    radial-gradient(ellipse 60% 50% at 80% 70%, rgba(93, 64, 55, 0.05), transparent),
    linear-gradient(180deg, #fdfbf9 0%, #f5f0eb 50%, #fafbfc 100%);
}
.hero-content {
  position: relative;
  text-align: center;
  max-width: 800px;
}
.hero-tag {
  display: inline-block;
  background: rgba(93, 64, 55, 0.08);
  color: #5D4037;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 24px;
  letter-spacing: 1px;
}
.hero-title {
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 800;
  line-height: 1.25;
  color: #2c3e50;
  margin: 0 0 20px;
}
.hero-highlight {
  background: linear-gradient(135deg, #5D4037, #A1887F);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-desc {
  font-size: 17px;
  line-height: 1.8;
  color: #5a6a7a;
  margin: 0 0 40px;
}
.hero-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}
.btn-demo-hero {
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  border: none;
  border-radius: 12px;
  padding: 16px 40px;
  font-size: 18px;
  font-weight: 700;
  color: white;
  transition: all 0.3s;
  box-shadow: 0 6px 25px rgba(93, 64, 55, 0.3);
  letter-spacing: 0.5px;
}
.btn-demo-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 35px rgba(93, 64, 55, 0.4);
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
  color: #94a3b8;
}
.hero-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 24px 40px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}
.stat-item {
  text-align: center;
}
.stat-number {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #5D4037;
}
.stat-label {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 2px;
}
.stat-divider {
  width: 1px;
  height: 40px;
  background: #e2e8f0;
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
  background: linear-gradient(180deg, #fdfbf9, #f5f0eb);
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
  background: linear-gradient(135deg, #5D4037, #8D6E63);
  color: white;
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

/* ====== CTA Section ====== */
.cta-section {
  padding: 80px 24px;
  background: linear-gradient(135deg, #3E2723, #5D4037);
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
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 32px;
}
.cta-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-outline-light {
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  color: white;
  background: transparent;
  border-radius: 12px;
  padding: 14px 32px;
  font-weight: 600;
  transition: all 0.2s;
}
.btn-outline-light:hover {
  border-color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* ====== Footer ====== */
.footer {
  padding: 48px 24px 32px;
  background: #1a1a2e;
  color: rgba(255, 255, 255, 0.6);
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
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
}
.footer-links {
  display: flex;
  gap: 24px;
}
.footer-links a {
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
  cursor: pointer;
}
.footer-links a:hover {
  color: white;
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
  color: rgba(255, 255, 255, 0.45);
  text-decoration: none;
  font-size: 12px;
  transition: color 0.2s;
}
.footer-legal a:hover {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline;
}
.legal-divider {
  color: rgba(255, 255, 255, 0.2);
  font-size: 12px;
}
.footer-copy {
  font-size: 13px;
  width: 100%;
  text-align: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* ====== 响应式 ====== */
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
  .hero-stats {
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px;
  }
  .stat-divider {
    width: 60px;
    height: 1px;
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
  .footer-legal {
    gap: 8px;
  }
  .footer-legal a {
    font-size: 11px;
  }
}
</style>
