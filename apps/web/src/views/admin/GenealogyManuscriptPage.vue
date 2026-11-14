<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? ''))
const loading = ref(false)
const saving = ref('')
const volumes = ref<any[]>([])
const active = ref('')

const slots = [
  { key: 'preface', label: '谱序源流' },
  { key: 'rules-fanli', label: '凡例' },
  { key: 'rules-jiaxun', label: '家训' },
  { key: 'rules-xiangzan', label: '像赞' },
  { key: 'rules-citang', label: '祠堂坟图' },
  { key: 'lineage', label: '世系录' },
  { key: 'biography', label: '人物传' },
  { key: 'ladies', label: '闺秀录' },
  { key: 'appendix-verse', label: '诗文碑记' },
  { key: 'appendix-chronicle', label: '修谱纪事' },
  { key: 'appendix-notes', label: '附录考据' },
]

const current = computed(() => volumes.value.find((volume) => volume.catalog_slot === active.value))

async function load() {
  loading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/slots`)
    volumes.value = data?.data ?? data ?? []
    if (!active.value) active.value = 'preface'
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '谱稿正文加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  const volume = current.value
  if (!volume) return
  saving.value = volume.catalog_slot
  try {
    await axios.put(`/api/genealogy/${clanSlug.value}/slots/${volume.catalog_slot}`, {
      content: volume.content ?? '',
      config: volume.config,
    })
    ElMessage.success('已写入修谱稿')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="manuscript-page" v-loading="loading">
    <header class="head">
      <div>
        <h2>谱稿正文</h2>
        <p>这里改的是本轮修谱稿。定稿后的册谱只读，要改先在终审定稿页开始下一轮。</p>
      </div>
      <ElButton @click="$router.push(`/tree/${clanSlug}?draft=1`)">打开谱系稿</ElButton>
    </header>
    <div class="body">
      <aside>
        <button
          v-for="slot in slots"
          :key="slot.key"
          type="button"
          :class="{ active: active === slot.key }"
          @click="active = slot.key"
        >{{ slot.label }}</button>
      </aside>
      <section v-if="current">
        <h3>{{ current.title }}</h3>
        <ElInput
          v-if="current.type === 'document'"
          v-model="current.content"
          type="textarea"
          :rows="16"
          placeholder="这一槽的正文。家训会同时写回家族概况。"
        />
        <p v-else class="hint">世系、人物传、闺秀录的人物在谱系稿里改。这里只保留这一卷的筛选配置。</p>
        <ElButton type="primary" :loading="saving === current.catalog_slot" @click="save">保存这一槽</ElButton>
      </section>
    </div>
  </div>
</template>

<style scoped>
.manuscript-page { padding: 8px 4px 24px; }
.head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
.head h2 { margin: 0 0 6px; }
.head p { margin: 0; color: #6b5344; }
.body { display: grid; grid-template-columns: 180px 1fr; gap: 16px; }
aside { display: flex; flex-direction: column; gap: 6px; }
aside button { text-align: left; border: 1px solid #eadfce; background: #fffaf3; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
aside button.active { background: #5d4037; color: #fff; border-color: #5d4037; }
section h3 { margin-top: 0; }
.hint { color: #6b5344; }
</style>
