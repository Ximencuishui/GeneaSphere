<template>
  <LegalPageLayout>
    <div class="cookie-policy">
    <div class="legal-header">
      <div class="header-content">
        <el-button class="btn-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回首页
        </el-button>
        <h1>Cookie 政策</h1>
        <p class="update-date">最后更新日期：2026年6月21日</p>
      </div>
    </div>

    <div class="legal-content">
      <section>
        <h2>1. 什么是 Cookie</h2>
        <p>Cookie 是网站存储在您设备上的小型文本文件，用于记录您的偏好设置、登录状态和其他浏览信息。Cookie 帮助我们提供更好的用户体验，使服务更加个性化和高效。</p>
        <p>除了 Cookie，我们可能使用类似技术（如本地存储、像素标签等），本政策统称为"Cookie"。</p>
      </section>

      <section>
        <h2>2. 我们使用的 Cookie 类型</h2>
        
        <h3>2.1 必要 Cookie</h3>
        <p>这些 Cookie 是服务正常运行所必需的，无法在系统中关闭：</p>
        <ul>
          <li><strong>身份验证 Cookie：</strong>记住您的登录状态，避免重复登录</li>
          <li><strong>安全 Cookie：</strong>检测异常登录行为，保护账户安全</li>
          <li><strong>会话 Cookie：</strong>维护您的浏览会话</li>
        </ul>
        <p><strong>法律依据：</strong>履行服务合同所必需</p>

        <h3>2.2 功能 Cookie</h3>
        <p>这些 Cookie 记住您的偏好设置，提供更个性化的体验：</p>
        <ul>
          <li><strong>语言偏好：</strong>记住您选择的界面语言</li>
          <li><strong>显示设置：</strong>记住您的界面主题、布局偏好</li>
          <li><strong>搜索历史：</strong>保存最近的搜索记录，方便快速访问</li>
        </ul>
        <p><strong>法律依据：</strong>您的同意（首次使用时会征求）</p>

        <h3>2.3 性能和分析 Cookie</h3>
        <p>这些 Cookie 帮助我们了解用户如何使用服务，以便持续改进：</p>
        <ul>
          <li><strong>访问统计：</strong>页面浏览量、访问时长、跳出率</li>
          <li><strong>功能使用：</strong>哪些功能最常用，哪些功能使用率低</li>
          <li><strong>错误日志：</strong>记录系统错误，帮助快速修复问题</li>
          <li><strong>性能监控：</strong>页面加载速度、响应时间</li>
        </ul>
        <p><strong>法律依据：</strong>您的同意（首次使用时会征求）</p>

        <h3>2.4 第三方 Cookie</h3>
        <p>我们可能使用第三方服务，这些服务可能设置自己的 Cookie：</p>
        <ul>
          <li><strong>云服务提供商：</strong>用于存储和CDN加速</li>
          <li><strong>分析工具：</strong>帮助我们分析用户行为（已匿名化）</li>
          <li><strong>客服系统：</strong>提供在线客户支持</li>
        </ul>
        <p>第三方 Cookie 的使用受其各自的隐私政策约束，我们建议阅读相关政策。</p>
      </section>

      <section>
        <h2>3. Cookie 的使用目的</h2>
        <p>我们使用 Cookie 用于以下目的：</p>
        <ul>
          <li><strong>身份验证：</strong>保持您的登录状态</li>
          <li><strong>安全防护：</strong>检测和防止欺诈行为</li>
          <li><strong>偏好记忆：</strong>记住您的设置和选择</li>
          <li><strong>性能优化：</strong>提升网站加载速度和响应性</li>
          <li><strong>数据分析：</strong>了解用户行为，改进产品和服务</li>
          <li><strong>功能实现：</strong>支持购物车、收藏夹等功能</li>
        </ul>
      </section>

      <section>
        <h2>4. Cookie 的存储期限</h2>
        <p>不同类型的 Cookie 存储期限不同：</p>
        <ul>
          <li><strong>会话 Cookie：</strong>关闭浏览器后自动删除</li>
          <li><strong>持久 Cookie：</strong>存储30天至2年不等，具体取决于用途</li>
          <li><strong>必要 Cookie：</strong>根据服务需要可能长期存储</li>
        </ul>
      </section>

      <section>
        <h2>5. 如何管理 Cookie</h2>
        
        <h3>5.1 浏览器设置</h3>
        <p>大多数浏览器允许您控制和管理 Cookie 设置：</p>
        <ul>
          <li><strong>查看 Cookie：</strong>在浏览器设置中查看已存储的 Cookie</li>
          <li><strong>删除 Cookie：</strong>可手动删除特定或所有 Cookie</li>
          <li><strong>阻止 Cookie：</strong>可设置阻止所有或部分网站的 Cookie</li>
          <li><strong>隐私模式：</strong>使用无痕/隐私模式浏览，关闭后自动清除</li>
        </ul>

        <h3>5.2 常见浏览器操作指南</h3>
        <ul>
          <li><strong>Chrome：</strong>设置 → 隐私和安全 → Cookie 及其他网站数据</li>
          <li><strong>Firefox：</strong>选项 → 隐私与安全 → Cookie 和网站数据</li>
          <li><strong>Safari：</strong>偏好设置 → 隐私 → Cookie 和网站数据</li>
          <li><strong>Edge：</strong>设置 → Cookie 和网站权限</li>
        </ul>

        <h3>5.3 注意事项</h3>
        <p>请注意，阻止或删除某些 Cookie 可能导致：</p>
        <ul>
          <li>需要频繁重新登录</li>
          <li>偏好设置无法保存</li>
          <li>部分功能无法正常使用</li>
          <li>网站加载速度可能变慢</li>
        </ul>
      </section>

      <section>
        <h2>6. 数据保护</h2>
        <p>我们通过 Cookie 收集的信息受到严格保护：</p>
        <ul>
          <li>传输过程使用加密技术（HTTPS/TLS）</li>
          <li>不存储敏感个人信息（如密码、支付信息）</li>
          <li>分析数据经过匿名化处理</li>
          <li>定期审查和清理过期 Cookie</li>
        </ul>
      </section>

      <section>
        <h2>7. 征得同意</h2>
        <p>首次访问我们的网站时，会通过 Cookie 横幅征求您对非必需 Cookie 的同意。您可以：</p>
        <ul>
          <li><strong>接受所有 Cookie：</strong>获得最佳使用体验</li>
          <li><strong>自定义设置：</strong>选择接受哪些类型的 Cookie</li>
          <li><strong>仅接受必要 Cookie：</strong>基础功能可用，但体验可能受限</li>
        </ul>
        <p>您随时可以在浏览器设置中更改您的 Cookie 偏好。</p>
      </section>

      <section>
        <h2>8. 政策更新</h2>
        <p>我们可能根据技术发展、业务变化或法律法规要求更新本政策。重大变更时，我们会通过站内通知或邮件等方式告知您。建议您定期查看本政策以了解最新信息。</p>
      </section>

      <section>
        <h2>9. 联系我们</h2>
        <p>如果您对本 Cookie 政策有任何疑问或希望行使您的数据权利，请通过以下方式联系我们：</p>
        <ul>
          <li>电子邮件：privacy@geneasphere.com</li>
          <li>客服电话：400-XXX-XXXX（工作日 9:00-18:00）</li>
          <li>联系地址：[公司地址]</li>
        </ul>
        <p>我们将在收到您的请求后15个工作日内予以回复。</p>
      </section>
    </div>
  </div>
  </LegalPageLayout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import LegalPageLayout from '@/components/LegalPageLayout.vue'

