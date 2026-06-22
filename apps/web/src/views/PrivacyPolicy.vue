<template>
  <LegalPageLayout>
    <div class="privacy-policy">
    <div class="legal-header">
      <div class="header-content">
        <el-button class="btn-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回首页
        </el-button>
        <h1>隐私政策</h1>
        <p class="update-date">最后更新日期：2026年6月21日</p>
      </div>
    </div>

    <div class="legal-content">
      <section>
        <h2>1. 引言</h2>
        <p>欢迎使用寻根路（xungenlu.cn）。我们深知家族信息的敏感性和重要性，因此致力于保护您和您家人的个人信息安全。本隐私政策详细说明了我们如何收集、使用、存储和保护您的个人信息。</p>
        <p>使用我们的服务即表示您同意本隐私政策中描述的做法。如果您不同意本政策的任何内容，请立即停止使用我们的服务。</p>
      </section>

      <section>
        <h2>2. 我们收集的信息</h2>
        <h3>2.1 您主动提供的信息</h3>
        <ul>
          <li><strong>账户信息：</strong>手机号码、姓名、密码等注册所需信息</li>
          <li><strong>家族信息：</strong>族谱数据、家族成员信息、字辈、祖籍地等</li>
          <li><strong>个人内容：</strong>上传的照片、音频文件、生平传记、家族故事等</li>
          <li><strong>沟通信息：</strong>您与客服或其他用户的沟通记录</li>
        </ul>

        <h3>2.2 自动收集的信息</h3>
        <ul>
          <li><strong>设备信息：</strong>设备类型、操作系统、浏览器类型和版本</li>
          <li><strong>使用数据：</strong>访问日志、功能使用情况、操作记录</li>
          <li><strong>位置信息：</strong>基于IP地址的粗略地理位置（用于提供同村推荐等功能）</li>
        </ul>
      </section>

      <section>
        <h2>3. 信息使用方式</h2>
        <p>我们收集的信息将用于以下目的：</p>
        <ul>
          <li>提供、维护和改进我们的服务</li>
          <li>创建和管理您的家族族谱</li>
          <li>处理您的请求和提供客户支持</li>
          <li>发送服务相关的通知（如功能更新、安全提醒）</li>
          <li>检测和防止欺诈行为，保障平台安全</li>
          <li>遵守法律法规要求</li>
        </ul>
      </section>

      <section>
        <h2>4. 信息共享与披露</h2>
        <p>我们不会出售您的个人信息。仅在以下情况下，我们可能共享您的信息：</p>
        <ul>
          <li><strong>家族成员间：</strong>您所在的家族小组成员可查看族谱中的共享信息</li>
          <li><strong>服务提供商：</strong>与帮助我们运营服务的第三方（如云存储、短信服务），且受严格保密协议约束</li>
          <li><strong>法律要求：</strong>应法律法规要求或为保护我们及用户的合法权益</li>
          <li><strong>业务转让：</strong>在合并、收购或资产出售情况下，但会提前通知您</li>
        </ul>
      </section>

      <section>
        <h2>5. 数据安全</h2>
        <p>我们采取多层次的安全措施保护您的信息：</p>
        <ul>
          <li>传输层加密（HTTPS/TLS）保护数据传输</li>
          <li>敏感数据加密存储</li>
          <li>严格的访问控制和权限管理</li>
          <li>定期安全审计和漏洞扫描</li>
          <li>操作日志记录和异常行为监控</li>
        </ul>
      </section>

      <section>
        <h2>6. 您的权利</h2>
        <p>根据相关法律法规，您享有以下权利：</p>
        <ul>
          <li><strong>访问权：</strong>查看我们持有的您的个人信息</li>
          <li><strong>更正权：</strong>要求更正不准确的信息</li>
          <li><strong>删除权：</strong>在特定情况下要求删除您的个人信息</li>
          <li><strong>撤回同意：</strong>随时撤回您对信息处理的同意</li>
          <li><strong>注销账户：</strong>随时申请注销您的账户</li>
        </ul>
        <p>如需行使上述权利，请通过底部联系方式与我们联系。</p>
      </section>

      <section>
        <h2>7. 未成年人保护</h2>
        <p>我们非常重视未成年人的隐私保护。未满14周岁的未成年人使用我们的服务前，应在监护人同意和指导下进行。如我们发现在未获得监护人同意的情况下收集了未成年人信息，将尽快删除。</p>
      </section>

      <section>
        <h2>8. 数据存储与保留</h2>
        <p>您的家族数据将存储在中国境内的服务器上。我们会在您使用服务期间保留您的信息，账户注销后，我们将在合理期限内删除或匿名化您的个人信息，除非法律法规要求保留更长时间。</p>
      </section>

      <section>
        <h2>9. 第三方服务</h2>
        <p>我们的服务可能包含指向第三方网站或服务的链接。我们不对第三方的隐私行为负责，建议您在使用前阅读其隐私政策。</p>
      </section>

      <section>
        <h2>10. 政策更新</h2>
        <p>我们可能不时更新本隐私政策。重大变更时，我们会通过站内通知、短信或邮件等方式提前告知您。更新后的政策将在本页面上方标注最新更新日期。</p>
      </section>

      <section>
        <h2>11. 联系我们</h2>
        <p>如果您对本隐私政策有任何疑问、意见或建议，或希望行使您的数据权利，请通过以下方式联系我们：</p>
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
