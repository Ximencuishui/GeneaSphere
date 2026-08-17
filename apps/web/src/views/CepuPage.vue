<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  Search,
  Download,
  Edit,
  Plus,
  Top,
  Bottom,
  Delete,
  Reading,
  Location,
  Document,
  Share,
  Clock,
} from '@element-plus/icons-vue';
import { cepuApi, type BookVolume, type ShiluEntry, type PersonBio } from '@/api/cepu';

/**
 * 册谱页面（《册谱模块需求文档》一期核心闭环）
 * - 卷宗目录（侧边栏）+ 文档卷渲染 + 世录卷苏式条目 + 检索 + PDF 导出
 * - 管理员编辑：卷宗增删/排序/文档内容/世录筛选配置/人物传记附表
 * - 与树谱双向跳转：?person= 定位世录条目；"查看树谱位置" → /tree/:clanId?focus=id
 */
const route = useRoute();
const router = useRouter();
const clanId = computed(() => String(route.params.clanId || ''));

const isAdmin = computed(() => {
  const token = localStorage.getItem('geneasphere_token');
  if (!token) return false;
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return payload.role === 'OWNER' || payload.role === 'ADMIN';
  } catch {
    return false;
  }
});

// ---------- 状态 ----------
const volumes = ref<BookVolume[]>([]);
const activeVolumeId = ref<string | null>(null);
const volumeContent = ref<{
  id: string;
  title: string;
  type: string;
  content?: string;
  config?: any;
  entries?: ShiluEntry[];
} | null>(null);
const loading = ref(false);
const editMode = ref(false);

const searchKeyword = ref('');
const searchResults = ref<{ persons: any[]; volumes: any[] } | null>(null);
const searchOpen = ref(false);

const focusedEntryId = ref<string | null>(null);
const focusPersonId = computed(() => (route.query.person ? String(route.query.person) : null));

// ---------- 分享只读模式（二期） ----------
const hasLogin = computed(() => !!localStorage.getItem('geneasphere_token'));
const shareMode = computed(() => !!route.query.share);
const shareToken = computed(() => (route.query.share ? String(route.query.share) : undefined));
const accessError = ref<string | null>(null);

const shareDialog = ref(false);
const shareLinks = ref<any[]>([]);
const generatingShare = ref(false);

// ---------- 卷宗版本历史（二期） ----------
const versionDialog = ref(false);
const versions = ref<any[]>([]);

async function openVersionDialog() {
  if (!activeVolumeId.value) {
    ElMessage.warning('请先选择卷宗');
    return;
  }
  versionDialog.value = true;
  try {
    const list: any = await cepuApi.listVolumeVersions(activeVolumeId.value);
    versions.value = (list || []) as any[];
  } catch {
    /* 拦截器已提示 */
  }
}

