<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserCenterStore } from '@/stores/userCenter'

const userStore = useUserCenterStore()

const settingsForm = reactive({
  allow_cross_clan_friend_finding: true,
  show_childhood_location: false,
  allow_photo_find_me: true,
  allow_annotation_for_match: true,
  enable_in_app_notification: true,
  enable_sms_notification: false,
})

const deleteDialogVisible = ref(false)
const deleteConfirmation = ref('')
const deleteSubmitting = ref(false)

async function loadSettings() {
  const data = await userStore.fetchSettings()
  if (data) {
    Object.assign(settingsForm, {
      allow_cross_clan_friend_finding:
        data.allow_cross_clan_friend_finding,
      show_childhood_location: data.show_childhood_location,
      allow_photo_find_me: data.allow_photo_find_me,
      allow_annotation_for_match: data.allow_annotation_for_match,
      enable_in_app_notification: data.enable_in_app_notification,
      enable_sms_notification: data.enable_sms_notification,
    })
  }
}

async function handleSavePrivacy() {
  await userStore.updateSettings({
    allow_cross_clan_friend_finding:
      settingsForm.allow_cross_clan_friend_finding,
    show_childhood_location: settingsForm.show_childhood_location,
    allow_photo_find_me: settingsForm.allow_photo_find_me,
    allow_annotation_for_match: settingsForm.allow_annotation_for_match,
  })
}

async function handleSaveNotification() {
  await userStore.updateSettings({
    enable_in_app_notification: settingsForm.enable_in_app_notification,
    enable_sms_notification: settingsForm.enable_sms_notification,
  })
}

function openDeleteDialog() {
  deleteConfirmation.value = ''
  deleteDialogVisible.value = true
}

async function handleConfirmDelete() {
  if (deleteConfirmation.value !== '确认注销') {
    ElMessage.warning('请输入"确认注销"以完成操作')
    return
  }
  deleteSubmitting.value = true
  try {
    await userStore.deleteAccount('确认注销')
    deleteDialogVisible.value = false
  } catch {
    /* 已提示 */
  } finally {
    deleteSubmitting.value = false
  }
}

async function handleBindPhone() {
  try {
    await ElMessageBox.prompt('请输入要绑定的手机号', '绑定手机', {
      confirmButtonText: '绑定',
      cancelButtonText: '取消',
      inputPattern: /^1[3-9]\d{9}$/,
      inputErrorMessage: '请输入有效的手机号',
    })
    ElMessage.success('绑定请求已提交，验证码将以短信形式发送')
  } catch {
    /* 取消 */
  }
}

onMounted(loadSettings)
watch(
  () => userStore.settings,
  (val) => {
    if (val) Object.assign(settingsForm, val)
  },
)
</script>