const router = useRouter()

const goBack = () => {
  router.push('/')
}
</script>

<style scoped>
.legal-header {
  background: linear-gradient(135deg, #3E2723, #5D4037);
  padding: 100px 24px 60px;
  color: white;
}

.header-content {
  max-width: 900px;
  margin: 0 auto;
}

.btn-back {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  margin-bottom: 24px;
  transition: all 0.2s;
}

.btn-back:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
}

.legal-header h1 {
  font-size: clamp(32px, 5vw, 42px);
  font-weight: 700;
  margin: 0 0 12px;
}

.update-date {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.legal-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 60px 24px;
}

.legal-content section {
  background: white;
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.legal-content h2 {
  font-size: 22px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #5D4037;
}

.legal-content h3 {
  font-size: 17px;
  font-weight: 600;
  color: #3E2723;
  margin: 20px 0 12px;
}

.legal-content p {
  font-size: 15px;
  line-height: 1.8;
  color: #5a6a7a;
  margin: 0 0 12px;
}

.legal-content ul {
  margin: 12px 0;
  padding-left: 24px;
}

.legal-content li {
  font-size: 15px;
  line-height: 1.8;
  color: #5a6a7a;
  margin-bottom: 8px;
}

.legal-content li strong {
  color: #2c3e50;
}

@media (max-width: 768px) {
  .legal-header {
    padding: 90px 16px 40px;
  }

  .legal-content {
    padding: 40px 16px;
  }

  .legal-content section {
    padding: 24px 20px;
  }

  .legal-content h2 {
    font-size: 20px;
  }

  .legal-content h3 {
    font-size: 16px;
  }

  .legal-content p,
  .legal-content li {
    font-size: 14px;
  }
}
</style>
