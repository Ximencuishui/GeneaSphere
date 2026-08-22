<script setup lang="ts">
/**
 * 家族公众号 - 公众号配置
 * - 展示当前公众号接入状态（基于能力开关 wechat）
 * - 配置家族级别的公众号绑定信息（AppId、白名单、菜单等）
 * - 仅 Owner/Admin 可见
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCapabilityStore } from '@/stores/capability'

const route = useRoute()
const capabilityStore = useCapabilityStore()

const clanSlug = ref('')
const loading = ref(false)
const saving = ref(false)
const statusLoading = ref(false)

const config = ref({
  app_id: '',
  app_secret_masked: '',
  token: '',
  encoding_aes_key: '',
  whitelisted_domains: '',
  follow_reply_type: 'TEXT' as 'TEXT' | 'IMAGE' | 'NEWS',
  follow_reply_content: '',
  default_menu_json: '',
  enabled: false,
})

const status = ref({
  configured: false,
  verified: false,
  last_verified_at: '',
  followers_count: 0,
  monthly_message_quota: 0,
  monthly_message_used: 0,
})

const isMockMode = computed(() => capabilityStore.isAvailable('wechat') === false)

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/wechat/config', {
      params: { clanSlug: clanSlug.value },
    })
    if (res.data?.config) config.value = { ...config.value, ...res.data.config }
    if (res.data?.status) status.value = { ...status.value, ...res.data.status }
  } catch (e: any) {
    if (e?.response?.status !== 404) {
      console.warn('加载公众号配置失败：', e?.response?.data?.message || e?.message)
    }
  } finally {
    loading.value = false
  }
}

const fetchStatus = async () => {
  statusLoading.value = true
  try {
    const res = await axios.get('/api/admin/wechat/status', {
      params: { clanSlug: clanSlug.value },
    })
    if (res.data) status.value = { ...status.value, ...res.data }
  } catch {
    // 忽略状态获取失败（能力未开启时属预期）
  } finally {
    statusLoading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    await axios.put('/api/admin/wechat/config', {
      clanSlug: clanSlug.value,
      config: {
        ...config.value,
        // 仅在用户显式输入新 secret 时覆盖后端掩码字段
        app_secret: config.value.app_secret_masked ? config.value.app_secret_masked : undefined,
      },
    })
    ElMessage.success('公众号配置已保存')
    await fetchConfig()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const handleVerify = async () => {
  try {
    await ElMessageBox.confirm(
      '将向微信接口发起一次连通性校验，未配置 AppId/AppSecret 时将失败。是否继续？',
      '连通性校验',
      { type: 'warning' },
    )
    verifying.value = true
    await axios.post('/api/admin/wechat/verify', { clanSlug: clanSlug.value })
    ElMessage.success('连通性校验通过')
    await fetchStatus()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.message || '校验失败')
    }
  } finally {
    verifying.value = false
  }
}

const verifying = ref(false)

const handleToggleEnabled = async (val: string | number | boolean) => {
  const next = Boolean(val)
  try {
    await axios.patch('/api/admin/wechat/config/enabled', {
      clanSlug: clanSlug.value,
      enabled: next,
    })
    config.value.enabled = next
    ElMessage.success(next ? '公众号已启用' : '公众号已停用')
  } catch (e: any) {
    config.value.enabled = !next
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

const replyTypeOptions = [
  { value: 'TEXT', label: '文本消息' },
  { value: 'IMAGE', label: '图片消息' },
  { value: 'NEWS', label: '图文消息' },
]

const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—')

onMounted(() => {
  clanSlug.value = (route.params.slug as string) || ''
  capabilityStore.refresh().catch(() => {})
  fetchConfig()
  fetchStatus()
})

watch(
  () => route.params.slug,
  (slug) => {
    clanSlug.value = (slug as string) || ''
    fetchConfig()
    fetchStatus()
  },
)
</script>

<template>
  <div class="wechat-config-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="page-header">
          <h2>公众号配置</h2>
          <ElTag v-if="isMockMode" type="warning" effect="light">
            当前为 Mock 模式
          </ElTag>
          <ElTag v-else type="success" effect="light">
            公众号能力已开通
          </ElTag>
        </div>
      </template>

      <ElAlert
        v-if="isMockMode"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 20px;"
      >
        <template #title>公众号能力尚未接入真实 Provider</template>
        配置项可保存，但消息推送、用户鉴权等动作会按 Mock 模式执行，不会真实下发到微信侧。
        接入真实 Provider 后，本页所有配置将自动生效。
      </ElAlert>

      <ElForm label-width="180px" class="config-form">
        <!-- 基础配置 -->
        <ElDivider content-position="left">基础配置</ElDivider>

        <ElFormItem label="启用公众号">
          <ElSwitch
            :model-value="config.enabled"
            @change="handleToggleEnabled"
          />
          <span class="form-hint">停用后，所有消息推送与菜单交互将进入"暂停"状态</span>
        </ElFormItem>

        <ElFormItem label="AppID">
          <ElInput v-model="config.app_id" placeholder="wxXXXXXXXXXXXXXXXX" maxlength="32" />
        </ElFormItem>

        <ElFormItem label="AppSecret">
          <ElInput
            v-model="config.app_secret_masked"
            type="password"
            show-password
            placeholder="留空表示不修改，保存后将以掩码回显"
            maxlength="64"
          />
        </ElFormItem>

        <ElFormItem label="Token">
          <ElInput v-model="config.token" placeholder="用于校验微信回调签名" maxlength="64" />
        </ElFormItem>

        <ElFormItem label="EncodingAESKey">
          <ElInput
            v-model="config.encoding_aes_key"
            placeholder="43 位字符，用于消息加解密（可选）"
            maxlength="64"
          />
        </ElFormItem>

        <ElFormItem label="业务域名白名单">
          <ElInput
            v-model="config.whitelisted_domains"
            type="textarea"
            :rows="3"
            placeholder="每行一个域名，例如：mp.example.com"
          />
          <span class="form-hint">配置后将允许公众号网页从这些域名回调</span>
        </ElFormItem>

        <!-- 关注回复 -->
        <ElDivider content-position="left">关注回复</ElDivider>

        <ElFormItem label="回复类型">
          <ElSelect v-model="config.follow_reply_type" style="width: 200px;">
            <ElOption
              v-for="opt in replyTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>

        <ElFormItem label="回复内容">
          <ElInput
            v-model="config.follow_reply_content"
            type="textarea"
            :rows="4"
            :placeholder="config.follow_reply_type === 'TEXT' ? '欢迎关注 XXX 家族公众号，回复【族谱】查看族谱…' : '请填写对应类型的内容（图片 URL / 图文素材 ID）'"
          />
        </ElFormItem>

        <!-- 自定义菜单 -->
        <ElDivider content-position="left">自定义菜单</ElDivider>

        <ElFormItem label="菜单 JSON">
          <ElInput
            v-model="config.default_menu_json"
            type="textarea"
            :rows="6"
            placeholder='{"button":[{"name":"族谱","sub_button":[...]}]}'
          />
          <span class="form-hint">
            请按微信公众号自定义菜单 JSON 格式填写，留空表示使用默认菜单
          </span>
        </ElFormItem>

        <div class="form-actions">
          <ElButton @click="fetchConfig">重置</ElButton>
          <ElButton type="primary" :loading="saving" @click="handleSave">
            保存配置
          </ElButton>
        </div>
      </ElForm>
    </ElCard>

    <!-- 运行状态 -->
    <ElCard v-loading="statusLoading" style="margin-top: 20px;">
      <template #header>
        <div class="page-header">
          <h3>运行状态</h3>
          <ElButton size="small" :loading="verifying" @click="handleVerify">
            连通性校验
          </ElButton>
        </div>
      </template>

      <ElDescriptions :column="2" border>
        <ElDescriptionsItem label="接入状态">
          <ElTag :type="status.verified ? 'success' : 'info'">
            {{ status.verified ? '已连通' : '未连通' }}
          </ElTag>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="配置状态">
          <ElTag :type="status.configured ? 'success' : 'warning'">
            {{ status.configured ? '已配置' : '未配置' }}
          </ElTag>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="最近校验时间">
          {{ formatDate(status.last_verified_at) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="关注用户数">
          {{ status.followers_count.toLocaleString() }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="本月推送配额">
          {{ status.monthly_message_quota.toLocaleString() }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="本月已用">
          {{ status.monthly_message_used.toLocaleString() }}
          / 配额 {{ status.monthly_message_quota }}
          ({{ status.monthly_message_quota
            ? Math.round((status.monthly_message_used / status.monthly_message_quota) * 100)
            : 0 }}%)
        </ElDescriptionsItem>
      </ElDescriptions>
    </ElCard>
  </div>
</template>

<style scoped>
.wechat-config-page {
  max-width: 960px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header h2,
.page-header h3 {
  margin: 0;
}

.config-form {
  margin-top: 12px;
}

.form-hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #EBEEF5;
}
</style>