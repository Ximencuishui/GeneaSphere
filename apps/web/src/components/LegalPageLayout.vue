<template>
  <div class="legal-layout">
    <!-- ====== 顶部导航栏 ====== -->
    <header class="navbar">
      <div class="nav-inner">
        <a href="/" class="logo">
          <span class="logo-icon">根</span>
          <span class="logo-text">根脉云谱</span>
        </a>
        <nav class="nav-links">
          <a href="/">首页</a>
        </nav>
        <div class="nav-actions">
          <el-button class="btn-outline" @click="router.push('/register')">注册</el-button>
          <el-button class="btn-outline" @click="router.push('/login')">登录</el-button>
        </div>
      </div>
    </header>

    <!-- ====== 页面内容 ====== -->
    <main class="legal-main">
      <slot />
    </main>

    <!-- ====== 底部导航/页脚 ====== -->
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="logo-icon">根</span>
          <span class="logo-text">根脉云谱 GeneaSphere</span>
        </div>
        <div class="footer-links">
          <a href="/">首页</a>
          <a href="/#features">核心功能</a>
          <a href="/#demo">演示流程</a>
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
          &copy; {{ currentYear }} 根脉云谱 GeneaSphere. All rights reserved.
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.legal-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #fafbfc;
}

/* ====== 顶部导航栏 ====== */
.navbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.06);
  padding: 12px 0;
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
  text-decoration: none;
  cursor: pointer;
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
  flex-shrink: 0;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: #5D4037;
}

.nav-links {
  display: flex;
  gap: 32px;
}

.nav-links a {
  color: #5a6a7a;
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-links a:hover {
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

/* ====== 主内容区域 ====== */
.legal-main {
  flex: 1;
}

/* ====== 底部导航/页脚 ====== */
.footer {
  padding: 48px 24px 32px;
  background: #1a1a2e;
  color: rgba(255, 255, 255, 0.6);
  margin-top: auto;
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
@media (max-width: 768px) {
  .nav-links {
    display: none;
  }

  .nav-actions .btn-outline {
    display: none;
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
