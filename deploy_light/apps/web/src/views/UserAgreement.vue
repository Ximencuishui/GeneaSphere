<template>
  <LegalPageLayout>
    <div class="user-agreement">
    <div class="legal-header">
      <div class="header-content">
        <el-button class="btn-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回首页
        </el-button>
        <h1>用户协议</h1>
        <p class="update-date">最后更新日期：2026年6月21日</p>
      </div>
    </div>

    <div class="legal-content">
      <section>
        <h2>1. 协议接受</h2>
        <p>欢迎您使用寻根路（xungenlu.cn）服务。本协议是您与寻根路运营方之间关于使用本服务的法律协议。</p>
        <p><strong>请您仔细阅读本协议的全部内容。</strong>如果您不同意本协议的任何内容，请立即停止使用本服务。您注册、登录或使用本服务即表示您同意接受本协议的所有条款。</p>
      </section>

      <section>
        <h2>2. 服务说明</h2>
        <p>寻根路为用户提供以下服务：</p>
        <ul>
          <li>家族族谱的创建、编辑和管理</li>
          <li>可视化族谱树展示和浏览</li>
          <li>家族成员信息共享和协作</li>
          <li>时光长廊：家族影像资料管理</li>
          <li>智能寻亲和归宗合并功能</li>
          <li>Excel数据导入导出</li>
          <li>族谱印刷服务</li>
          <li>其他相关功能和服务</li>
        </ul>
        <p>我们保留随时修改、暂停或终止部分或全部服务的权利，但会尽可能提前通知用户。</p>
      </section>

      <section>
        <h2>3. 账户注册与管理</h2>
        <h3>3.1 账户注册</h3>
        <ul>
          <li>您需要提供真实、准确、完整的注册信息</li>
          <li>每个手机号码只能注册一个账户</li>
          <li>您应妥善保管账户凭证，不得将账户转让给他人使用</li>
        </ul>

        <h3>3.2 账户安全</h3>
        <ul>
          <li>您对账户下的一切行为承担全部责任</li>
          <li>如发现账户被未经授权使用的情况，请立即联系我们</li>
          <li>我们建议定期修改密码并妥善保管</li>
        </ul>

        <h3>3.3 账户注销</h3>
        <p>您可以随时申请注销账户。注销后，我们将在合理期限内删除或匿名化您的个人信息，但法律法规要求保留的信息除外。</p>
      </section>

      <section>
        <h2>4. 用户行为规范</h2>
        <h3>4.1 禁止行为</h3>
        <p>使用本服务时，您不得：</p>
        <ul>
          <li>上传、发布含有违法、淫秽、暴力、歧视性内容</li>
          <li>侵犯他人知识产权、隐私权或其他合法权益</li>
          <li>发布虚假信息或误导性内容</li>
          <li>利用服务从事诈骗、传销等非法活动</li>
          <li>干扰或破坏服务的正常运行</li>
          <li>使用自动化程序或脚本访问服务</li>
          <li>未经授权访问其他用户的数据</li>
          <li>其他违反法律法规或公序良俗的行为</li>
        </ul>

        <h3>4.2 违规处理</h3>
        <p>如发现您违反本协议，我们有权采取以下措施：</p>
        <ul>
          <li>删除违规内容</li>
          <li>暂停或限制账户功能</li>
          <li>暂停或终止服务</li>
          <li>保存证据并向有关部门报告</li>
        </ul>
      </section>

      <section>
        <h2>5. 知识产权</h2>
        <h3>5.1 平台知识产权</h3>
        <p>寻根路的商标、标识、软件代码、界面设计、文档等知识产权归我们所有。未经书面许可，您不得复制、修改、传播或用于商业目的。</p>

        <h3>5.2 用户内容授权</h3>
        <p>您上传的内容（族谱数据、照片、文字等）知识产权归您所有。但为了提供服务，您授予我们以下权利：</p>
        <ul>
          <li>存储、展示和传播您上传的内容</li>
          <li>为优化服务而进行必要的技术处理</li>
          <li>在家族小组内共享您设置为共享的内容</li>
        </ul>
        <p>您承诺对上传的内容拥有合法权利，不会侵犯第三方权益。</p>
      </section>

      <section>
        <h2>6. 隐私保护</h2>
        <p>我们重视您的隐私保护。关于如何收集、使用和保护您的个人信息，请参阅我们的<a href="/privacy" target="_blank">《隐私政策》</a>，该政策构成本协议的重要组成部分。</p>
      </section>

      <section>
        <h2>7. 免责声明</h2>
        <h3>7.1 服务"按现状"提供</h3>
        <p>本服务按"现状"和"可用性"提供，我们不保证服务不会中断、没有错误或完全安全。</p>

        <h3>7.2 用户内容责任</h3>
        <p>您对自己上传的内容承担全部责任。我们不预先审查用户内容，但保留审查和删除的权利。对于用户间的纠纷，我们可协助但不保证解决。</p>

        <h3>7.3 第三方服务</h3>
        <p>本服务可能包含第三方提供的功能或链接。我们不控制这些第三方服务，对其内容和行为不承担责任。</p>

        <h3>7.4 不可抗力</h3>
        <p>对于因自然灾害、网络攻击、政府行为等不可抗力因素导致的服务中断或数据损失，我们不承担责任，但会尽力减少损失。</p>
      </section>

      <section>
        <h2>8. 付费服务</h2>
        <p>部分高级功能可能需要付费使用：</p>
        <ul>
          <li>我们会明确标注免费和付费功能的范围</li>
          <li>付费前会明确告知价格、期限和退款政策</li>
          <li>付费服务的具体条款以订单页面显示为准</li>
          <li>我们保留调整价格的权利，但会提前通知</li>
        </ul>
      </section>

      <section>
        <h2>9. 协议变更</h2>
        <p>我们可能根据业务发展或法律法规变化修改本协议。重大变更时，我们会通过站内通知、短信或邮件等方式提前通知您。如您在变更后继续使用服务，即视为接受修改后的协议。</p>
      </section>

      <section>
        <h2>10. 服务终止</h2>
        <p>在以下情况下，我们可能终止向您提供服务：</p>
        <ul>
          <li>您主动注销账户</li>
          <li>您严重违反本协议</li>
          <li>我们停止运营本服务</li>
          <li>法律法规要求</li>
        </ul>
        <p>服务终止后，我们将按照隐私政策的规定处理您的数据。</p>
      </section>

      <section>
        <h2>11. 法律适用与争议解决</h2>
        <p>本协议的订立、执行和解释适用中华人民共和国法律。因本协议引起的任何争议，双方应友好协商解决；协商不成的，任何一方均可向我们所在地有管辖权的人民法院提起诉讼。</p>
      </section>

      <section>
        <h2>12. 联系方式</h2>
        <p>如果您对本协议有任何疑问或意见，请通过以下方式联系我们：</p>
        <ul>
          <li>电子邮件：legal@geneasphere.com</li>
          <li>客服电话：400-XXX-XXXX（工作日 9:00-18:00）</li>
          <li>联系地址：[公司地址]</li>
        </ul>
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

.legal-content a {
  color: #5D4037;
  text-decoration: underline;
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
