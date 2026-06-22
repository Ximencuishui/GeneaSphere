<template>
  <div class="h5-page">
    <CountdownBar v-if="expireAt" :expire-at="expireAt" :on-expire="onExpire" title="剩余时间" />

    <div class="h5-card">
      <h1 class="h5-title">欢迎加入{{ clanName }}</h1>
      <p class="h5-subtitle">请确认或完善你的个人信息</p>

      <template v-if="hasExistingData">
        <div v-for="(item, idx) in displayRows" :key="idx" class="h5-row">
          <span class="h5-row__label">{{ item.label }}</span>
          <span class="h5-row__value">
            <template v-if="editingKey === item.key">
              <input v-model="editValue" class="h5-input" style="margin: 0;" />
            </template>
            <template v-else>{{ item.value || '—' }}</template>
            <a style="margin-left: 8px; color: #409eff; font-size: 12px;" @click="onEdit(item)">
              {{ editingKey === item.key ? '保存' : '修改' }}
            </a>
          </span>
        </div>
      </template>

      <template v-else>
        <p class="h5-tip" style="margin-bottom: 12px;">未在族谱中找到你的记录，请填写以下信息：</p>
        <label class="h5-label">姓名 *</label>
        <input v-model="form.full_name" class="h5-input" placeholder="请输入你的姓名" />
        <label class="h5-label">性别 *</label>
        <select v-model="form.gender" class="h5-select">
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
        <label class="h5-label">出生年份</label>
        <input v-model.number="form.birth_year" class="h5-input" type="number" placeholder="如 1970" />
        <label class="h5-label">父亲姓名</label>
        <input v-model="form.father_name" class="h5-input" placeholder="选填" />
        <label class="h5-label">母亲姓名</label>
        <input v-model="form.mother_name" class="h5-input" placeholder="选填" />
        <label class="h5-label">配偶姓名</label>
        <input v-model="form.spouse_name" class="h5-input" placeholder="选填" />
        <label class="h5-label">子女姓名（多个用顿号分隔）</label>
        <input v-model="childrenRaw" class="h5-input" placeholder="如：张小四、张小五" />

        <button class="h5-btn" :disabled="submitting" @click="onSubmitInfo">提交并匹配</button>

        <div v-if="autoMatch?.has_match" class="h5-card" style="background: #ecf5ff; border: 1px solid #b3d8ff; margin-top: 12px;">
          <div style="font-size: 14px; margin-bottom: 8px;">我们为你匹配到以下人物：</div>
          <div
            v-for="m in autoMatch.matched"
            :key="m.person_id"
            class="h5-radio"
            :class="{ 'is-active': selectedMatch?.person_id === m.person_id }"
            @click="selectedMatch = m"
          >
            <input type="radio" :checked="selectedMatch?.person_id === m.person_id" />
            <div>
              <div style="font-weight: 500;">{{ m.full_name }}</div>
              <div style="font-size: 12px; color: #909399;">
                {{ m.gender === 'male' ? '男' : '女' }}
                <span v-if="m.birth_year"> · {{ m.birth_year }}年</span>
                <span v-if="m.birth_place"> · {{ m.birth_place }}</span>
              </div>
            </div>
          </div>
          <button class="h5-btn" :disabled="!selectedMatch" @click="onConfirmMatch">确认关联</button>
          <button class="h5-btn h5-btn--secondary" @click="onSkipMatch">都不是，继续验证</button>
        </div>
      </template>

      <button
        v-if="hasExistingData"
        class="h5-btn"
        :disabled="submitting"
        :style="{ marginTop: '16px' }"
        type="button"
        @click="onConfirm()"
      >
        确认无误，加入家族
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { showToast, showDialog } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import CountdownBar from '@/components/CountdownBar.vue'
import '@/styles/h5.scss'

const route = useRoute()
const router = useRouter()

const sessionId = String(route.query.session_id || '')
const expireAt = ref<string | null>(null)
const clanName = ref('家族')
const hasExistingData = ref(false)
const displayRows = ref<{ key: string; label: string; value: string }[]>([])
const editingKey = ref<string | null>(null)
const editValue = ref('')
const submitting = ref(false)

const form = ref({
  full_name: '',
  gender: 'male',
  birth_year: undefined as number | undefined,
  father_name: '',
  mother_name: '',
  spouse_name: '',
})
const childrenRaw = ref('')