<template>
  <div class="settings-page">
    <ElCard v-loading="userStore.loading">
      <template #header>
        <h2 class="page-title">设置</h2>
      </template>

      <!-- 隐私设置 -->
      <div class="section">
        <h3 class="section-title">
          <ElIcon color="#5d4037"><Lock /></ElIcon>
          隐私设置
        </h3>
        <p class="section-desc">
          控制他人通过何种方式能找到您或看到您的信息
        </p>
        <ElForm label-width="220px" class="settings-form">
          <ElFormItem label="允许跨家族寻找小伙伴">
            <ElSwitch v-model="settingsForm.allow_cross_clan_friend_finding" />
            <span class="form-hint">关闭后，寻找小伙伴功能不再返回跨家族结果</span>
          </ElFormItem>
          <ElFormItem label="公开童年地点">
            <ElSwitch v-model="settingsForm.show_childhood_location" />
            <span class="form-hint">开启后，您的童年照片将展示拍摄地点</span>
          </ElFormItem>
          <ElFormItem label="允许他人通过照片找到我">
            <ElSwitch v-model="settingsForm.allow_photo_find_me" />
            <span class="form-hint">关闭后，您的照片不会出现在同村推荐中</span>
          </ElFormItem>
          <ElFormItem label="允许我的标注用于匹配">
            <ElSwitch v-model="settingsForm.allow_annotation_for_match" />
            <span class="form-hint">开启后，您的标注将参与寻亲匹配算法</span>
          </ElFormItem>
          <ElFormItem>
            <ElButton
              type="primary"
              :loading="userStore.saving"
              @click="handleSavePrivacy"
            >
              保存隐私设置
            </ElButton>
          </ElFormItem>
        </ElForm>
      </div>

      <ElDivider />

      <!-- 通知偏好 -->
      <div class="section">
        <h3 class="section-title">
          <ElIcon color="#5d4037"><Bell /></ElIcon>
          通知偏好
        </h3>
        <p class="section-desc">选择您希望接收通知的方式</p>
        <ElForm label-width="220px" class="settings-form">
          <ElFormItem label="接收站内信通知">
            <ElSwitch v-model="settingsForm.enable_in_app_notification" />
            <span class="form-hint">系统通知与互动消息</span>
          </ElFormItem>
          <ElFormItem label="接收短信通知">
            <ElSwitch v-model="settingsForm.enable_sms_notification" />
            <span class="form-hint">需家族管理员有可用短信额度</span>
          </ElFormItem>
          <ElFormItem>
            <ElButton
              type="primary"
              :loading="userStore.saving"
              @click="handleSaveNotification"
            >
              保存通知设置
            </ElButton>
          </ElFormItem>
        </ElForm>
      </div>

      <ElDivider />

      <!-- 账号安全 -->
      <div class="section">
        <h3 class="section-title">
          <ElIcon color="#5d4037"><Key /></ElIcon>
          账号安全
        </h3>
        <p class="section-desc">管理密码、绑定手机与注销账号</p>
        <ElForm label-width="160px" class="settings-form">
          <ElFormItem label="修改密码">
            <ElButton @click="$router.push('/user-center/profile')">
              前往个人资料修改
            </ElButton>
          </ElFormItem>
          <ElFormItem label="绑定手机">
            <div class="phone-row">
              <span>{{ userStore.settings?.phone_bound || '尚未绑定' }}</span>
              <ElButton size="small" type="primary" plain @click="handleBindPhone">
                {{ userStore.settings?.phone_bound ? '更换' : '绑定' }}
              </ElButton>
            </div>
          </ElFormItem>
          <ElFormItem label="注销账号">
            <ElButton type="danger" plain @click="openDeleteDialog">
              注销账号
            </ElButton>
            <span class="form-hint danger">
              注销后您的所有数据将被删除，此操作不可撤销
            </span>
          </ElFormItem>
        </ElForm>
      </div>
    </ElCard>

    <!-- 注销确认 -->
    <ElDialog
      v-model="deleteDialogVisible"
      title="敏感操作 - 注销账号"
      width="480px"
      :close-on-click-modal="false"
    >
      <ElAlert type="error" :closable="false" show-icon style="margin-bottom: 16px">
        <template #title>请仔细阅读</template>
        注销账号后，您上传的照片、标注、订单、小组等信息都将被删除。
        <br />
        如您是某个家族的所有者，请先转让管理员权限再注销。
      </ElAlert>
      <ElForm label-width="120px">
        <ElFormItem label="输入确认文字">
          <ElInput
            v-model="deleteConfirmation"
            placeholder='请输入"确认注销"'
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="deleteDialogVisible = false">取消</ElButton>
        <ElButton
          type="danger"
          :loading="deleteSubmitting"
          :disabled="deleteConfirmation !== '确认注销'"
          @click="handleConfirmDelete"
        >
          确认注销
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.section {
  padding: 4px 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #303133;
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: #909399;
}

.settings-form {
  margin-top: 8px;
}

.form-hint {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}

.form-hint.danger {
  color: #f56c6c;
}

.phone-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>