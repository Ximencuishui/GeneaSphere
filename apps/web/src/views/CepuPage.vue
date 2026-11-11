<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
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
  Loading,
} from '@element-plus/icons-vue';
import { cepuApi, type BookVolume, type ShiluEntry, type PersonBio } from '@/api/cepu';
import EuropeanChartView from '@/components/EuropeanChartView.vue';
import SuChartView from '@/components/SuChartView.vue';
import BiographyBook from '@/components/BiographyBook.vue';
import NameIndexBook from '@/components/NameIndexBook.vue';
import BookCatalog from '@/components/BookCatalog.vue';
import GenerationIndexBook from '@/components/GenerationIndexBook.vue';
import { europeanChartsFromShilu, europeanViewFromShilu } from '@/utils/european-chart-shilu';
import { buildBookCatalog, findCatalogVolume, isLadiesVolume, type BookProfile, type CatalogEntry } from '@/utils/book-catalog';
import { SU_FRAME_WEIGHTS_PT, suFrameWeightPt } from '@/utils/su-chart';
import type { ContinueNoteMode } from '@/utils/continue-note';

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
  rulesText?: string;
  config?: any;
  entries?: ShiluEntry[];
} | null>(null);
const loading = ref(false);
// 单卷内容加载态（世录卷为实时生成，数据量大时耗时明显，需要进度提示避免误以为卡住）
const volumeLoading = ref(false);
const volumeLoadingText = ref('正在加载卷宗内容…');
const editMode = ref(false);

// ---------- 临时样式切换（仅影响当前阅读，不保存） ----------
const tempLayout = ref<'su' | 'ou' | 'ou_chart' | 'shixi_table' | 'biography'>('su');
const bookScript = ref<'horizontal' | 'antique'>('horizontal');
const titleVertical = ref(false);
const chartPack = ref<'exclusive' | 'share'>('exclusive');
const bookZoom = ref(1);
const bookContinuous = ref(false);
/** 只作用于苏式。切到欧式时按钮隐藏，状态留着，切回来还是上次的选择。默认画出垂珠。 */
const suBeadLines = ref(true);
/** 版本A页面外围的均匀细线版框。仿古版不使用。默认显示。 */
const suShowFrame = ref(true);
/** 版本A版框线宽，四边同一数值，默认 4pt。 */
const suFramePt = ref(4);
/** 版本A人物头像。仿古版不使用。默认显示已有头像。 */
const suShowAvatars = ref(true);
/** 接续标注。版本A默认新式详注，版本B默认古式简注。欧式跟同一个开关。 */
const continueNote = ref<ContinueNoteMode>('full');
watch(bookScript, (script) => {
  continueNote.value = script === 'antique' ? 'brief' : 'full';
});
const suFrameWeights = SU_FRAME_WEIGHTS_PT;
const bookZoomLabel = computed(() => `${Math.round(bookZoom.value * 100)}%`);

function zoomBook(delta: number) {
  const next = Math.round((bookZoom.value + delta) * 10) / 10;
  bookZoom.value = Math.min(2, Math.max(0.6, next));
}

function onLayoutChange(val: string | number | boolean | undefined) {
  // 临时切换样式，仅影响页面渲染，不修改卷宗配置
  if (volumeContent.value?.config && typeof val === 'string') {
    volumeContent.value.config._tempLayout = val as 'su' | 'ou' | 'ou_chart' | 'shixi_table' | 'biography';
  }
}

// 用于模板中获取当前域名
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

const searchKeyword = ref('');
const searchResults = ref<{ persons: any[]; volumes: any[] } | null>(null);
const searchOpen = ref(false);

// 当前生效的排版样式（优先使用临时切换，否则使用卷宗配置）
const effectiveLayout = computed(() => {
  if (volumeContent.value?.config?._tempLayout) return volumeContent.value.config._tempLayout;
  return volumeContent.value?.config?.layout || 'su';
});

