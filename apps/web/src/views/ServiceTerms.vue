<template>
  <LegalPageLayout>
    <div class="service-terms">
    <div class="legal-header">
      <div class="header-content">
        <el-button class="btn-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回首页
        </el-button>
        <h1>服务条款</h1>
        <p class="update-date">最后更新日期：2026年6月21日</p>
      </div>
    </div>

    <div class="legal-content">
      <section>
        <h2>1. 服务概述</h2>
        <p>寻根路（xungenlu.cn）是一个专注于家族文化传承的数字化平台，为global华人家庭提供一站式家谱数字化解决方案。本服务条款详细说明了我们提供的服务内容、使用规则和相关权利义务。</p>
      </section>

      <section>
        <h2>2. 服务可用性</h2>
        <h3>2.1 服务时间</h3>
        <p>我们努力提供7×24小时不间断服务，但以下情况可能导致服务中断：</p>
        <ul>
          <li>定期系统维护和升级（我们会提前公告）</li>
          <li>不可抗力因素（自然灾害、网络攻击等）</li>
          <li>第三方服务故障（电信运营商、云服务商等）</li>
          <li>政府行为或法律法规要求</li>
        </ul>

        <h3>2.2 服务改进</h3>
        <p>我们持续优化产品功能和用户体验，可能随时增加、修改或删除功能。重大功能变更会尽可能提前通知用户。</p>
      </section>

      <section>
        <h2>3. 账户与权限</h2>
        <h3>3.1 账户类型</h3>
        <ul>
          <li><strong>演示账户：</strong>无需注册即可体验，数据在30天后自动清除</li>
          <li><strong>普通用户：</strong>注册后可创建或加入家族</li>
          <li><strong>家族管理员（ADMIN）：</strong>管理家族设置、成员权限</li>
          <li><strong>家族所有者（OWNER）：</strong>拥有家族最高管理权限</li>
        </ul>

        <h3>3.2 权限管理</h3>
        <p>家族管理员可根据需要为成员分配不同权限级别，包括：</p>
        <ul>
          <li>查看族谱数据</li>
          <li>编辑族谱信息</li>
          <li>管理家族成员</li>
          <li>审核上传内容</li>
          <li>财务管理等</li>
        </ul>
      </section>

      <section>
        <h2>4. 数据管理</h2>
        <h3>4.1 数据存储</h3>
        <ul>
          <li>您的数据存储在中国境内的安全服务器上</li>
          <li>我们采用多重备份机制保障数据安全</li>
          <li>敏感信息加密存储</li>
        </ul>

        <h3>4.2 数据导入导出</h3>
        <ul>
          <li>支持Excel格式批量导入族谱数据</li>
          <li>支持导出族谱数据（格式包括Excel、GEDCOM等）</li>
          <li>导入数据需符合我们的格式规范</li>
        </ul>

        <h3>4.3 数据删除</h3>
        <p>您可以随时删除自己上传的内容。账户注销后，我们将在30天内删除或匿名化您的个人数据，但以下情况除外：</p>
        <ul>
          <li>法律法规要求保留的数据</li>
          <li>与其他用户共享且对方仍需使用的数据（将匿名化处理）</li>
          <li>涉及纠纷调查的数据</li>
        </ul>
      </section>

      <section>
        <h2>5. 内容规范</h2>
        <h3>5.1 允许的内容</h3>
        <ul>
          <li>家族历史资料和族谱信息</li>
          <li>家族成员照片和影像资料</li>
          <li>生平传记和家族故事</li>
          <li>其他与家族文化传承相关的内容</li>
        </ul>

        <h3>5.2 禁止的内容</h3>
        <ul>
          <li>违反法律法规的内容</li>
          <li>侵犯他人知识产权、隐私权的内容</li>
          <li>虚假、误导性信息</li>
          <li>淫秽、暴力、仇恨言论</li>
          <li>商业广告或垃圾信息</li>
          <li>恶意软件或有害代码</li>
        </ul>

        <h3>5.3 内容审核</h3>
        <p>为维护平台健康环境，我们可能审核用户上传的内容。如发现违规内容，我们有权删除并要求用户改正。严重违规者可能被暂停或终止服务。</p>
      </section>

      <section>
        <h2>6. 家族协作</h2>
        <h3>6.1 家族小组</h3>
        <ul>
          <li>每个家族可创建独立的家族小组</li>
          <li>家族成员可在小组内共享信息和讨论</li>
          <li>管理员可设置加入条件（如邀请制、审核制）</li>
        </ul>

        <h3>6.2 寻亲归宗</h3>
        <ul>
          <li>平台提供智能匹配功能帮助失散支系找到根源</li>
          <li>用户可发布寻亲帖或响应他人的寻亲请求</li>
          <li>归宗合并需双方家族管理员确认</li>
        </ul>

        <h3>6.3 隐私保护</h3>
        <p>在世人员的详细信息默认对其他用户隐藏，除非：</p>
        <ul>
          <li>您主动设置为可见</li>
          <li>对方通过亲属验证</li>
          <li>同为家族小组成员且被授权查看</li>
        </ul>
      </section>

      <section>
        <h2>7. 增值服务</h2>
        <h3>7.1 免费功能</h3>
        <ul>
          <li>创建和管理一个家族</li>
          <li>基础族谱编辑和浏览</li>
          <li>有限存储空间（具体以页面标注为准）</li>
          <li>基础寻亲功能</li>
        </ul>

        <h3>7.2 付费功能</h3>
        <ul>
          <li>扩展存储空间</li>
          <li>高级数据分析报告</li>
          <li>族谱印刷服务</li>
          <li>优先客服支持</li>
          <li>其他增值功能</li>
        </ul>
        <p>具体价格和套餐以官网公布为准，我们保留调整价格的权利。</p>
      </section>

      <section>
        <h2>8. 印刷服务</h2>
        <p>我们提供族谱印刷服务，具体条款如下：</p>
        <ul>
          <li>支持多种装订规格（经典宣纸、现代精装、简约风格）</li>
          <li>印刷前提供PDF在线预览确认</li>
          <li>下单后7-15个工作日内发货</li>
          <li>质量问题支持退换货</li>
          <li>具体价格、规格和配送范围以订单页面为准</li>
        </ul>
      </section>

      <section>
        <h2>9. 知识产权</h2>
        <p>寻根路平台的所有知识产权（包括但不限于商标、软件代码、界面设计、文档）归我们所有。用户保留对其上传内容的知识产权，但授权我们为提供服务而使用。未经授权，不得将平台内容用于商业目的。</p>
      </section>

      <section>
        <h2>10. 责任限制</h2>
        <p>在法律允许的最大范围内，我们对以下情况不承担责任：</p>
        <ul>
          <li>因不可抗力导致的服务中断或数据丢失</li>
          <li>用户间因族谱信息产生的争议</li>
          <li>第三方服务故障造成的影响</li>
          <li>用户违反本协议造成的后果</li>
        </ul>
        <p>我们的总赔偿责任不超过您在过去12个月内实际支付的服务费用。</p>
      </section>

      <section>
        <h2>11. 条款变更</h2>
        <p>我们可能根据业务发展或法律法规变化修改本条款。重大变更会提前30天通过站内通知、短信或邮件告知。如您在变更后继续使用服务，即视为接受修改后的条款。</p>
      </section>

      <section>
        <h2>12. 联系我们</h2>
        <p>如果您对本条款有任何疑问或需要帮助，请通过以下方式联系我们：</p>
        <ul>
          <li>电子邮件：support@geneasphere.com</li>
          <li>客服电话：400-XXX-XXXX（工作日 9:00-18:00）</li>
          <li>在线客服：通过网站右下角客服入口</li>
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