const autoMatch = ref<any>(null)
const selectedMatch = ref<any>(null)

const onExpire = () => {
  showDialog({ title: '已超时', message: '请重新扫码开始验证' })
  router.replace('/h5/expired')
}

const onEdit = (item: any) => {
  if (editingKey.value === item.key) {
    const idx = displayRows.value.findIndex((r) => r.key === item.key)
    if (idx >= 0) displayRows.value[idx].value = editValue.value
    editingKey.value = null
  } else {
    editingKey.value = item.key
    editValue.value = item.value
  }
}

const onSubmitInfo = async () => {
  if (!form.value.full_name) {
    showToast('请输入姓名')
    return
  }
  try {
    submitting.value = true
    const res = (await axios.post('/api/invite/h5/person-info', {
      session_id: sessionId,
      ...form.value,
      children_names: childrenRaw.value
        ? childrenRaw.value.split(/[、,，\s]+/).filter(Boolean)
        : [],
    })).data
    autoMatch.value = res.auto_match
    if (!res.auto_match?.has_match) {
      showToast('未找到匹配，开始知识问答验证')
      setTimeout(() => router.replace({ path: '/h5/quiz', query: { session_id: sessionId } }), 800)
    }
  } catch (e: any) {
    showToast(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

const onConfirmMatch = async () => {
  if (!selectedMatch.value) return
  await onConfirm({ person_id: parseInt(selectedMatch.value.person_id) })
}

const onSkipMatch = () => {
  router.replace({ path: '/h5/quiz', query: { session_id: sessionId } })
}

const onConfirm = async (extra?: { person_id?: number }) => {
  try {
    submitting.value = true
    const confirmed = displayRows.value.length
      ? {
          full_name: displayRows.value.find((r) => r.key === 'full_name')?.value,
          gender: displayRows.value.find((r) => r.key === 'gender')?.value,
          birth_year: displayRows.value.find((r) => r.key === 'birth_year')?.value
            ? parseInt(displayRows.value.find((r) => r.key === 'birth_year')!.value)
            : undefined,
          father_name: displayRows.value.find((r) => r.key === 'father_name')?.value,
          mother_name: displayRows.value.find((r) => r.key === 'mother_name')?.value,
          spouse_name: displayRows.value.find((r) => r.key === 'spouse_name')?.value,
        }
      : undefined
    await axios.post('/api/invite/h5/confirm-info', {
      session_id: sessionId,
      person_id: extra?.person_id,
      confirmed_payload: confirmed,
    })
    showToast('已加入家族')
    setTimeout(() => router.replace({ path: '/h5/success', query: { session_id: sessionId, clan_name: clanName.value } }), 600)
  } catch (e: any) {
    showToast(e?.response?.data?.message || '确认失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!sessionId) {
    showDialog({ title: '无效会话', message: '未携带 session_id' })
    router.replace('/h5/expired')
    return
  }
  const cache = sessionStorage.getItem('h5_invite_session')
  if (cache) {
    const parsed = JSON.parse(cache)
    expireAt.value = parsed.expire_at
    clanName.value = parsed.clan?.name || '家族'
  }
  try {
    const res = await axios.get(`/api/invite/h5/session/${sessionId}`)
    if (res.data.status === 'PASSED') {
      router.replace({ path: '/h5/success', query: { session_id: sessionId, clan_name: clanName.value } })
    } else if (res.data.status === 'EXPIRED' || res.data.status === 'FAILED') {
      router.replace('/h5/expired')
    } else if (res.data.matched_person_id) {
      hasExistingData.value = true
      const match = autoMatch.value?.matched?.find((m: any) => m.person_id === res.data.matched_person_id)
      displayRows.value = [
        { key: 'full_name', label: '姓名', value: match?.full_name || '—' },
        { key: 'gender', label: '性别', value: match?.gender === 'male' ? '男' : '女' },
        { key: 'birth_year', label: '出生年份', value: match?.birth_year ? String(match.birth_year) : '—' },
        { key: 'father_name', label: '父亲', value: '—' },
        { key: 'mother_name', label: '母亲', value: '—' },
        { key: 'spouse_name', label: '配偶', value: '—' },
      ]
    }
  } catch (e) {
    console.warn('拉取会话状态失败', e)
  }
})
</script>