/** 欧式不再是卡片墙。旧配置 ou 和新版式 ou_chart 都走五世一表。 */
const isOuChart = computed(() => effectiveLayout.value === 'ou' || effectiveLayout.value === 'ou_chart');
const isSuChart = computed(() => (
  volumeContent.value?.type === 'shilu'
  && !isBiography.value
  && !isLadies.value
  && effectiveLayout.value === 'su'
));
const isLineageChart = computed(() => isOuChart.value || isSuChart.value);
const isLadies = computed(() => {
  const volume = volumeContent.value;
  if (!volume) return false;
  return volume.config?.gender_filter === 'female' || String(volume.title).includes('闺秀');
});
const isBiography = computed(() => volumeContent.value?.config?.layout === 'biography' && !isLadies.value);
const bookProfile = ref<BookProfile>('compact');
const viewingCatalog = ref(true);
const viewingIndex = ref(false);
const viewingGeneration = ref(false);
const placeholderEntry = ref<CatalogEntry | null>(null);
const generationRows = ref<{ generation: number; character: string; note?: string | null }[]>([]);
const indexEntries = ref<ShiluEntry[]>([]);
const catalog = computed(() => buildBookCatalog(volumes.value, bookProfile.value));
const lineageModel = computed(() => europeanViewFromShilu(volumeContent.value?.entries || []));
const ouChartModel = computed(() => europeanChartsFromShilu(volumeContent.value?.entries || []));

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
    const [data, profile] = await Promise.all([
      cepuApi.getVolumes(clanId.value, shareToken.value),
      cepuApi.getBookProfile(clanId.value, shareToken.value).catch(() => ({ profile: 'compact' as const })),
    ]);
    volumes.value = (data || []) as BookVolume[];
    bookProfile.value = profile?.profile === 'standard' ? 'standard' : 'compact';
    if (!activeVolumeId.value && !viewingIndex.value && !viewingGeneration.value) {
      openCatalog();
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

// 卷宗切换请求序号：丢弃过期响应，避免旧请求复位共享加载态或覆盖新卷内容（审计 2026-08-28）
let volumeReqSeq = 0;

function clearBookView() {
  viewingCatalog.value = false;
  viewingIndex.value = false;
  viewingGeneration.value = false;
  placeholderEntry.value = null;
}

function openCatalog() {
  clearBookView();
  viewingCatalog.value = true;
  activeVolumeId.value = null;
  volumeContent.value = null;
}

function catalogActive(entry: CatalogEntry) {
  if (entry.kind === 'index') return viewingIndex.value;
  if (entry.kind === 'generation') return viewingGeneration.value;
  if (entry.kind === 'placeholder') return placeholderEntry.value?.key === entry.key;
  return Boolean(entry.volumeId) && activeVolumeId.value === entry.volumeId && !viewingCatalog.value && !viewingIndex.value && !viewingGeneration.value;
}

async function saveBookProfile(value: string | number | boolean | undefined) {
  const next: BookProfile = value === 'standard' ? 'standard' : 'compact';
  bookProfile.value = next;
  if (next === 'compact' && (viewingGeneration.value || placeholderEntry.value)) openCatalog();
  if (!isAdmin.value) return;
  try {
    await cepuApi.setBookProfile(clanId.value, next);
  } catch {
    ElMessage.error('谱书复杂度没有保存');
  }
}

async function openFromCatalog(entry: CatalogEntry) {
  if (entry.kind === 'group') return;
  if (entry.kind === 'index') return openNameIndex();
  if (entry.kind === 'generation') return openGeneration();
  if (entry.kind === 'placeholder' || !entry.volumeId) {
    clearBookView();
    placeholderEntry.value = entry;
    activeVolumeId.value = null;
    volumeContent.value = null;
    return;
  }
  await selectVolume(entry.volumeId);
}

async function openGeneration() {
  clearBookView();
  viewingGeneration.value = true;
  activeVolumeId.value = null;
  volumeContent.value = null;
  volumeLoadingText.value = '正在整理字辈索引…';
  const reqSeq = ++volumeReqSeq;
  volumeLoading.value = true;
  try {
    const rows: any = await cepuApi.getGenerationIndex(clanId.value, shareToken.value);
    if (reqSeq !== volumeReqSeq || !viewingGeneration.value) return;
    generationRows.value = rows || [];
  } catch {
    if (reqSeq === volumeReqSeq) generationRows.value = [];
  } finally {
    if (reqSeq === volumeReqSeq) volumeLoading.value = false;
  }
}

async function selectVolume(id: string) {
  clearBookView();
  activeVolumeId.value = id;
  volumeContent.value = null;
  searchOpen.value = false;
  annotations.value = {};
  // 世录卷由后端实时汇总全族人物关系生成（首次约 5-15 秒，后端已缓存，再次打开秒开），文档卷直接读取内容，文案区分提示
  const vol = volumes.value.find((v) => v.id === id);
  volumeLoadingText.value =
    vol?.type === 'shilu'
      ? '正在生成世录条目：实时汇总全族人物关系，首次约需 5~15 秒，请勿关闭页面（再次打开将秒开）…'
      : '正在加载卷宗内容…';
  const reqSeq = ++volumeReqSeq;
  volumeLoading.value = true;
  try {
    const data: any = await cepuApi.getVolume(clanId.value, id, shareToken.value);
    if (reqSeq !== volumeReqSeq) return; // 已切换到其他卷，丢弃过期响应
    volumeContent.value = data;
    // 同步临时样式为卷宗配置的布局
    if (data?.config?.layout === 'ou' || data?.config?.layout === 'ou_chart') {
      tempLayout.value = 'ou_chart';
    } else if (data?.config?.layout) {
      tempLayout.value = data.config.layout;
    } else {
      tempLayout.value = 'su';
    }
    if (hasLogin.value) loadAnnotations(id);
    if (isLadiesVolume({ id, title: data?.title || '', type: data?.type || '', config: data?.config }) && !indexEntries.value.length) {
      const lineage = findCatalogVolume(volumes.value, 'lineage');
      if (lineage) {
        const lineageData: any = await cepuApi.getVolume(clanId.value, lineage.id, shareToken.value);
        if (reqSeq === volumeReqSeq) indexEntries.value = lineageData?.entries || [];
      }
    }
    nextTick(() => applyFocus());
  } catch {
    /* 拦截器已提示 */
  } finally {
    if (reqSeq === volumeReqSeq) volumeLoading.value = false;
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

function openChartPerson(personId: string) {
  const entry = volumeContent.value?.entries?.find((item) => String(item.person_id) === personId);
  openPerson(personId, entry?.full_name || personId, entry);
}

function scrollToId(id: string, left = 12) {
  const node = document.getElementById(id);
  if (node) {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (left > 0) requestAnimationFrame(() => scrollToId(id, left - 1));
}

async function openNameIndex() {
  clearBookView();
  viewingIndex.value = true;
  activeVolumeId.value = null;
  volumeContent.value = null;
  searchOpen.value = false;
  const lineage = findCatalogVolume(volumes.value, 'lineage');
  if (!lineage) {
    indexEntries.value = [];
    return;
  }
  volumeLoadingText.value = '正在生成人名索引：对照世系图号与人物传，请稍候…';
  const reqSeq = ++volumeReqSeq;
  volumeLoading.value = true;
  try {
    const data: any = await cepuApi.getVolume(clanId.value, lineage.id, shareToken.value);
    if (reqSeq !== volumeReqSeq || !viewingIndex.value) return;
    indexEntries.value = data?.entries || [];
  } catch {
    if (reqSeq === volumeReqSeq) indexEntries.value = [];
  } finally {
    if (reqSeq === volumeReqSeq) volumeLoading.value = false;
  }
}

async function openBiographyFromChart(payload: { name: string; chartNo: number; citeBook?: string; anchorId?: string }) {
  const volume = findCatalogVolume(volumes.value, payload.citeBook === '闺秀录' ? 'ladies' : 'biography')
    ?? findCatalogVolume(volumes.value, 'biography');
  if (!volume) return;
  if (activeVolumeId.value !== volume.id) await selectVolume(volume.id);
  await nextTick();
  scrollToId(payload.anchorId || `bio-${payload.name}-${payload.chartNo}`);
}

async function openChartFromBiography(payload: number | { chartNo: number; style?: 'ou' | 'su' }) {
  const chartNo = typeof payload === 'number' ? payload : payload.chartNo;
  const style = typeof payload === 'number' ? 'ou' : (payload.style ?? 'ou');
  const volume = findCatalogVolume(volumes.value, 'lineage');
  if (!volume) return;
  if (activeVolumeId.value !== volume.id) await selectVolume(volume.id);
  const layout = style === 'su' ? 'su' : 'ou_chart';
  tempLayout.value = layout;
  if (volumeContent.value?.config) volumeContent.value.config._tempLayout = layout;
  await nextTick();
  scrollToId(style === 'su' ? `tree-su-${chartNo}` : `tree-${chartNo}`);
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
const exportOpts = ref({
  header: '',
  footer: '',
  withAnnotations: false,
  layout: undefined as undefined | 'su' | 'ou' | 'ou_chart' | 'shixi_table',
  edition: 'electronic' as 'electronic' | 'print',
});

function openExportDialog() {
  const layout = effectiveLayout.value;
  exportOpts.value.layout = layout === 'ou' || layout === 'ou_chart'
    ? 'ou_chart'
    : layout === 'shixi_table' || layout === 'su'
      ? layout
      : undefined;
  exportDialog.value = true;
}

async function doExportPdf() {
  exportingPdf.value = true;
  try {
    const url = cepuApi.exportPdfUrl(
      clanId.value,
      {
        header: exportOpts.value.header || undefined,
        footer: exportOpts.value.footer || undefined,
        withAnnotations: exportOpts.value.withAnnotations,
        layout: exportOpts.value.layout,
        edition: exportOpts.value.edition,
        script: bookScript.value,
        titleVertical: bookScript.value === 'antique' && titleVertical.value,
        pack: chartPack.value,
        profile: bookProfile.value,
        beadLines: suBeadLines.value,
        showFrame: bookScript.value === 'horizontal' && suShowFrame.value,
        framePt: suFrameWeightPt(suFramePt.value),
        continueNote: continueNote.value,
        showAvatars: bookScript.value === 'horizontal' && suShowAvatars.value,
      },
      shareToken.value,
    );
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
      cepuApi.exportWordUrl(
        clanId.value,
        {
          withAnnotations: exportOpts.value.withAnnotations,
          layout: exportOpts.value.layout,
          script: bookScript.value,
          titleVertical: bookScript.value === 'antique' && titleVertical.value,
          pack: chartPack.value,
          profile: bookProfile.value,
          beadLines: suBeadLines.value,
          showFrame: bookScript.value === 'horizontal' && suShowFrame.value,
          framePt: suFrameWeightPt(suFramePt.value),
          continueNote: continueNote.value,
          showAvatars: bookScript.value === 'horizontal' && suShowAvatars.value,
        },
        shareToken.value,
      ),
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

// === PR#1 世系表开本预览(与后端 PDF 排版同构) ===
type ShixiDensity = 'normal' | 'condense' | 'condense-strong';
type ShixiPageSpec = {
  title: string;
  gens: number[]; // 标准页使用的世代列表
  density: ShixiDensity;
  isSplitCol: boolean; // 单代左右双列模式
  splitColGen?: number; // 双列模式下的世代
  splitColEntries?: ShiluEntry[]; // 双列模式下的全部人员
  splitColHalf?: number; // 双列分割点
};

function pickShixiDensity(chunkGens: number[], byGen: Map<number, ShiluEntry[]>): ShixiDensity {
  let maxPerGen = 0;
  for (const g of chunkGens) {
    const list = byGen.get(g) || [];
    if (list.length > maxPerGen) maxPerGen = list.length;
  }
  if (maxPerGen > 12) return 'condense-strong';
  if (maxPerGen > 6) return 'condense';
  return 'normal';
}

/**
 * 世系表条目 HTML：
 * 【姓名块】+【说明块】双列结构。
 * 【说明块】内部使用**多列布局**——每个信息字段(生卒/字号/籍贯/葬地/配偶/子女/功名/轶事/传记)
 * 各自独立为一列,从右向左依次展开。这是传统中式族谱的标准排版:
 *   姓名在最右,左侧每一列是一个独立的信息字段,像“古籍附录”一样从右往左读。
 * 不同于之前的“单列贯通+全角空格分隔”,多列布局让长说明不再被压缩到单一窄列中。
 */
function shixiEntryHtml(e: ShiluEntry): string {
  // 每个字段一个独立 div,字段间不需额外间隔(靠 box 间隔表达间距)
  const fieldSpans: string[] = [];
  // 生卒年份(深灰色)
  if (e.birth_year || e.death_year || e.is_living) {
    const b = e.birth_year ? `${e.birth_year}` : '?';
    const d = e.is_living ? '今' : e.death_year ? `${e.death_year}` : '?';
    fieldSpans.push(`<div class="shixi-year">${b}—${d}</div>`);
  }
  // 字号
  if (e.courtesy_name) fieldSpans.push(`<div class="shixi-line">字${escapeHtml(e.courtesy_name)}</div>`);
  // 籍贯
  if (e.native_place) fieldSpans.push(`<div class="shixi-line">籍${escapeHtml(e.native_place)}</div>`);
  // 葬地
  if (e.burial_place) fieldSpans.push(`<div class="shixi-line">葬${escapeHtml(e.burial_place)}</div>`);
  // 配偶(多配偶中间用逗号分隔,多个配偶同占一列)
  if (e.spouses.length) {
    const sStr = e.spouses
      .map((s) => `${escapeHtml(s.name)}${s.native_place ? `（${escapeHtml(s.native_place)}）` : ''}`)
      .join('、');
    fieldSpans.push(`<div class="shixi-spouse">配${sStr}</div>`);
  }
  // 子女(同列,中间用顿号)
  if (e.children.length) {
    const cStr = e.children
      .map((c) => `${escapeHtml(c.name)}${c.child_type && c.child_type !== 'BIOLOGICAL' ? '（继）' : ''}`)
      .join('、');
    fieldSpans.push(`<div class="shixi-children">子:${cStr}</div>`);
  }
  // 功名(棕褐色加粗)
  if (e.achievements) fieldSpans.push(`<div class="shixi-achievement">${escapeHtml(e.achievements)}</div>`);
  // 轶事(与功名同色)
  if (e.anecdotes) fieldSpans.push(`<div class="shixi-achievement">${escapeHtml(e.anecdotes)}</div>`);
  // 传记正文(独立列,可能较长)
  if (e.biography) fieldSpans.push(`<div class="shixi-bio">${escapeHtml(e.biography)}</div>`);
  // 双块结构:姓名块(独立列,红大字) + 说明块(姓名左侧,多列)
  const infoHtml = fieldSpans.length > 0
    ? `<div class="shixi-info">${fieldSpans.join('')}</div>`
    : '';
  return `
    <div class="shixi-person">
      <div class="shixi-name">${escapeHtml(e.full_name)}</div>
      ${infoHtml}
    </div>`.trim();
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const HARD_LIMIT = 16;
const shixiTablePages = computed(() => {
  const entries = volumeContent.value?.entries || [];
  const cfg = (volumeContent.value?.config || {}) as any;
  const pageGen = Math.max(1, Math.min(20, cfg.page_gen_count ?? 5));
  const byGen = new Map<number, ShiluEntry[]>();
  for (const e of entries) {
    if (!byGen.has(e.generation)) byGen.set(e.generation, []);
    byGen.get(e.generation)!.push(e);
  }
  // 排序:rank 升序
  for (const arr of byGen.values()) {
    arr.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }
  const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
  const pages: ShixiPageSpec[] = [];
  for (let i = 0; i < sortedGens.length; i += pageGen) {
    const chunkGens = sortedGens.slice(i, i + pageGen);
    let maxPerGen = 0;
    for (const g of chunkGens) {
      const list = byGen.get(g) || [];
      if (list.length > maxPerGen) maxPerGen = list.length;
    }
    if (maxPerGen <= HARD_LIMIT) {
      // 正常一页 + 自动密集模式
      const min = chunkGens[0];
      const max = chunkGens[chunkGens.length - 1];
      const title = chunkGens.length === 1
        ? `族谱第${min + 1}世世系表`
        : `族谱第${min + 1}世至第${max + 1}世世系表`;
      pages.push({
        title,
        gens: chunkGens,
        density: pickShixiDensity(chunkGens, byGen),
        isSplitCol: false,
      });
    } else {
      // chunk 内有单代人数过多:逐代渲染(>16 用 split-page,其它用标准)
      for (const g of chunkGens) {
        const list = byGen.get(g) || [];
        if (list.length <= HARD_LIMIT) {
          const title = `族谱第${g + 1}世世系表`;
          pages.push({
            title,
            gens: [g],
            density: pickShixiDensity([g], byGen),
            isSplitCol: false,
          });
        } else {
          const half = Math.ceil(list.length / 2);
          pages.push({
            title: `族谱第${g + 1}世世系表(${list.length}人)`,
            gens: [],
            density: 'condense-strong',
            isSplitCol: true,
            splitColGen: g,
            splitColEntries: list,
            splitColHalf: half,
          });
        }
      }
    }
  }
  return { cfg, pages, byGen };
});

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

const isFamilyRulesVolume = computed(() => (volumeContent.value?.title || '').includes('家训'));

async function saveDocument() {
  if (!activeVolumeId.value) return;
  const sharedRules = isFamilyRulesVolume.value;
  await cepuApi.updateVolume(activeVolumeId.value, {
    content: sharedRules
      ? (volumeContent.value?.rulesText ?? volumeContent.value?.content ?? '')
      : (volumeContent.value?.content ?? ''),
  });
  if (sharedRules) await selectVolume(activeVolumeId.value);
  ElMessage.success(sharedRules ? '家训已保存，家族概况同步更新' : '内容已保存');
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
        <!-- 样式切换（仅世录卷显示，对所有用户可见） -->
        <template v-if="volumeContent?.type === 'shilu'">
          <el-radio-group v-model="tempLayout" size="small" @change="onLayoutChange">
            <el-radio-button value="su">苏式</el-radio-button>
            <el-radio-button value="ou_chart">欧式</el-radio-button>
            <el-radio-button value="shixi_table">世系表</el-radio-button>
          </el-radio-group>
        </template>
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
              <el-dropdown-item @click="openExportDialog">导出 PDF…</el-dropdown-item>
              <el-dropdown-item @click="openExportDialog">导出 Word…</el-dropdown-item>
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
          总目录
          <el-button v-if="isAdmin && editMode" :icon="Plus" size="small" text type="primary" @click="newVolumeDialog = true">新增卷</el-button>
        </div>
        <div class="book-profile-bar">
          <span class="book-profile-label">谱书复杂度</span>
          <el-radio-group :model-value="bookProfile" size="small" :disabled="!isAdmin" @change="saveBookProfile">
            <el-radio-button value="compact">精简谱</el-radio-button>
            <el-radio-button value="standard">标准宗谱</el-radio-button>
          </el-radio-group>
        </div>
        <div v-loading="loading" class="sidebar-list">
          <div class="sidebar-item" :class="{ active: viewingCatalog }" @click="openCatalog">
            <div class="sidebar-item-main">
              <el-tag size="small" effect="plain">目录</el-tag>
              <span class="sidebar-item-title">总目录</span>
            </div>
          </div>
          <div
            v-for="entry in catalog"
            :key="entry.key"
            class="sidebar-item"
            :class="{ active: catalogActive(entry), 'is-child': entry.depth > 0, 'is-group': entry.kind === 'group' }"
            @click="openFromCatalog(entry)"
          >
            <div class="sidebar-item-main">
              <el-tag v-if="entry.tag" size="small" :type="entry.tag === '传志' ? 'warning' : entry.tag === '世录' ? 'success' : 'info'" effect="plain">
                {{ entry.tag }}
              </el-tag>
              <span class="sidebar-item-title">{{ entry.marker === 'last' ? '└ ' : entry.marker === 'mid' ? '├ ' : '' }}{{ entry.text }}</span>
            </div>
          </div>
          <template v-if="isAdmin && editMode">
            <div class="sidebar-edit-title">卷宗原稿</div>
            <div
              v-for="(v, idx) in volumes"
              :key="v.id"
              class="sidebar-item"
              @click="selectVolume(v.id)"
            >
              <div class="sidebar-item-main">
                <span class="sidebar-item-title">{{ v.title }}</span>
              </div>
              <div class="sidebar-item-actions" @click.stop>
                <el-button :icon="Top" size="small" text :disabled="idx === 0" @click="moveVolume(idx, -1)" title="上移" />
                <el-button :icon="Bottom" size="small" text :disabled="idx === volumes.length - 1" @click="moveVolume(idx, 1)" title="下移" />
                <el-button :icon="Delete" size="small" text type="danger" @click="removeVolume(v)" title="删除" />
              </div>
            </div>
          </template>
          <el-empty v-if="!loading && volumes.length === 0" description="暂无卷宗" :image-size="60" />
        </div>
      </aside>

      <!-- 主内容区（书本式阅读） -->
      <main class="cepu-main" :class="{ 'is-book-page': isLineageChart || isBiography || isLadies || viewingIndex || viewingCatalog || viewingGeneration || placeholderEntry }">
        <div v-if="(isLineageChart || isBiography || isLadies || viewingIndex || viewingCatalog || viewingGeneration || placeholderEntry) && !loading && !volumeLoading && !accessError" class="book-script-bar">
          <el-radio-group v-model="bookScript" size="small">
            <el-radio-button value="horizontal">横排简体（版本A）</el-radio-button>
            <el-radio-button value="antique">仿古竖排线装（版本B）</el-radio-button>
          </el-radio-group>
          <button
            v-if="isSuChart"
            type="button"
            class="su-bead-toggle"
            :class="{ 'is-active': suBeadLines }"
            :aria-pressed="suBeadLines"
            @click="suBeadLines = !suBeadLines"
          >{{ suBeadLines ? '隐藏垂珠连线' : '显示垂珠连线' }}</button>
          <button
            v-if="isSuChart && bookScript === 'horizontal'"
            type="button"
            class="su-bead-toggle su-frame-toggle"
            :class="{ 'is-active': suShowFrame }"
            :aria-pressed="suShowFrame"
            @click="suShowFrame = !suShowFrame"
          >{{ suShowFrame ? '隐藏版框' : '显示版框' }}</button>
          <label v-if="isSuChart && bookScript === 'horizontal' && suShowFrame" class="su-frame-weight">
            版框
            <select v-model.number="suFramePt" aria-label="版框线宽">
              <option v-for="weight in suFrameWeights" :key="weight" :value="weight">{{ weight }}pt</option>
            </select>
          </label>
          <button
            v-if="isSuChart && bookScript === 'horizontal'"
            type="button"
            class="su-bead-toggle su-avatar-toggle"
            :class="{ 'is-active': suShowAvatars }"
            :aria-pressed="suShowAvatars"
            @click="suShowAvatars = !suShowAvatars"
          >{{ suShowAvatars ? '隐藏人物头像' : '显示人物头像' }}</button>
          <el-radio-group v-if="isLineageChart" v-model="continueNote" class="continue-note-toggle" size="small">
            <el-radio-button value="brief">古式简注</el-radio-button>
            <el-radio-button value="full">新式详注</el-radio-button>
          </el-radio-group>
          <el-checkbox v-if="bookScript === 'antique'" v-model="titleVertical" size="small">标题竖排居右</el-checkbox>
          <el-radio-group v-if="isLineageChart" v-model="chartPack" size="small">
            <el-radio-button value="exclusive">一图独占一页</el-radio-button>
            <el-radio-button value="share">同页排布短图</el-radio-button>
          </el-radio-group>
          <div v-if="isLineageChart" class="book-zoom-bar">
            <button type="button" @click="zoomBook(-0.1)">缩小</button>
            <span>{{ bookZoomLabel }}</span>
            <button type="button" @click="zoomBook(0.1)">放大</button>
            <button type="button" @click="bookZoom = 1">原大</button>
            <button type="button" :class="{ 'is-active': bookContinuous }" :aria-pressed="bookContinuous" @click="bookContinuous = !bookContinuous">连续显示</button>
          </div>
        </div>
        <div v-if="loading" v-loading="true" class="cepu-loading" />
        <!-- 单卷加载中（世录卷实时生成耗时明显，给出进度提示） -->
        <div v-else-if="volumeLoading" class="volume-loading">
          <el-icon class="volume-loading-icon is-loading" :size="36"><Loading /></el-icon>
          <p class="volume-loading-text">{{ volumeLoadingText }}</p>
          <p class="volume-loading-sub">正在从家族数据库中汇总人物、家庭与世系关系，请稍候…</p>
        </div>
        <div v-else-if="accessError" class="access-error">
          <el-empty :description="accessError" :image-size="80" />
          <div class="access-error-actions">
            <el-button v-if="!hasLogin" type="primary" @click="router.push('/login')">去登录</el-button>
            <el-button v-else @click="loadVolumes">重试</el-button>
          </div>
        </div>
        <BookCatalog
          v-else-if="viewingCatalog"
          :entries="catalog"
          :script="bookScript"
          @open="openFromCatalog"
        />
        <NameIndexBook
          v-else-if="viewingIndex"
          :entries="indexEntries"
          :script="bookScript"
          @open-bio="openBiographyFromChart"
        />
        <GenerationIndexBook
          v-else-if="viewingGeneration"
          :rows="generationRows"
          :script="bookScript"
        />
        <section v-else-if="placeholderEntry" class="slot-preview" :class="{ 'is-antique': bookScript === 'antique' }">
          <h2>{{ placeholderEntry.text }}</h2>
          <p>本篇尚未录入。目录里保留这一目，写好内容后会出现在这里。</p>
        </section>
        <template v-else-if="volumeContent">
          <!-- 文档卷 -->
          <template v-if="volumeContent.type === 'document'">
            <h2 class="vol-title">{{ volumeContent.title }}</h2>
            <div v-if="!(isAdmin && editMode)" class="book-article" v-html="volumeContent.content || ''" />
            <div v-else class="book-editor">
              <p v-if="isFamilyRulesVolume" class="rules-source-note">这一篇和家族概况里的「家规家训」是同一份文字，改任何一边都会写回另一边。</p>
              <el-input
                v-if="isFamilyRulesVolume"
                v-model="volumeContent.rulesText"
                type="textarea"
                :rows="16"
                placeholder="与家族概况的家规家训相同"
              />
              <el-input
                v-else
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

          <template v-else-if="isBiography || isLadies">
            <BiographyBook
              :entries="volumeContent.entries || []"
              :lineage-entries="isLadies ? indexEntries : undefined"
              :volume-title="isLadies ? '闺秀录' : '人物传'"
              :lead="isLadies ? '本卷收录族中女子完整行传，可配图；世系表内标注【详见闺秀录】者，在此查阅全文。' : undefined"
              :anchor-id="`vol-${volumeContent.id}`"
              :script="bookScript"
              @select="openChartPerson"
              @open-chart="openChartFromBiography"
            />
          </template>

          <!-- 世录卷（苏式） -->
          <template v-else>
            <h2 class="vol-title">{{ volumeContent.title }}</h2>
            <!-- 筛选配置（admin 编辑态） -->
            <div v-if="isAdmin && editMode" class="shilu-config">
              <span class="config-label">排版：</span>
              <el-radio-group v-model="volumeContent.config.layout" size="small">
                <el-radio-button value="su">苏式</el-radio-button>
                <el-radio-button value="ou_chart">欧式</el-radio-button>
                <el-radio-button value="shixi_table">世系表</el-radio-button>
              </el-radio-group>
              <template v-if="volumeContent.config.layout === 'shixi_table'">
                <span class="config-label">每页世代：</span>
                <el-input-number
                  v-model="volumeContent.config.page_gen_count"
                  :min="1"
                  :max="20"
                  size="small"
                  controls-position="right"
                  style="width:110px"
                />
                <el-checkbox v-model="volumeContent.config.show_generation_connector" size="small">
                  显示顶端连接线
                </el-checkbox>
              </template>
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

            <!-- 苏式：支派纵谱。父子上下相承，先长房后次房。 -->
            <div v-if="isSuChart" class="ou-book-page">
              <SuChartView
                :people="lineageModel.people"
                :links="lineageModel.links"
                :captions="lineageModel.captions"
                :selected-id="personPanel?.person_id ?? null"
                :script="bookScript"
                :title-vertical="titleVertical"
                :pack="chartPack"
                :zoom="bookZoom"
                :continuous="bookContinuous"
                :bead-lines="suBeadLines"
                :show-frame="bookScript === 'horizontal' && suShowFrame"
                :frame-pt="suFramePt"
                :continue-note="continueNote"
                :show-avatars="bookScript === 'horizontal' && suShowAvatars"
                :show-toolbar="false"
                @select="openChartPerson"
                @open-bio="openBiographyFromChart"
              />
            </div>

            <!-- 世系表开本(PR#1 竖排预览):与 PDF 排版同构,在线翻页查看 -->
            <div v-else-if="effectiveLayout === 'shixi_table'" class="shixi-table-view">
              <div class="shixi-page-list">
                <article
                  v-for="(page, pIdx) in shixiTablePages.pages"
                  :key="pIdx"
                  class="shixi-page"
                  :class="[
                    page.density === 'condense' ? 'condense' : '',
                    page.density === 'condense-strong' ? 'condense-strong' : '',
                    shixiTablePages.cfg.show_generation_connector === false ? 'no-connector' : '',
                  ]"
                >
                  <div class="shixi-page-dot" />
                  <div class="shixi-title">{{ page.title }}</div>
                  <!-- 顶端连接线：直接作为 .shixi-page 子元素,避免被 writing-mode:vertical-rl 影响
                       强制 writing-mode:horizontal-tb 保证水平绘制。 -->
                  <div
                    v-if="shixiTablePages.cfg.show_generation_connector !== false"
                    class="shixi-connector"
                  />
                  <!-- 标准页:每代一列 -->
                  <div v-if="!page.isSplitCol" class="shixi-grid">
                    <div v-for="g in page.gens" :key="g" class="shixi-col">
                      <div class="shixi-col-header">第{{ g + 1 }}世</div>
                      <div
                        v-for="e in (shixiTablePages.byGen.get(g) || [])"
                        :id="`shilu-${e.person_id}`"
                        :key="e.person_id"
                        class="shixi-person"
                        :class="{ focused: focusedEntryId === e.person_id }"
                        @click="openPerson(e.person_id, e.full_name, e)"
                        v-html="shixiEntryHtml(e)"
                      />
                    </div>
                  </div>
                  <!-- 单代左右双列页 -->
                  <div v-else class="shixi-grid shixi-grid-split">
                    <div class="shixi-col">
                      <div class="shixi-col-header">第{{ (page.splitColGen ?? 0) + 1 }}世·前半</div>
                      <div
                        v-for="e in (page.splitColEntries || []).slice(0, page.splitColHalf)"
                        :id="`shilu-${e.person_id}`"
                        :key="e.person_id"
                        class="shixi-person"
                        :class="{ focused: focusedEntryId === e.person_id }"
                        @click="openPerson(e.person_id, e.full_name, e)"
                        v-html="shixiEntryHtml(e)"
                      />
                    </div>
                    <div class="shixi-col">
                      <div class="shixi-col-header">第{{ (page.splitColGen ?? 0) + 1 }}世·后半</div>
                      <div
                        v-for="e in (page.splitColEntries || []).slice(page.splitColHalf)"
                        :id="`shilu-${e.person_id}`"
                        :key="e.person_id"
                        class="shixi-person"
                        :class="{ focused: focusedEntryId === e.person_id }"
                        @click="openPerson(e.person_id, e.full_name, e)"
                        v-html="shixiEntryHtml(e)"
                      />
                    </div>
                  </div>
                  <div class="shixi-page-footer">第 {{ pIdx + 1 }} 页,共 {{ shixiTablePages.pages.length }} 页</div>
                </article>
                <el-empty v-if="!shixiTablePages.pages.length" description="该卷暂无世录条目" :image-size="60" />
              </div>
            </div>

            <!-- 欧谱：五世一表。旧的 ou 卡片墙不再使用。 -->
            <div v-else-if="isOuChart" class="ou-book-page">
              <EuropeanChartView
                variant="book"
                :charts="ouChartModel.charts"
                :captions="ouChartModel.captions"
                :selected-id="personPanel?.person_id ?? null"
                :script="bookScript"
                :title-vertical="titleVertical"
                :pack="chartPack"
                :zoom="bookZoom"
                :continuous="bookContinuous"
                :continue-note="continueNote"
                :show-toolbar="false"
                @select="openChartPerson"
                @open-bio="openBiographyFromChart"
              />
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

    <!-- 导出设置（二期：页眉页脚 / 批注输出；PR#1：版式强制） -->
    <el-dialog v-model="exportDialog" title="导出设置" width="560px">
      <el-form label-width="88px">
        <el-form-item label="页眉">
          <el-input v-model="exportOpts.header" placeholder="默认：族谱名 + 导出日期" />
        </el-form-item>
        <el-form-item label="页脚">
          <el-input v-model="exportOpts.footer" placeholder="默认：第 X 页 / 共 Y 页" />
        </el-form-item>
        <el-form-item label="PDF">
          <el-radio-group v-model="exportOpts.edition">
            <el-radio value="electronic">电子版（可跳转）</el-radio>
            <el-radio value="print">纸质打印（纯文字）</el-radio>
          </el-radio-group>
          <div class="form-hint">电子版保留蓝色下划线，世系表和人物传可以互相跳转。纸质版去掉链接，只留【详见人物传】和见世系文字。</div>
        </el-form-item>
        <el-form-item label="版式">
          <el-radio-group v-model="exportOpts.layout">
            <el-radio :value="undefined">按卷配置</el-radio>
            <el-radio value="shixi_table">世系表开本（竖排）</el-radio>
            <el-radio value="su">苏式（横排）</el-radio>
            <el-radio value="ou_chart">欧式（五世一表）</el-radio>
          </el-radio-group>
          <div class="form-hint">
            选择"世系表开本"时，PDF / Word 均按传统中式开本输出（双层边框、世代竖列、姓名红色楷体、左下角竖排标题）；
            欧式按五世一表输出表格，一图接一图，末世回到下一图首列。
            苏式是否带垂珠连线、版本A是否带均匀细线版框及其线宽，跟页面上的开关一致。
          </div>
        </el-form-item>
        <el-form-item label="欧式文字">
          <el-radio-group v-model="bookScript">
            <el-radio value="horizontal">横排简体（版本A）</el-radio>
            <el-radio value="antique">仿古竖排线装（版本B）</el-radio>
          </el-radio-group>
          <div class="form-hint">选定后，总目录、欧式五世表、人物传、闺秀录、人名索引整本使用同一文字方向。重新导出才会换成另一种。</div>
        </el-form-item>
        <el-form-item v-if="bookScript === 'antique'" label="图题">
          <el-checkbox v-model="titleVertical">标题竖排居右</el-checkbox>
          <div class="form-hint">默认仍是页面顶部横排居中。勾选后，图题改为竖排，靠版心右侧。</div>
        </el-form-item>
        <el-form-item label="欧式分页">
          <el-radio-group v-model="chartPack">
            <el-radio value="exclusive">一图独占一页</el-radio>
            <el-radio value="share">同页排布短图</el-radio>
          </el-radio-group>
          <div class="form-hint">苏式、欧式共用这一分页开关。连续显示开启后整支连排；关闭后按 A4 分页，一图一页。</div>
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
          <el-input :model-value="`${currentOrigin}${l.url}`" readonly size="small" />
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
.book-script-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin: 0 0 12px;
  padding: 8px 12px;
  background: rgba(255, 252, 246, 0.96);
  border: 1px solid #e4dccb;
  border-radius: 6px;
}
.book-zoom-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.book-zoom-bar button {
  font-family: inherit;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}
.book-zoom-bar button.is-active,
.su-bead-toggle.is-active {
  color: #fff;
  background: #2a241c;
  border-color: #2a241c;
}
.su-bead-toggle {
  font-family: inherit;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}
.su-frame-weight {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #3e3a35;
}
.su-frame-weight select {
  font-family: inherit;
  font-size: 13px;
  color: #3e3a35;
  background: #fff;
  border: 1px solid #d2c6b2;
  border-radius: 4px;
  padding: 3px 6px;
}
.book-zoom-bar span {
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #3e3a35;
  font-size: 13px;
}
@media print {
  .book-zoom-bar, .su-bead-toggle, .su-frame-weight, .su-avatar-toggle, .continue-note-toggle { display: none; }
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
.book-profile-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 4px;
}
.book-profile-label { font-size: 12px; color: #8a8175; }
.book-profile-bar :deep(.el-radio-group) { display: flex; width: 100%; }
.book-profile-bar :deep(.el-radio-button) { flex: 1; }
.book-profile-bar :deep(.el-radio-button__inner) { width: 100%; padding: 6px 0; }
.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.sidebar-item.is-child { margin-left: 16px; }
.sidebar-item.is-group { cursor: default; }
.sidebar-edit-title {
  margin: 12px 8px 6px;
  font-size: 12px;
  color: #8a8175;
}
.slot-preview {
  max-width: 720px;
  margin: 28px auto;
  font-family: 'KaiTi', 'STKaiti', 'SimSun', serif;
  text-align: left;
}
.slot-preview h2 { margin: 0 0 12px; font-size: 22px; letter-spacing: 0.12em; }
.slot-preview p { margin: 0; line-height: 1.8; color: #666; }
.slot-preview.is-antique {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-family: 'SimSun', 'NSimSun', 'Songti SC', serif;
  height: 72vh;
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
.cepu-main.is-book-page {
  max-width: none;
  margin: 0;
  padding: 16px 16px 48px;
  overflow: auto;
  background: #efe6d4;
}
.cepu-main.is-book-page .vol-title {
  font-size: 20px;
  margin: 0 0 12px;
  padding-bottom: 6px;
}
.ou-book-page {
  display: block;
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
.rules-source-note {
  margin: 0 0 8px;
  color: #8a7355;
  font-size: 13px;
  line-height: 1.6;
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
.form-hint {
  font-size: 12px;
  color: #8d6e63;
  margin-top: 6px;
  line-height: 1.6;
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

/* 单卷内容加载中（世录卷实时生成进度提示） */
.volume-loading {
  height: 100%;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: #5a6a7a;
}
.volume-loading-icon { color: #2f6f4f; }
.volume-loading-text { font-size: 15px; color: #333; margin: 0; }
.volume-loading-sub { font-size: 13px; color: #8a98a8; margin: 0; }

/* [PR#1] 世系表开本在线预览版式(与 PDF 排版同构)
 * 设计要点：
 * 1. 页面整体采用水平布局,5 个代际横向并排(从右到左)
 * 2. 顶端连接线 + 小圆圈走水平坐标系(不受文字竖排影响)
 * 3. 每个人物块内部使用 writing-mode:vertical-rl,实现传统竖排文字
 * 4. 列头、页脚、连接器等元素强制 writing-mode:horizontal-tb
 * 5. 页面左侧竖排标题通过 transform: rotate(-90deg) 实现
 */
.shixi-table-view { padding: 8px 0 24px; }
.shixi-page-list { display: flex; flex-direction: column; gap: 24px; align-items: center; }
.shixi-page {
  width: 1100px;
  max-width: 100%;
  min-height: 760px;
  height: auto;
  padding: 70px 56px 40px 110px; /* 左侧留空间放竖排标题 */
  box-sizing: border-box;
  position: relative;
  border: 3px double #333;
  background: #fffdf6;
  font-family: 'KaiTi', 'Songti SC', 'SimSun', 'Microsoft YaHei', serif;
  overflow: visible;
}

/* 分页标记小圆圈：右上角，与原型一致 */
.shixi-page .shixi-page-dot {
  position: absolute; top: 18px; right: 18px;
  width: 22px; height: 22px;
  border: 1.5px solid #333; border-radius: 50%;
  background: #fffdf6;
  z-index: 3;
}

/* 左侧竖排标题：通过旋转实现传统竖排 */
.shixi-page .shixi-title {
  position: absolute;
  bottom: 24px;
  left: 18px;
  width: 32px;
  height: auto;
  /* 旋转 -90 度实现从下到上的竖排文字 */
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-family: 'KaiTi', 'Songti SC', serif;
  color: #b22222;
  font-size: 18px;
  letter-spacing: 6px;
  line-height: 1.5;
  font-weight: 600;
}

/* 页脚(横向第 X 页) */
.shixi-page .shixi-page-footer {
  position: absolute; bottom: 14px; right: 18px;
  font-size: 12px; color: #888;
}

/* 顶端水平连接线：贯穿所有列顶端的水平线,被每列圆圈“穿过”,
 * top:92px 对齐到圆圈中心 (浏览器实测 y≈180,差±1px) */
.shixi-connector {
  position: absolute;
  top: 92px;
  left: 110px;
  right: 36px;
  height: 0;
  border-top: 1.5px solid #333;
  writing-mode: horizontal-tb;
  pointer-events: none;
  z-index: 2;
}
.shixi-page.no-connector .shixi-connector { display: none; }

/* 列布局:水平并排,从右向左(第一世在最右边) */
.shixi-grid {
  display: flex;
  flex-direction: row-reverse;
  min-height: 660px;
  gap: 12px;
  align-items: stretch;
  position: relative;
}

/* 单列:列内人物纵向堆叠(同一代兄弟纵向排列),
 * 列右对齐,保留上方的连接点空间 */
.shixi-col {
  flex: 1 1 0;
  position: relative;
  padding: 92px 4px 12px;       /* 顶部留 92px 空间给圆圈(16+列头) */
  border-left: 1px solid #888;
  min-width: 110px;
  display: flex;
  flex-direction: column;       /* 人物纵向堆叠 */
  align-items: flex-end;         /* 人物靠列右侧 */
  justify-content: flex-start;   /* 从顶端开始 */
  gap: 6px;
  writing-mode: horizontal-tb;   /* 明确水平坐标系,人物竖排由 .shixi-person 内部生效 */
}
.shixi-col:last-child { border-left: 1px solid #888; }

/* 列头（第X世）：水平文字块,悬浮在列顶部中央(圆圈正下方) */
.shixi-col-header {
  position: absolute;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: #d9d9d9;
  border: 1px solid #333;
  font-family: 'KaiTi', 'Songti SC', serif;
  color: #b22222;
  font-size: 16px;
  font-weight: bold;
  padding: 5px 14px;
  letter-spacing: 4px;
  z-index: 4;
  white-space: nowrap;
}

/* 列顶端的小圆圈(吊线图中的“挂载节点”):
 * 与上方的水平连接线 .shixi-connector 交叉,形成传统世系表的“轴线” */
.shixi-col::before {
  content: '';
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: 16px;
  height: 16px;
  border: 2px solid #333;
  border-radius: 50%;
  background: #fffdf6;
  z-index: 6;                     /* 高于连接线,覆在连接线上 */
  writing-mode: horizontal-tb;
  box-sizing: border-box;
}
.shixi-page.no-connector .shixi-col::before { display: none; }

/* 单个人物块：【姓名块】+【说明块】双列结构
 * 整块保持水平坐标系(horizontal-tb)，内部用 flex row-reverse 让姓名块在最右、说明块在左。
 * 这是传统中式族谱的标准结构——姓名独占一列(红色楷体大字)，
 * 所有生平说明在姓名左侧另起一列(黑色小字)。
 * 两个子块内部各自走 writing-mode:vertical-rl，实现中文竖排。 */
.shixi-person {
  display: flex;
  flex-direction: row-reverse;   /* 姓名在右、说明在左 */
  writing-mode: horizontal-tb;   /* 强制水平坐标系，避免被祖先 vertical-rl 干扰 */
  align-items: flex-start;        /* 两列顶端对齐 */
  width: auto;                    /* 宽度自适应姓名+说明宽度之和 */
  min-height: 200px;
  max-height: 620px;
  cursor: pointer;
  border-radius: 4px;
  padding: 8px 4px;
  transition: background 0.15s;
  flex-shrink: 0;
  overflow: hidden;
  font-family: 'KaiTi', 'Songti SC', 'SimSun', 'Microsoft YaHei', serif;
  gap: 0;
}
.shixi-person:hover { background: #f5efdc; }
.shixi-person.focused {
  background: #fdf3dc;
  animation: shixiFlash 2s ease;
}
@keyframes shixiFlash {
  0%, 60% { background: #f7e7b8; }
  100% { background: #fdf3dc; }
}

/* 姓名块：独立列，红字楷体大字,姓名字符上下紧贴排列 */
.shixi-person .shixi-name {
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: center;
  font-family: 'KaiTi', 'Songti SC', serif;
  font-size: 20px;
  font-weight: bold;
  color: #b22222;
  letter-spacing: 0;
  line-height: 1.05;             /* 紧贴排列,名字上下字几乎相连 */
  flex-shrink: 0;
  /* 宽度 = font-size,保证姓名占一列 */
  width: 20px;
}

/* 说明块：姓名左侧,黑色小字,采用**多列布局**——
 * 每个信息字段(生卒/字号/籍贯/葬地/配偶/子女/功名)各自独立成一列,
 * 从右向左依次排列。符合传统中式族谱"古籍附录"式从右向左读的排版习惯。
 * 横向空间不够时,字段会自动向左换行(列方向)。*/
.shixi-person .shixi-info {
  display: flex;
  flex-direction: row-reverse;     /* 从右到左排列字段 */
  flex-wrap: wrap-reverse;         /* 横向溢出时换到下一行(向左) */
  writing-mode: horizontal-tb;      /* 强制水平坐标系 */
  align-items: flex-start;         /* 顶端对齐 */
  align-content: flex-start;
  column-gap: 4px;                 /* 字段之间水平间距 */
  row-gap: 2px;                    /* 换行后两行之间间距 */
  color: #1a1a1a;
  max-width: 140px;                /* 限制总宽度,超出后字段换到下一行 */
  min-width: 0;
}
/* 说明块内每个字段都是独立的列：vertical-rl + 窄字宽 */
.shixi-person .shixi-info > div {
  writing-mode: vertical-rl;
  text-orientation: upright;
  text-align: center;
  font-size: 10px;
  line-height: 1.7;
  letter-spacing: 1px;
  flex-shrink: 0;
  width: 10px;                     /* 字符宽度 = 字号,每个字符占一行 */
  padding: 0;
  color: inherit;
  margin: 0 1px;                   /* 字段列之间留 2px 间隙 */
}
/* 字段类型区分(与原类名同构) */
.shixi-person .shixi-info .shixi-year { color: #1a1a1a; }
.shixi-person .shixi-info .shixi-line { color: #4a453e; }
.shixi-person .shixi-info .shixi-spouse { color: #2c5282; }
.shixi-person .shixi-info .shixi-children { color: #2c5282; }
.shixi-person .shixi-info .shixi-achievement { color: #8b4513; font-weight: 600; }
.shixi-person .shixi-info .shixi-bio { color: #1a1a1a; font-size: 10.5px; line-height: 2.1; }
/* [二期] 世系表密集模式(与 PDF 后端排版一致) */
/* 中等密集:7-12 人/代 */
.shixi-page.condense .shixi-person { min-height: 160px; max-height: 560px; gap: 0; }
.shixi-page.condense .shixi-person .shixi-name { font-size: 15px; width: 15px; line-height: 1.05; }
.shixi-page.condense .shixi-person .shixi-info { max-width: 110px; font-size: 9px; }
.shixi-page.condense .shixi-person .shixi-info > div { font-size: 9px; width: 9px; line-height: 1.5; margin: 0 0.5px; }
.shixi-page.condense .shixi-person .shixi-info .shixi-bio { font-size: 8px; line-height: 1.7; }
.shixi-page.condense .shixi-col { padding: 82px 4px 10px; gap: 4px; }
.shixi-page.condense .shixi-col-header { font-size: 14px; padding: 4px 10px; }

/* 强密集:>12 人/代(单代多列时强制启用) */
.shixi-page.condense-strong .shixi-person { min-height: 120px; max-height: 460px; }
.shixi-page.condense-strong .shixi-person .shixi-name { font-size: 14px; width: 14px; }
.shixi-page.condense-strong .shixi-person .shixi-info { max-width: 90px; font-size: 8.5px; }
.shixi-page.condense-strong .shixi-person .shixi-info > div { font-size: 8.5px; width: 8.5px; line-height: 1.4; margin: 0 0.5px; }
.shixi-page.condense-strong .shixi-person .shixi-info .shixi-bio { font-size: 7.5px; line-height: 1.5; }
.shixi-page.condense-strong .shixi-col { gap: 3px; }
.shixi-page.condense-strong .shixi-col { padding: 72px 3px 8px; min-height: 560px; }
.shixi-page.condense-strong .shixi-col-header { font-size: 13px; padding: 3px 8px; letter-spacing: 3px; }

/* 双列页:左右双列各占一格 */
.shixi-grid.shixi-grid-split { flex-direction: row-reverse; }
.shixi-grid.shixi-grid-split .shixi-col { flex: 1 1 50%; min-width: 200px; }
.shixi-grid.shixi-grid-split .shixi-col-header { font-size: 14px; padding: 4px 10px; letter-spacing: 3px; }

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