async function restoreVersion(v: any) {
  if (!activeVolumeId.value) return;
  try {
    await ElMessageBox.confirm(`确认回滚到 v${v.version}（${v.title}）？回滚也会生成新版本。`, '回滚版本', {
      type: 'warning',
      confirmButtonText: '回滚',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  await cepuApi.restoreVolumeVersion(activeVolumeId.value, v.version);
  ElMessage.success('已回滚');
  versionDialog.value = false;
  await selectVolume(activeVolumeId.value);
}

function openShareDialog() {
  shareDialog.value = true;
  loadShareLinks();
}

async function loadShareLinks() {
  try {
    const list: any = await cepuApi.listShares(clanId.value);
    shareLinks.value = (list || []) as any[];
  } catch {
    /* 拦截器已提示 */
  }
}

async function createShare() {
  generatingShare.value = true;
  try {
    await cepuApi.createShare(clanId.value);
    ElMessage.success('分享链接已生成');
    await loadShareLinks();
  } catch {
    /* 拦截器已提示 */
  } finally {
    generatingShare.value = false;
  }
}

async function revokeShare(token: string) {
  await cepuApi.revokeShare(token);
  shareLinks.value = shareLinks.value.filter((l) => l.token !== token);
  ElMessage.success('分享链接已撤销');
}

function copyShare(url: string) {
  const full = `${location.origin}${url}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(full).then(
      () => ElMessage.success('链接已复制'),
      () => ElMessage.warning('复制失败，请手动复制'),
    );
  } else {
    ElMessage.warning('复制失败，请手动复制');
  }
}

const personPanel = ref<{ person_id: string; full_name: string; entry?: ShiluEntry } | null>(null);
const personBio = ref<PersonBio | null>(null);
const bioEditing = ref(false);
const bioSaving = ref(false);
const bioForm = ref<Record<string, any>>({});

// ---------- 卷宗加载 ----------
async function loadVolumes() {
  loading.value = true;
  accessError.value = null;
  try {
    const data: any = await cepuApi.getVolumes(clanId.value, shareToken.value);
    volumes.value = (data || []) as BookVolume[];
    if (volumes.value.length > 0 && !activeVolumeId.value) {
      await selectVolume(volumes.value[0].id);
    }
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    if (status === 403) {
      accessError.value = shareMode.value
        ? '分享链接无效或已失效，请联系家族管理员'
        : '访问册谱需要登录，或使用家族管理员分享的只读链接';
    }
    /* 其余错误由拦截器提示 */
  } finally {
    loading.value = false;
  }
}

async function selectVolume(id: string) {
  activeVolumeId.value = id;
  volumeContent.value = null;
  searchOpen.value = false;
  annotations.value = {};
  try {
    const data: any = await cepuApi.getVolume(clanId.value, id, shareToken.value);
    volumeContent.value = data;
    if (hasLogin.value) loadAnnotations(id);
    nextTick(() => applyFocus());
  } catch {
    /* 拦截器已提示 */
  }
}

function applyFocus() {
  if (!focusPersonId.value || !volumeContent.value?.entries) return;
  const entry = volumeContent.value.entries.find(
    (e) => String(e.person_id) === focusPersonId.value,
  );
  if (entry) {
    focusedEntryId.value = focusPersonId.value;
    nextTick(() => {
      document
        .getElementById(`shilu-${focusPersonId.value}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    openPerson(entry.person_id, entry.full_name, entry);
  } else {
    ElMessage.info('该人物不在当前世录卷中，请切换到对应卷宗');
  }
}

// ---------- 世录渲染（苏式） ----------
function entryHead(e: ShiluEntry): string {
  const rank = e.rank ? `第${e.rank} ` : '';
  const courtesy = e.courtesy_name ? `，字${e.courtesy_name}` : '';
  const years = e.birth_year
    ? `，${e.birth_year}${e.death_year ? ` - ${e.death_year}` : e.is_living ? ' - 今' : ''}`
    : '';
  const burial = e.burial_place ? `，葬${e.burial_place}` : '';
  const spouses = e.spouses.length
    ? `，配${e.spouses.map((s) => `${s.name}${s.native_place ? `（${s.native_place}）` : ''}`).join('、')}`
    : '';
  const kids = e.children.length
    ? `，子女：${e.children
        .map((c) => `${c.name}${c.child_type && c.child_type !== 'BIOLOGICAL' ? '（过继）' : ''}`)
        .join('、')}`
    : '';
  return `${rank}${e.full_name}${courtesy}${years}${burial}${spouses}${kids}`;
}

// ---------- 人物面板（世录条目点击） ----------
async function openPerson(personId: string, fullName: string, entry?: ShiluEntry) {
  personPanel.value = { person_id: personId, full_name: fullName, entry };
  personBio.value = null;
  bioEditing.value = false;
  try {
    const bio: any = await cepuApi.getPersonBio(personId, shareToken.value);
    personBio.value = bio as PersonBio;
    bioForm.value = {
      courtesy_name: bio?.courtesy_name ?? '',
      native_place: bio?.native_place ?? '',
      burial_place: bio?.burial_place ?? '',
      achievements: bio?.achievements ?? '',
      anecdotes: bio?.anecdotes ?? '',
      biography: bio?.biography ?? '',
      marital_notes: bio?.marital_notes ?? '',
      adoption_note: bio?.adoption_note ?? '',
    };
  } catch {
    /* 无 bio 也允许查看基础信息 */
  }
}

function jumpToTree(personId: string) {
  router.push({ path: `/tree/${clanId.value}`, query: { focus: personId } });
}

async function saveBio() {
  if (!personPanel.value) return;
  bioSaving.value = true;
  try {
    await cepuApi.upsertPersonBio(personPanel.value.person_id, bioForm.value);
    ElMessage.success('传记已保存');
    bioEditing.value = false;
    // 若当前卷是世录卷，刷新条目（biography/字号等变化）
    if (volumeContent.value?.type === 'shilu') {
      await selectVolume(activeVolumeId.value!);
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    bioSaving.value = false;
  }
}

// ---------- 检索 ----------
async function handleSearch() {
  const q = searchKeyword.value.trim();
  if (!q) {
    searchResults.value = null;
    return;
  }
  const res: any = await cepuApi.search(clanId.value, q, shareToken.value);
  searchResults.value = res;
  searchOpen.value = true;
}

// ---------- 导出 PDF ----------
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const exportingPdf = ref(false);
const exportDialog = ref(false);
const exportOpts = ref({ header: '', footer: '', withAnnotations: false });

async function doExportPdf() {
  exportingPdf.value = true;
  try {
    const url = cepuApi.exportPdfUrl(clanId.value, {
      header: exportOpts.value.header || undefined,
      footer: exportOpts.value.footer || undefined,
      withAnnotations: exportOpts.value.withAnnotations,
    }, shareToken.value);
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, `册谱-${clanId.value}.pdf`);
    ElMessage.success('PDF 已导出');
    exportDialog.value = false;
  } catch {
    ElMessage.error('PDF 生成失败（可能服务器缺少浏览器渲染环境）');
  } finally {
    exportingPdf.value = false;
  }
}

const exportingWord = ref(false);
async function doExportWord() {
  exportingWord.value = true;
  try {
    const res = await fetch(
      cepuApi.exportWordUrl(clanId.value, exportOpts.value.withAnnotations, shareToken.value),
    );
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    downloadBlob(blob, `册谱-${clanId.value}.doc`);
    ElMessage.success('Word 已导出');
    exportDialog.value = false;
  } catch {
    ElMessage.error('Word 导出失败');
  } finally {
    exportingWord.value = false;
  }
}

// ==================== 批注（二期） ====================
// anchor 规则（决策清单 §G）：世录条目 = person:<id>；文档段落 = para:doc
const annotations = ref<Record<string, any[]>>({}); // anchor -> notes
const newAnnotation = ref('');
const docAnnotation = ref('');

async function loadAnnotations(volumeId: string) {
  if (!hasLogin.value) return; // 批注为登录专属（分享只读不展示）
  try {
    const list: any = await cepuApi.getAnnotations(volumeId);
    const map: Record<string, any[]> = {};
    for (const a of list || []) {
      if (!map[a.anchor]) map[a.anchor] = [];
      map[a.anchor].push(a);
    }
    annotations.value = map;
  } catch {
    /* 拦截器已提示 */
  }
}

async function addPersonAnnotation() {
  if (!personPanel.value || !activeVolumeId.value) return;
  const note = newAnnotation.value.trim();
  if (!note) return;
  await cepuApi.createAnnotation(activeVolumeId.value, {
    anchor: `person:${personPanel.value.person_id}`,
    note,
  });
  newAnnotation.value = '';
  ElMessage.success('批注已添加');
  await loadAnnotations(activeVolumeId.value);
}

async function addDocAnnotation() {
  if (!activeVolumeId.value) return;
  const note = docAnnotation.value.trim();
  if (!note) return;
  await cepuApi.createAnnotation(activeVolumeId.value, { anchor: 'para:doc', note });
  docAnnotation.value = '';
  ElMessage.success('批注已添加');
  await loadAnnotations(activeVolumeId.value);
}

async function removeAnnotation(a: any) {
  await cepuApi.deleteAnnotation(a.id);
  ElMessage.success('批注已删除');
  if (activeVolumeId.value) await loadAnnotations(activeVolumeId.value);
}

// ==================== 欧式排版（二期） ====================
// 按辈分分组，同代横排格子（决策清单 §F3 layout:'ou'）
const ouGroups = computed(() => {
  const entries = volumeContent.value?.entries || [];
  const groups: { generation: number; entries: ShiluEntry[] }[] = [];
  for (const e of entries) {
    let g = groups.find((x) => x.generation === e.generation);
    if (!g) {
      g = { generation: e.generation, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups.sort((a, b) => a.generation - b.generation);
});

function ouEntryText(e: ShiluEntry): string {
  const rank = e.rank ? `第${e.rank} ` : '';
  const courtesy = e.courtesy_name ? `字${e.courtesy_name} ` : '';
  const years = e.birth_year
    ? `${e.birth_year}${e.death_year ? `-${e.death_year}` : e.is_living ? '-' : ''}`
    : '';
  const burial = e.burial_place ? `葬${e.burial_place}` : '';
  return `${rank}${e.full_name} ${courtesy}${years} ${burial}`.trim();
}

// ---------- 卷宗编辑（admin） ----------
const newVolumeDialog = ref(false);
const newVolumeTitle = ref('');
const newVolumeType = ref<'document' | 'shilu'>('document');

async function addVolume() {
  if (!newVolumeTitle.value.trim()) {
    ElMessage.warning('请输入卷标题');
    return;
  }
  try {
    await cepuApi.createVolume(clanId.value, {
      title: newVolumeTitle.value.trim(),
      type: newVolumeType.value,
      content: newVolumeType.value === 'document' ? '<p>（新卷内容）</p>' : undefined,
      config: newVolumeType.value === 'shilu' ? { gender_filter: 'all' } : undefined,
    });
    ElMessage.success('卷宗已创建');
    newVolumeDialog.value = false;
    newVolumeTitle.value = '';
    const data: any = await cepuApi.getVolumes(clanId.value);
    volumes.value = data as BookVolume[];
  } catch {
    /* 拦截器已提示 */
  }
}

async function moveVolume(index: number, dir: -1 | 1) {
  const target = index + dir;
  if (target < 0 || target >= volumes.value.length) return;
  const arr = [...volumes.value];
  [arr[index], arr[target]] = [arr[target], arr[index]];
  volumes.value = arr;
  await cepuApi.reorderVolumes(clanId.value, arr.map((v) => v.id));
  ElMessage.success('顺序已更新');
}

async function removeVolume(v: BookVolume) {
  await ElMessageBox.confirm(`确认删除「${v.title}」？`, '删除卷宗', { type: 'warning' });
  await cepuApi.deleteVolume(v.id);
  ElMessage.success('已删除');
  const data: any = await cepuApi.getVolumes(clanId.value);
  volumes.value = data as BookVolume[];
  if (activeVolumeId.value === v.id && volumes.value.length) {
    await selectVolume(volumes.value[0].id);
  }
}

async function saveDocument() {
  if (!activeVolumeId.value) return;
  await cepuApi.updateVolume(activeVolumeId.value, {
    content: volumeContent.value?.content ?? '',
  });
  ElMessage.success('内容已保存');
}

async function saveShiluConfig() {
  if (!activeVolumeId.value) return;
  await cepuApi.updateVolume(activeVolumeId.value, {
    config: volumeContent.value?.config ?? {},
  });
  ElMessage.success('筛选配置已保存，世录已重新生成');
  await selectVolume(activeVolumeId.value);
}

// ---------- 初始化 ----------
onMounted(async () => {
  await loadVolumes();
});
</script>

<template>
  <div class="cepu-page">
    <!-- 顶部工具栏 -->
    <header class="cepu-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" circle size="small" @click="router.push(`/tree/${clanId}`)" title="返回树谱" />
        <span class="page-title"><el-icon><Reading /></el-icon> 册谱</span>
        <el-tag v-if="isAdmin" size="small" type="warning">修谱管理员</el-tag>
        <el-tag v-else-if="shareMode && !hasLogin" size="small" type="info">只读分享</el-tag>
      </div>
      <div class="header-center">
        <el-input
          v-model="searchKeyword"
          placeholder="全文检索：姓名 / 字号 / 传记 / 葬地…"
          :prefix-icon="Search"
          clearable
          size="small"
          style="width: 280px"
          @keyup.enter="handleSearch"
          @clear="searchResults = null"
        />
        <el-popover v-if="searchResults" :visible="searchOpen" placement="bottom-start" :width="360" @hide="searchOpen = false">
          <template #reference>
            <span style="display:none" />
          </template>
          <div class="search-panel">
            <div v-if="searchResults.persons.length" class="search-group">
              <div class="search-group-title">人物（{{ searchResults.persons.length }}）</div>
              <div
                v-for="p in searchResults.persons.slice(0, 20)"
                :key="p.person_id"
                class="search-item"
                @click="openPerson(p.person_id, p.full_name)"
              >
                <span class="search-name">{{ p.full_name }}</span>
                <span v-if="p.courtesy_name" class="search-sub">字{{ p.courtesy_name }}</span>
                <span v-if="p.burial_place" class="search-sub">葬{{ p.burial_place }}</span>
              </div>
            </div>
            <div v-if="searchResults.volumes.length" class="search-group">
              <div class="search-group-title">卷宗（{{ searchResults.volumes.length }}）</div>
              <div
                v-for="v in searchResults.volumes"
                :key="v.id"
                class="search-item"
                @click="selectVolume(v.id)"
              >
                <span class="search-name">{{ v.title }}</span>
              </div>
            </div>
            <el-empty v-if="!searchResults.persons.length && !searchResults.volumes.length" description="未匹配到相关内容" :image-size="60" />
          </div>
        </el-popover>
      </div>
      <div class="header-right">
        <el-button v-if="isAdmin" :icon="Clock" size="small" @click="openVersionDialog" title="卷宗版本历史">版本历史</el-button>
        <el-button v-if="isAdmin" :icon="Share" size="small" @click="openShareDialog">分享</el-button>
        <el-dropdown trigger="click">
          <el-button :icon="Download" size="small" :loading="exportingPdf || exportingWord">导出</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="exportDialog = true">导出 PDF…</el-dropdown-item>
              <el-dropdown-item @click="exportDialog = true">导出 Word…</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button
          v-if="isAdmin"
          :type="editMode ? 'primary' : 'default'"
          :icon="Edit"
          size="small"
          @click="editMode = !editMode"
        >
          {{ editMode ? '完成编辑' : '编辑卷宗' }}
        </el-button>
      </div>
    </header>

    <div class="cepu-body">
      <!-- 左侧卷宗目录 -->
      <aside class="cepu-sidebar">
        <div class="sidebar-title">
          卷宗目录
          <el-button v-if="isAdmin && editMode" :icon="Plus" size="small" text type="primary" @click="newVolumeDialog = true">新增卷</el-button>
        </div>
        <div v-loading="loading" class="sidebar-list">
          <div
            v-for="(v, idx) in volumes"
            :key="v.id"
            class="sidebar-item"
            :class="{ active: activeVolumeId === v.id }"
            @click="selectVolume(v.id)"
          >
            <div class="sidebar-item-main">
              <el-tag size="small" :type="v.type === 'shilu' ? 'success' : 'info'" effect="plain">
                {{ v.type === 'shilu' ? '世录' : '文档' }}
              </el-tag>
              <span class="sidebar-item-title">{{ v.title }}</span>
            </div>
            <div v-if="isAdmin && editMode" class="sidebar-item-actions" @click.stop>
              <el-button :icon="Top" size="small" text :disabled="idx === 0" @click="moveVolume(idx, -1)" title="上移" />
              <el-button :icon="Bottom" size="small" text :disabled="idx === volumes.length - 1" @click="moveVolume(idx, 1)" title="下移" />
              <el-button :icon="Delete" size="small" text type="danger" @click="removeVolume(v)" title="删除" />
            </div>
          </div>
          <el-empty v-if="!loading && volumes.length === 0" description="暂无卷宗" :image-size="60" />
        </div>
      </aside>

      <!-- 主内容区（书本式阅读） -->
      <main class="cepu-main">
        <div v-if="loading" v-loading="true" class="cepu-loading" />
        <div v-else-if="accessError" class="access-error">
          <el-empty :description="accessError" :image-size="80" />
          <div class="access-error-actions">
            <el-button v-if="!hasLogin" type="primary" @click="router.push('/login')">去登录</el-button>
            <el-button v-else @click="loadVolumes">重试</el-button>
          </div>
        </div>
        <template v-else-if="volumeContent">
          <!-- 文档卷 -->
          <template v-if="volumeContent.type === 'document'">
            <h2 class="vol-title">{{ volumeContent.title }}</h2>
            <div v-if="!(isAdmin && editMode)" class="book-article" v-html="volumeContent.content || ''" />
            <div v-else class="book-editor">
              <el-input
                v-model="volumeContent.content"
                type="textarea"
                :rows="16"
                placeholder="支持 HTML（段落、图片、加粗、居中），导出 PDF 时保留排版"
              />
              <div class="editor-actions">
                <el-button type="primary" size="small" @click="saveDocument">保存内容</el-button>
              </div>
            </div>

            <!-- 文档批注（二期） -->
            <div class="volume-annotations">
              <h4 class="annotation-title">批注</h4>
              <div v-if="(annotations['para:doc'] || []).length" class="annotation-list">
                <div v-for="a in annotations['para:doc']" :key="a.id" class="annotation-item">
                  <span>{{ a.note }}</span>
                  <el-button v-if="isAdmin" text size="small" type="danger" @click="removeAnnotation(a)">删</el-button>
                </div>
              </div>
              <div v-if="isAdmin" class="annotation-add">
                <el-input v-model="docAnnotation" placeholder="添加文档批注（校对意见等）" size="small" />
                <el-button type="primary" size="small" @click="addDocAnnotation">添加</el-button>
              </div>
            </div>
          </template>

          <!-- 世录卷（苏式） -->
          <template v-else>
            <h2 class="vol-title">{{ volumeContent.title }}</h2>
            <!-- 筛选配置（admin 编辑态） -->
            <div v-if="isAdmin && editMode" class="shilu-config">
              <span class="config-label">排版：</span>
              <el-radio-group v-model="volumeContent.config.layout" size="small">
                <el-radio-button value="su">苏式</el-radio-button>
                <el-radio-button value="ou">欧式</el-radio-button>
              </el-radio-group>
              <span class="config-label">收录：</span>
              <el-radio-group v-model="volumeContent.config.gender_filter" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="male">仅男性</el-radio-button>
                <el-radio-button value="female">仅女性（闺秀）</el-radio-button>
              </el-radio-group>
              <el-checkbox v-model="volumeContent.config.hide_wife" size="small">隐藏妻子</el-checkbox>
              <el-checkbox v-model="volumeContent.config.hide_daughter" size="small">隐藏女儿</el-checkbox>
              <el-checkbox v-model="volumeContent.config.hide_son_in_law" size="small">隐藏女婿</el-checkbox>
              <el-checkbox v-model="volumeContent.config.hide_premature" size="small">隐藏夭折</el-checkbox>
              <el-button type="primary" size="small" @click="saveShiluConfig">应用并重新生成</el-button>
            </div>

            <!-- 苏式排版（默认） -->
            <div v-if="volumeContent.config?.layout !== 'ou'" class="shilu-entries">
              <div
                v-for="e in volumeContent.entries || []"
                :id="`shilu-${e.person_id}`"
                :key="e.person_id"
                class="shilu-entry"
                :class="{ focused: focusedEntryId === e.person_id }"
                @click="openPerson(e.person_id, e.full_name, e)"
              >
                <div class="shilu-gen">第{{ e.generation + 1 }}代</div>
                <div class="shilu-text">
                  <span class="entry-head">{{ entryHead(e) }}</span>
                  <span v-if="e.adoption_note" class="entry-note">（{{ e.adoption_note }}）</span>
                </div>
                <div v-if="e.biography" class="shilu-bio">{{ e.biography }}</div>
                <div v-if="e.achievements || e.anecdotes" class="shilu-extra">
                  <span v-if="e.achievements">{{ e.achievements }}</span>
                  <span v-if="e.anecdotes">{{ e.anecdotes }}</span>
                </div>
              </div>
              <el-empty v-if="!volumeContent.entries?.length" description="该卷暂无世录条目" :image-size="60" />
            </div>

            <!-- 欧式排版（二期）：世代分组格子对齐 -->
            <div v-else class="ou-entries">
              <div v-for="g in ouGroups" :key="g.generation" class="ou-group">
                <div class="ou-gen-title">第{{ g.generation + 1 }}代</div>
                <div class="ou-grid">
                  <div
                    v-for="e in g.entries"
                    :id="`shilu-${e.person_id}`"
                    :key="e.person_id"
                    class="ou-card"
                    :class="{ focused: focusedEntryId === e.person_id }"
                    @click="openPerson(e.person_id, e.full_name, e)"
                  >
                    <div class="ou-card-name">{{ e.full_name }}</div>
                    <div class="ou-card-text">{{ ouEntryText(e) }}</div>
                    <div v-if="e.biography" class="ou-card-bio">{{ e.biography }}</div>
                  </div>
                </div>
              </div>
              <el-empty v-if="!volumeContent.entries?.length" description="该卷暂无世录条目" :image-size="60" />
            </div>
          </template>
        </template>
        <el-empty v-else description="请选择卷宗" :image-size="80" />
      </main>

      <!-- 人物面板 -->
      <transition name="slide-right">
        <aside v-if="personPanel" class="person-panel">
          <div class="person-panel-header">
            <div>
              <h3>{{ personPanel.full_name }}</h3>
              <div v-if="personPanel.entry" class="person-panel-gen">第{{ personPanel.entry.generation + 1 }}代</div>
            </div>
            <el-button v-if="hasLogin" :icon="Location" type="primary" size="small" @click="jumpToTree(personPanel.person_id)">
              查看树谱位置
            </el-button>
          </div>

          <div v-if="personBio" class="person-bio-summary">
            <p v-if="personBio.courtesy_name"><b>字号：</b>{{ personBio.courtesy_name }}</p>
            <p v-if="personBio.native_place"><b>籍贯：</b>{{ personBio.native_place }}</p>
            <p v-if="personBio.burial_place"><b>葬地：</b>{{ personBio.burial_place }}</p>
            <p v-if="personBio.achievements"><b>功名：</b>{{ personBio.achievements }}</p>
            <p v-if="personBio.marital_notes"><b>配偶家世：</b>{{ personBio.marital_notes }}</p>
            <p v-if="personBio.adoption_note"><b>出继/兼祧：</b>{{ personBio.adoption_note }}</p>
            <p v-if="personBio.biography" class="bio-text">{{ personBio.biography }}</p>
            <p v-if="personBio.anecdotes" class="bio-text">{{ personBio.anecdotes }}</p>
          </div>

          <!-- 人物批注（二期） -->
          <div class="person-annotations">
            <h4 class="annotation-title">批注</h4>
            <div v-if="(annotations[`person:${personPanel.person_id}`] || []).length" class="annotation-list">
              <div v-for="a in annotations[`person:${personPanel.person_id}`]" :key="a.id" class="annotation-item">
                <span>{{ a.note }}</span>
                <el-button v-if="isAdmin" text size="small" type="danger" @click="removeAnnotation(a)">删</el-button>
              </div>
            </div>
            <div v-if="isAdmin" class="annotation-add">
              <el-input v-model="newAnnotation" placeholder="添加批注（校对意见等）" size="small" />
              <el-button type="primary" size="small" @click="addPersonAnnotation">添加</el-button>
            </div>
          </div>

          <template v-if="isAdmin">
            <el-button v-if="!bioEditing" :icon="Edit" size="small" @click="bioEditing = true">编辑传记资料</el-button>
            <div v-else class="bio-form">
              <el-input v-model="bioForm.courtesy_name" placeholder="字号" size="small" />
              <el-input v-model="bioForm.native_place" placeholder="籍贯" size="small" />
              <el-input v-model="bioForm.burial_place" placeholder="葬地" size="small" />
              <el-input v-model="bioForm.achievements" placeholder="功名" size="small" />
              <el-input v-model="bioForm.marital_notes" placeholder="配偶家世/岳家" size="small" />
              <el-input v-model="bioForm.adoption_note" placeholder="出继/兼祧标注" size="small" />
              <el-input v-model="bioForm.biography" type="textarea" :rows="5" placeholder="传记正文" />
              <el-input v-model="bioForm.anecdotes" type="textarea" :rows="3" placeholder="轶事" />
              <div class="bio-form-actions">
                <el-button type="primary" size="small" :loading="bioSaving" @click="saveBio">保存</el-button>
                <el-button size="small" @click="bioEditing = false">取消</el-button>
              </div>
            </div>
          </template>
          <el-button class="person-panel-close" text circle @click="personPanel = null">✕</el-button>
        </aside>
      </transition>
    </div>

    <!-- 新增卷宗对话框 -->
    <el-dialog v-model="newVolumeDialog" title="新增卷宗" width="420px">
      <el-form label-width="72px">
        <el-form-item label="卷标题">
          <el-input v-model="newVolumeTitle" placeholder="如：卷五 迁徙志" />
        </el-form-item>
        <el-form-item label="卷类型">
          <el-radio-group v-model="newVolumeType">
            <el-radio value="document">文档卷（谱序/艺文等史料）</el-radio>
            <el-radio value="shilu">世录卷（自动生成人物条目）</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newVolumeDialog = false">取消</el-button>
        <el-button type="primary" @click="addVolume">创建</el-button>
      </template>
    </el-dialog>

    <!-- 导出设置（二期：页眉页脚 / 批注输出） -->
    <el-dialog v-model="exportDialog" title="导出设置" width="440px">
      <el-form label-width="72px">
        <el-form-item label="页眉">
          <el-input v-model="exportOpts.header" placeholder="默认：族谱名 + 导出日期" />
        </el-form-item>
        <el-form-item label="页脚">
          <el-input v-model="exportOpts.footer" placeholder="默认：第 X 页 / 共 Y 页" />
        </el-form-item>
        <el-form-item label="批注">
          <el-checkbox v-model="exportOpts.withAnnotations">导出内容包含批注</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportDialog = false">取消</el-button>
        <el-button :loading="exportingWord" @click="doExportWord">导出 Word</el-button>
        <el-button type="primary" :loading="exportingPdf" @click="doExportPdf">导出 PDF</el-button>
      </template>
    </el-dialog>
    <!-- 分享只读链接（二期） -->
    <el-dialog v-model="shareDialog" title="分享只读链接" width="540px">
      <div class="share-create">
        <el-button type="primary" :icon="Share" :loading="generatingShare" @click="createShare">生成新链接</el-button>
        <span class="share-hint">持有链接者无需登录即可只读查看本族册谱</span>
      </div>
      <div v-if="shareLinks.length" class="share-list">
        <div v-for="l in shareLinks" :key="l.token" class="share-item">
          <el-input :model-value="`${location.origin}${l.url}`" readonly size="small" />
          <el-button size="small" @click="copyShare(l.url)">复制</el-button>
          <el-button size="small" type="danger" text @click="revokeShare(l.token)">撤销</el-button>
        </div>
      </div>
      <el-empty v-else description="暂无分享链接" :image-size="60" />
    </el-dialog>
    <!-- 卷宗版本历史（二期） -->
    <el-dialog v-model="versionDialog" title="卷宗版本历史" width="560px">
      <div class="version-list">
        <div v-for="v in versions" :key="v.id" class="version-item">
          <div class="version-main">
            <el-tag size="small" type="info">v{{ v.version }}</el-tag>
            <div class="version-meta">
              <div class="version-title">{{ v.title }}</div>
              <div class="version-time">{{ new Date(v.created_at).toLocaleString('zh-CN') }} · {{ v.created_by }}</div>
            </div>
          </div>
          <el-button size="small" text type="warning" @click="restoreVersion(v)">回滚</el-button>
        </div>
        <el-empty v-if="!versions.length" description="暂无版本记录" :image-size="60" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.cepu-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #faf8f5;
  font-family: 'Songti SC', 'SimSun', 'Microsoft YaHei', serif;
}
.cepu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 252, 248, 0.96);
  border-bottom: 1px solid #e4e0d8;
  box-shadow: 0 1px 6px rgba(93, 64, 55, 0.06);
  z-index: 5;
}
.header-left, .header-right, .header-center {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-title {
  font-family: 'KaiTi', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: #5d4037;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cepu-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.cepu-sidebar {
  width: 260px;
  border-right: 1px solid #ece7df;
  background: #fdfbf5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-weight: 600;
  color: #5d4037;
  border-bottom: 1px solid #ece7df;
}
.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.sidebar-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}
.sidebar-item:hover { background: #f5f0e8; }
.sidebar-item.active { background: #fdf3dc; outline: 1px solid #d4b98a; }
.sidebar-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sidebar-item-title {
  font-size: 13px;
  color: #3e3a35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-item-actions {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}
.cepu-main {
  flex: 1;
  overflow-y: auto;
  padding: 28px 40px 60px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
.vol-title {
  font-family: 'KaiTi', 'Songti SC', serif;
  text-align: center;
  color: #5d4037;
  font-size: 24px;
  border-bottom: 2px solid #d8cbb0;
  padding-bottom: 12px;
  margin: 0 0 24px;
}
.book-article {
  line-height: 1.9;
  font-size: 15px;
  color: #3e3a35;
  text-indent: 2em;
}
.book-article :deep(img) {
  max-width: 100%;
  margin: 8px auto;
  display: block;
}
.book-editor .editor-actions {
  margin-top: 10px;
  text-align: right;
}
.shilu-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: #fdf6e6;
  border: 1px solid #eadfc8;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
}
.config-label { font-size: 13px; color: #5d4037; font-weight: 600; }
.shilu-entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.shilu-entry {
  border-left: 3px solid transparent;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  page-break-inside: avoid;
}
.shilu-entry:hover { background: #f7f1e6; }
.shilu-entry.focused {
  background: #fdf3dc;
  border-left-color: #c9a96e;
  animation: flash 2s ease;
}
@keyframes flash {
  0%, 60% { background: #f7e7b8; }
  100% { background: #fdf3dc; }
}
.shilu-gen {
  font-size: 11px;
  color: #b39b7f;
  margin-bottom: 2px;
}
.entry-head {
  font-size: 15px;
  line-height: 1.9;
  color: #3e3a35;
}
.entry-note { color: #a1887f; font-size: 13px; }
.shilu-bio {
  margin: 4px 0 0 1em;
  font-size: 14px;
  line-height: 1.9;
  color: #5a534a;
  text-indent: 2em;
}
.shilu-extra {
  margin: 2px 0 0 1em;
  font-size: 13px;
  color: #8d6e63;
}
.person-panel {
  width: 340px;
  border-left: 1px solid #ece7df;
  background: #fdfbf5;
  padding: 18px;
  overflow-y: auto;
  position: relative;
  box-shadow: -4px 0 16px rgba(93, 64, 55, 0.06);
}
.person-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.person-panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #3e3a35;
  font-family: 'KaiTi', 'Songti SC', serif;
}
.person-panel-gen { font-size: 12px; color: #b39b7f; margin-top: 2px; }
.person-bio-summary p {
  margin: 6px 0;
  font-size: 13.5px;
  line-height: 1.8;
  color: #4a453e;
}
.person-bio-summary .bio-text { text-indent: 2em; }
.bio-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.bio-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
.person-panel-close {
  position: absolute;
  top: 8px;
  right: 8px;
}
.search-panel {
  max-height: 320px;
  overflow-y: auto;
}
.search-group { margin-bottom: 8px; }
.search-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #8d6e63;
  padding: 4px 0;
}
.search-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.search-item:hover { background: #f5f0e8; }
.search-name { font-weight: 600; color: #3e3a35; }
.search-sub { font-size: 12px; color: #8d6e63; }
.slide-right-enter-active, .slide-right-leave-active { transition: margin-right 0.2s ease; }
.cepu-loading { height: 100%; }

/* [二期] 批注 */
.volume-annotations, .person-annotations {
  margin-top: 16px;
  border-top: 1px dashed #e0d5c0;
  padding-top: 10px;
}
.annotation-title {
  font-size: 13px;
  color: #8d6e63;
  margin: 0 0 6px;
  font-weight: 600;
}
.annotation-list { display: flex; flex-direction: column; gap: 4px; }
.annotation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fdf6e6;
  border: 1px solid #eadfc8;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12.5px;
  color: #6d5c4a;
}
.annotation-add {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

/* [二期] 欧式排版 */
.ou-group { margin-bottom: 18px; }
.ou-gen-title {
  font-family: 'KaiTi', 'Songti SC', serif;
  font-size: 16px;
  color: #5d4037;
  border-left: 4px solid #c9a96e;
  padding-left: 10px;
  margin-bottom: 8px;
}
.ou-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.ou-card {
  background: #fffdf8;
  border: 1px solid #ece3d2;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: box-shadow 0.15s, background 0.15s;
}
.ou-card:hover { box-shadow: 0 2px 10px rgba(93, 64, 55, 0.1); background: #fdf9ef; }
.ou-card.focused {
  background: #fdf3dc;
  border-color: #c9a96e;
  animation: flash 2s ease;
}
.ou-card-name {
  font-family: 'KaiTi', 'Songti SC', serif;
  font-size: 16px;
  font-weight: 600;
  color: #3e3a35;
  margin-bottom: 4px;
}
.ou-card-text { font-size: 12.5px; color: #7a6f60; line-height: 1.6; }
.ou-card-bio {
  margin-top: 6px;
  font-size: 12.5px;
  color: #5a534a;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* [二期] 分享只读链接 */
.share-create {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.share-hint { font-size: 12px; color: #8d6e63; }
.share-list { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
.share-item { display: flex; align-items: center; gap: 6px; }

/* [二期] 版本历史 */
.version-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fdfbf5;
  border: 1px solid #ece7df;
  border-radius: 8px;
  padding: 8px 10px;
}
.version-main { display: flex; align-items: center; gap: 10px; }
.version-meta { line-height: 1.5; }
.version-title { font-size: 13px; color: #3e3a35; }
.version-time { font-size: 11px; color: #a0a0a0; }
.access-error { text-align: center; padding: 40px 0; }
.access-error-actions { display: flex; justify-content: center; gap: 10px; }
@media (max-width: 900px) {
  .cepu-sidebar { width: 200px; }
  .cepu-main { padding: 20px 18px 40px; }
  .person-panel { width: 300px; }
}
@media (max-width: 640px) {
  .cepu-sidebar { display: none; }
  .person-panel { position: fixed; right: 0; top: 56px; bottom: 0; z-index: 20; }
  .header-center .el-input { width: 160px; }
}
</style>
