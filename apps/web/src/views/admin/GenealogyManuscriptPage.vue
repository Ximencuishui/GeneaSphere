<script setup lang="ts">
import '@wangeditor/editor/dist/css/style.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import {
  MANUSCRIPT_FONT_MENU,
  MANUSCRIPT_INDENT_MENU,
  editorHtmlForStorage,
  htmlForEditor,
  registerManuscriptMenus,
} from './manuscript-editor'
import { MANUSCRIPT_FONT_FAMILY_LIST, loadManuscriptFonts } from './manuscript-fonts'

registerManuscriptMenus()

const route = useRoute()
const clanSlug = computed(() => String(route.params.slug ?? ''))
const loading = ref(false)
const saving = ref('')
const volumes = ref<any[]>([])
const active = ref('')
const draftHtml = ref('<p><br></p>')
const editorRef = shallowRef<IDomEditor>()
/** 编辑器实例当前对应的目录槽。切换时先对上它，避免卸载瞬间把旧正文写进新槽。 */
const editorSlot = ref('')
/** 切换卷或初次灌入时，编辑器自己会触发一次变更，这次不能覆盖库里的原文。 */
const applying = ref(true)
const dirtySlot = ref('')

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

const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: [
    'header2',
    'header3',
    'header4',
    '|',
    'bold',
    '|',
    MANUSCRIPT_FONT_MENU,
    '|',
    'justifyLeft',
    'justifyCenter',
    '|',
    MANUSCRIPT_INDENT_MENU,
    '|',
    'color',
    'clearStyle',
    '|',
    'undo',
    'redo',
  ],
}

const editorConfig: Partial<IEditorConfig> = {
  placeholder: '这一槽的正文。家训会同时写回家族概况。',
  autoFocus: false,
  scroll: true,
  MENU_CONF: {
    fontFamily: {
      fontFamilyList: MANUSCRIPT_FONT_FAMILY_LIST,
    },
  },
}

const current = computed(() => volumes.value.find((volume) => volume.catalog_slot === active.value))

async function load() {
  loading.value = true
  try {
    const { data } = await axios.get(`/api/genealogy/${clanSlug.value}/slots`)
    volumes.value = data?.data ?? data ?? []
    if (!active.value) active.value = 'preface'
    draftHtml.value = htmlForEditor(current.value?.type === 'document' ? current.value.content : '')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '谱稿正文加载失败')
  } finally {
    loading.value = false
  }
}

function flushEditor() {
  const editor = editorRef.value
  const slot = editorSlot.value
  if (!editor || !slot || dirtySlot.value !== slot) return
  const volume = volumes.value.find((item) => item.catalog_slot === slot)
  if (!volume || volume.type !== 'document') return
  try {
    volume.content = editorHtmlForStorage(editor.getHtml())
  } catch {
    // 编辑器还没就绪时保留原来的 HTML
  }
}

function selectSlot(key: string) {
  if (key === active.value) return
  flushEditor()
  applying.value = true
  const fromDocument = !!editorRef.value && current.value?.type === 'document'
  active.value = key
  dirtySlot.value = ''
  const volume = current.value
  if (!volume || volume.type !== 'document') return
  draftHtml.value = htmlForEditor(volume.content)
  if (fromDocument) {
    editorSlot.value = key
    applying.value = false
  }
}

function handleCreated(editor: IDomEditor) {
  const prev = editorRef.value
  if (prev && prev !== editor) {
    try { prev.destroy() } catch { /* 切走文档槽时实例已经脱离页面 */ }
  }
  editorRef.value = editor
  editorSlot.value = active.value
  applying.value = false
}

function handleChange(editor: IDomEditor) {
  if (applying.value) return
  const slot = editorSlot.value
  if (!slot || slot !== active.value) return
  const volume = volumes.value.find((item) => item.catalog_slot === slot)
  if (!volume || volume.type !== 'document') return
  dirtySlot.value = slot
  volume.content = editorHtmlForStorage(editor.getHtml())
}

async function save() {
  const volume = current.value
  if (!volume) return
  flushEditor()
  saving.value = volume.catalog_slot
  try {
    await axios.put(`/api/genealogy/${clanSlug.value}/slots/${volume.catalog_slot}`, {
      content: volume.content ?? '',
      config: volume.config,
    })
    dirtySlot.value = ''
    ElMessage.success('已写入修谱稿')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = ''
  }
}

onMounted(() => {
  loadManuscriptFonts().catch(() => {})
  load()
})
onBeforeUnmount(() => {
  flushEditor()
  applying.value = true
  try { editorRef.value?.destroy() } catch { /* 页面离开时编辑器可能已经销毁 */ }
  editorRef.value = undefined
})
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
          @click="selectSlot(slot.key)"
        >{{ slot.label }}</button>
      </aside>
      <section v-if="current" class="editor-pane">
        <h3>{{ current.title }}</h3>
        <div v-if="current.type === 'document'" class="editor-shell">
          <Toolbar
            class="editor-toolbar"
            :editor="editorRef"
            :defaultConfig="toolbarConfig"
            mode="default"
          />
          <Editor
            class="editor-body"
            v-model="draftHtml"
            :defaultConfig="editorConfig"
            mode="default"
            @onCreated="handleCreated"
            @onChange="handleChange"
          />
        </div>
        <p v-else class="hint">世系、人物传、闺秀录的人物在谱系稿里改。这里只保留这一卷的筛选配置。</p>
        <ElButton type="primary" :loading="saving === current.catalog_slot" @click="save">保存这一槽</ElButton>
      </section>
    </div>
  </div>
</template>

<style scoped>
.manuscript-page {
  height: calc(100vh - 168px);
  min-height: 520px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  padding: 0 4px;
}
.head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; flex-shrink: 0; }
.head h2 { margin: 0 0 6px; }
.head p { margin: 0; color: #6b5344; }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 180px 1fr; gap: 16px; }
aside { display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow: auto; }
aside button { text-align: left; border: 1px solid #eadfce; background: #fffaf3; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
aside button.active { background: #5d4037; color: #fff; border-color: #5d4037; }
.editor-pane { min-height: 0; display: flex; flex-direction: column; }
.editor-pane h3 { margin: 0 0 10px; flex-shrink: 0; }
.editor-shell {
  flex: 1;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  border: 1px solid #eadfce;
  border-radius: 8px;
  overflow: hidden;
  background: #e6e1d6;
  margin-bottom: 12px;
}
.editor-toolbar { flex-shrink: 0; }
.editor-body { flex: 1; min-height: 0; overflow: hidden; }
.editor-shell :deep(.w-e-toolbar) {
  border: none;
  border-bottom: 1px solid #eadfce;
  background: #fffaf3;
}
.editor-shell :deep(.w-e-text-container) {
  height: 100% !important;
  border: none !important;
  background: #e6e1d6;
}
.editor-shell :deep(.w-e-scroll) {
  height: 100% !important;
  overflow: auto !important;
  background: #e6e1d6;
  padding: 28px 16px 36px;
  box-sizing: border-box;
}
.editor-shell :deep(.w-e-text-container [data-slate-editor]) {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 20mm;
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 10px 28px rgba(48, 38, 26, 0.18);
  font-family: '宋体', SimSun, STSong, 'Songti SC', serif;
  font-size: 16px;
  line-height: 1.85;
}
.editor-pane > .el-button { align-self: flex-start; flex-shrink: 0; }
.hint { color: #6b5344; flex: 1; }
</style>
