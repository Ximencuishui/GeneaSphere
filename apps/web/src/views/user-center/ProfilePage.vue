<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserCenterStore } from '@/stores/userCenter'

const userStore = useUserCenterStore()

const form = reactive({
  nickname: '',
  email: '',
  gender: '' as '' | 'male' | 'female',
  birth_date: '',
})

const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const passwordDialogVisible = ref(false)
const passwordSubmitting = ref(false)
const uploadingAvatar = ref(false)

const avatarUrl = computed(() => userStore.profile?.avatar_url || '')
const phoneDisplay = computed(() => userStore.profile?.phone || '')
const clanName = computed(
  () => userStore.profile?.primary_clan?.name || '尚未加入家族',
)

function syncFormFromProfile() {
  const p = userStore.profile
  if (!p) return
  form.nickname = p.nickname || ''
  form.email = p.email || ''
  form.gender = (p.gender as 'male' | 'female') || ''
  form.birth_date = p.birth_date ? p.birth_date.slice(0, 10) : ''
}

async function handleSave() {
  try {
    await userStore.updateProfile({
      nickname: form.nickname || undefined,
      email: form.email || undefined,
      gender: (form.gender || undefined) as 'male' | 'female' | undefined,
      birth_date: form.birth_date || undefined,
    })
  } catch {
    /* 错误已提示 */
  }
}

async function onAvatarSelected(file: File) {
  if (!file.type.match(/^image\/(jpe?g|png|webp)$/i)) {
    ElMessage.error('头像仅支持 jpg/png/webp')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('头像大小不能超过 5MB')
    return
  }
  uploadingAvatar.value = true
  try {
    await userStore.uploadAvatarByFile(file)
  } catch (err) {
    // 已提示
  } finally {
    uploadingAvatar.value = false
  }
}

function onAvatarChange(uploadFile: any) {
  if (uploadFile?.raw) {
    onAvatarSelected(uploadFile.raw)
  }
}

function openPasswordDialog() {
  passwordForm.old_password = ''
  passwordForm.new_password = ''
  passwordForm.confirm_password = ''
  passwordDialogVisible.value = true
}

async function submitPasswordChange() {
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  passwordSubmitting.value = true
  try {
    await userStore.changePassword({
      old_password: passwordForm.old_password,
      new_password: passwordForm.new_password,
      confirm_password: passwordForm.confirm_password,
    })
    ElMessage.success('密码已更新')
    passwordDialogVisible.value = false
  } catch {
    /* 已提示 */
  } finally {
    passwordSubmitting.value = false
  }
}

const passwordStrengthOk = computed(() => {
  const v = passwordForm.new_password
  return v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)
})

watch(
  () => userStore.profile,
  () => syncFormFromProfile(),
  { immediate: true },
)

onMounted(async () => {
  await userStore.fetchProfile()
  syncFormFromProfile()
})
</script>

<template>
  <div class="profile-page">
    <ElCard v-loading="userStore.loading" class="profile-card">
      <template #header>
        <h2 class="page-title">个人资料</h2>
      </template>

      <div class="profile-body">
        <!-- 头像区 -->
        <div class="avatar-section">
          <div
            class="avatar-display"
            :style="
              avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined
            "
          >
            <ElIcon v-if="!avatarUrl" :size="48" color="#fff"
              ><UserFilled
            /></ElIcon>
          </div>
          <ElUpload
            :show-file-list="false"
            :auto-upload="false"
            accept="image/jpeg,image/png,image/webp"
            :on-change="onAvatarChange"
          >
            <ElButton :loading="uploadingAvatar" type="primary" plain>
              更换头像
            </ElButton>
          </ElUpload>
          <div class="avatar-tip">
            支持 jpg/png/webp，≤5MB
          </div>
        </div>

        <!-- 资料表单 -->
        <div class="form-section">
          <ElForm label-width="120px" class="profile-form">
            <ElFormItem label="昵称">
              <ElInput
                v-model="form.nickname"
                placeholder="请输入昵称"
                maxlength="50"
                show-word-limit
              />
            </ElFormItem>
            <ElFormItem label="手机号">
              <ElInput :model-value="phoneDisplay" disabled />
            </ElFormItem>
            <ElFormItem label="邮箱">
              <ElInput
                v-model="form.email"
                placeholder="可选，用于找回密码"
                type="email"
              />
            </ElFormItem>
            <ElFormItem label="性别">
              <ElRadioGroup v-model="form.gender">
                <ElRadio value="male">男</ElRadio>
                <ElRadio value="female">女</ElRadio>
                <ElRadio value="">未设置</ElRadio>
              </ElRadioGroup>
            </ElFormItem>
            <ElFormItem label="出生日期">
              <ElDatePicker
                v-model="form.birth_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </ElFormItem>
            <ElFormItem label="所属家族">
              <ElInput :model-value="clanName" disabled />
            </ElFormItem>
            <ElFormItem label="家庭关系">
              <ElButton text type="primary" @click="$router.push('/user-center/family-relation')">
                前往维护
              </ElButton>
            </ElFormItem>
            <ElFormItem>
              <ElButton
                type="primary"
                :loading="userStore.saving"
                @click="handleSave"
              >
                保存修改
              </ElButton>
              <ElButton @click="openPasswordDialog">修改密码</ElButton>
            </ElFormItem>
          </ElForm>
        </div>
      </div>
    </ElCard>

    <!-- 修改密码弹窗 -->
    <ElDialog
      v-model="passwordDialogVisible"
      title="修改密码"
      width="440px"
      :close-on-click-modal="false"
    >
      <ElForm label-width="100px">
        <ElFormItem label="旧密码">
          <ElInput
            v-model="passwordForm.old_password"
            type="password"
            show-password
            placeholder="请输入当前密码"
          />
        </ElFormItem>
        <ElFormItem label="新密码">
          <ElInput
            v-model="passwordForm.new_password"
            type="password"
            show-password
            placeholder="至少 8 位，含字母与数字"
          />
          <div
            v-if="passwordForm.new_password && !passwordStrengthOk"
            class="pwd-hint danger"
          >
            密码必须至少 8 位，且包含字母与数字
          </div>
        </ElFormItem>
        <ElFormItem label="确认密码">
          <ElInput
            v-model="passwordForm.confirm_password"
            type="password"
            show-password
            placeholder="再次输入新密码"
          />
          <div
            v-if="
              passwordForm.confirm_password &&
              passwordForm.confirm_password !== passwordForm.new_password
            "
            class="pwd-hint danger"
          >
            两次输入的密码不一致
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="passwordDialogVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :loading="passwordSubmitting"
          :disabled="!passwordStrengthOk"
          @click="submitPasswordChange"
        >
          确认修改
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 960px;
  margin: 0 auto;
}

.profile-card {
  border-radius: 12px;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.profile-body {
  display: flex;
  gap: 40px;
  padding: 16px 0;
}

.avatar-section {
  width: 200px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.avatar-display {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-tip {
  font-size: 12px;
  color: #909399;
}

.form-section {
  flex: 1;
  min-width: 0;
}

.profile-form {
  max-width: 540px;
}

.pwd-hint {
  font-size: 12px;
  margin-top: 4px;
}

.pwd-hint.danger {
  color: #f56c6c;
}

@media (max-width: 768px) {
  .profile-body {
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }
  .form-section {
    width: 100%;
  }
}
</style>