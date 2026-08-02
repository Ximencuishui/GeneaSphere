<template>
  <el-dialog v-model="visible" title="生成邀请二维码" width="420" :close-on-click-modal="false">
    <el-form :model="form" label-width="100">
      <el-form-item label="家族">
        <el-input v-model="form.clan_slug" disabled />
      </el-form-item>
      <el-form-item label="有效期（天）">
        <el-input-number v-model="form.expire_days" :min="1" :max="30" />
        <span style="margin-left: 8px; color: #909399; font-size: 12px;">默认 7 天</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  visible: boolean
  clanSlug: string
}>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'created', data: any): void
}>()

const visible = ref(props.visible)
watch(() => props.visible, (v) => (visible.value = v))
watch(visible, (v) => emit('update:visible', v))

// P1-5 修复：clan_id → clan_slug，与后端 /api/invite/qrcodes POST body 对齐
const form = ref({
  clan_slug: props.clanSlug,
  expire_days: 7,
})
watch(() => props.clanSlug, (v) => (form.value.clan_slug = v))

const submitting = ref(false)

const onSubmit = async () => {
  try {
    submitting.value = true
    const res = await axios.post('/api/invite/qrcodes', {
      clan_slug: form.value.clan_slug,
      expire_days: form.value.expire_days,
    })
    ElMessage.success('生成成功')
    visible.value = false
    emit('created', res.data)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '生成失败')
  } finally {
    submitting.value = false
  }
}
</script>
