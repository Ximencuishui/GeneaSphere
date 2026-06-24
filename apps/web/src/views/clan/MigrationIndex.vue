<template>
  <div class="migration-page">
    <!-- 顶部工具栏 -->
    <div class="migration-toolbar">
      <div class="toolbar-left">
        <el-button text @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2 class="page-title">
          <el-icon><MapLocation /></el-icon>
          迁徙地图 · {{ clanName }}
        </h2>
      </div>

      <div class="toolbar-center">
        <BranchSelector
          v-model="selectedBranch"
          :branches="branches"
          @change="onBranchChange"
        />
      </div>

      <div class="toolbar-right">
        <el-button-group>
          <el-button @click="exportPng" :loading="exporting">
            <el-icon><Picture /></el-icon>
            导出 PNG
          </el-button>
          <el-button
            @click="exportVideo"
            :loading="recording"
            :type="recording ? 'danger' : 'default'"
          >
            <el-icon><VideoCamera /></el-icon>
            {{ recording ? `录制中 ${recordSeconds}s` : '录制 30s' }}
          </el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 主体地图区 -->
    <div class="migration-body" ref="mapBodyEl">
      <MigrationMap
        ref="mapRef"
        :clan-id="clanId"
        :branch="selectedBranch"
        :current-year="currentYear"
        :flying="playing"
        @poi-click="onPoiClick"
      />

      <!-- 无数据提示 -->
      <div v-if="!loading && poiCount === 0" class="no-data-mask">
        <el-empty description="暂无迁徙数据，请先在族谱中补充出生地和迁徙事件">
          <el-button type="primary" @click="goAdmin">
            前往管理员后台添加
          </el-button>
        </el-empty>
      </div>
    </div>

    <!-- 时间轴 -->
    <TimelineControl
      :current-year="currentYear"
      :min-year="minYear"
      :max-year="maxYear"
      :pois="poisForTimeline"
      :playing="playing"
      :speed="speed"
      @update:current-year="(y) => (currentYear = y)"
      @play-toggle="togglePlay"
      @reset="resetTimeline"
      @speed-change="(s) => (speed = s)"
    />

    <!-- 底部信息栏 -->
    <div class="migration-footer">
      <div class="footer-item">
        <span class="label">当前 POI</span>
        <span class="value">{{ activePoi?.name || '—' }}</span>
      </div>
      <div class="footer-item">
        <span class="label">所属朝代</span>
        <span class="value">{{ currentDynastyName || '—' }}</span>
      </div>
      <div class="footer-item">
        <span class="label">关联人物</span>
        <span class="value">{{ activePoi?.person_count ?? 0 }}</span>
      </div>
      <div class="footer-item">
        <span class="label">关联照片</span>
        <span class="value">{{ activePoi?.media_count ?? 0 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ArrowLeft,
  MapLocation,
  Picture,
  VideoCamera,
} from '@element-plus/icons-vue';
import html2canvas from 'html2canvas';
import { useClanStore } from '@/stores/clan';
import { migrationApi } from '@/api/migration';
import type {
  MigrationPoi,
  Branch,
  Dynasty,
} from '@/types';
import MigrationMap from '@/components/migration/MigrationMap.vue';
import TimelineControl from '@/components/migration/TimelineControl.vue';
import BranchSelector from '@/components/migration/BranchSelector.vue';

const route = useRoute();
const router = useRouter();
const clanStore = useClanStore();

const clanId = computed(() => route.params.id as string);
const clanName = computed(() => clanStore.currentClan?.name || '家族');

const selectedBranch = ref<string | null>(null);
const branches = ref<Branch[]>([]);
const pois = ref<MigrationPoi[]>([]);
const dynasties = ref<Dynasty[]>([]);
const loading = ref(true);

const mapRef = ref<InstanceType<typeof MigrationMap> | null>(null);
const mapBodyEl = ref<HTMLElement | null>(null);

// 时间轴状态
const currentYear = ref(1700);
const minYear = computed(() => {
  const ys = pois.value
    .map((p) => p.earliest_year)
    .filter((y): y is number => typeof y === 'number');
  return ys.length > 0 ? Math.min(...ys, 1500) : 1500;
});
const maxYear = computed(() => {
  const ys = pois.value
    .map((p) => p.latest_year)
    .filter((y): y is number => typeof y === 'number');
  return ys.length > 0 ? Math.max(...ys, new Date().getFullYear()) : new Date().getFullYear();
});

const poisForTimeline = computed(() => pois.value);

const poiCount = computed(() => pois.value.length);

// 活动 POI（来自地图组件）
const activePoi = ref<MigrationPoi | null>(null);

// 播放控制
const playing = ref(false);
const speed = ref(2);
let playTimer: number | null = null;

// 当前朝代
const currentDynastyName = computed(() => {
  const d = dynasties.value.find(
    (dy) => currentYear.value >= dy.start_year && currentYear.value <= dy.end_year,
  );
  return d?.name || '';
});

// 导出状态
const exporting = ref(false);
const recording = ref(false);
const recordSeconds = ref(0);
let recordTimer: number | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// ==================== 初始化 ====================

onMounted(async () => {
  if (clanId.value) {
    await clanStore.fetchClanById(clanId.value);
  }
  await loadInitialData();

  // 默认起始：所有 POI 中最早的年份
  const earliest = pois.value
    .map((p) => p.earliest_year)
    .filter((y): y is number => typeof y === 'number');
  if (earliest.length > 0) {
    currentYear.value = Math.max(1500, Math.min(...earliest) - 5);
  }
});

onBeforeUnmount(() => {
  stopPlay();
  stopRecord();
});

async function loadInitialData() {
  loading.value = true;
  try {
    const [branchRes, poiRes, dyRes] = await Promise.all([
      migrationApi.getBranches(clanId.value),
      migrationApi.getPois(clanId.value),
      migrationApi.getDynasties(),
    ]);
    branches.value = branchRes;
    pois.value = poiRes;
    dynasties.value = dyRes;
  } catch (e: any) {
    ElMessage.error('加载数据失败：' + (e?.message || ''));
  } finally {
    loading.value = false;
  }
}

// ==================== 支系切换 ====================

async function onBranchChange(branch: string | null) {
  selectedBranch.value = branch;
  loading.value = true;
  try {
    const poiRes = await migrationApi.getPois(clanId.value, branch || undefined);
    pois.value = poiRes;
    // 重置时间轴到该支系最早年份
    const earliest = poiRes
      .map((p) => p.earliest_year)
      .filter((y): y is number => typeof y === 'number');
    if (earliest.length > 0) {
      currentYear.value = Math.max(1500, Math.min(...earliest) - 5);
    }
  } catch (e: any) {
    ElMessage.error('切换支系失败');
  } finally {
    loading.value = false;
  }
}

// ==================== 地图事件 ====================

function onPoiClick(poi: MigrationPoi) {
  activePoi.value = poi;
}

// ==================== 播放控制 ====================

function togglePlay() {
  if (playing.value) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  if (poiCount.value === 0) {
    ElMessage.warning('暂无 POI 数据，无法播放');
    return;
  }
  playing.value = true;
  // 计算每帧年份推进量（基于速度）
  const tickMs = 500;
  const yearStep = Math.max(1, Math.round(speed.value));
  playTimer = window.setInterval(() => {
    const next = currentYear.value + yearStep;
    if (next > maxYear.value) {
      currentYear.value = maxYear.value;
      stopPlay();
    } else {
      currentYear.value = next;
    }
  }, tickMs);
}

function stopPlay() {
  playing.value = false;
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function resetTimeline() {
  stopPlay();
  const earliest = pois.value
    .map((p) => p.earliest_year)
    .filter((y): y is number => typeof y === 'number');
  currentYear.value = earliest.length > 0 ? Math.max(1500, Math.min(...earliest) - 5) : 1700;
}

// ==================== 导出 PNG ====================

async function exportPng() {
  if (!mapBodyEl.value) {
    ElMessage.error('找不到地图容器');
    return;
  }
  exporting.value = true;
  try {
    // 等待地图瓦片加载
    await new Promise((r) => setTimeout(r, 500));
    const canvas = await html2canvas(mapBodyEl.value, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#1a202c',
      scale: 1.5,
    });
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${clanName.value}-迁徙地图-${Date.now()}.png`;
    link.click();
    ElMessage.success('PNG 已导出');
  } catch (e: any) {
    ElMessage.error('PNG 导出失败：' + (e?.message || ''));
  } finally {
    exporting.value = false;
  }
}

// ==================== 录制 MP4/WebM ====================

async function exportVideo() {
  if (recording.value) {
    await stopRecord();
    return;
  }

  if (!mapBodyEl.value) return;

  try {
    // 启动自动播放
    if (!playing.value) {
      startPlay();
    }

    // 使用 canvas.captureStream 捕获地图容器
    const canvas = document.createElement('canvas');
    canvas.width = mapBodyEl.value.clientWidth;
    canvas.height = mapBodyEl.value.clientHeight;
    const ctx = canvas.getContext('2d')!;

    // 30 帧/秒 渲染
    let running = true;
    const drawLoop = async () => {
      while (running) {
        // 通过 html2canvas 截取到 canvas
        try {
          const c = await html2canvas(mapBodyEl.value!, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#1a202c',
            scale: 1,
            logging: false,
          });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(c, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1000 / 15)); // 15fps
      }
    };
    drawLoop();

    const stream = canvas.captureStream(15);
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      running = false;
      const blob = new Blob(recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      link.download = `${clanName.value}-迁徙动画-${Date.now()}.${ext}`;
      link.click();
      URL.revokeObjectURL(url);
      ElMessage.success(`录制完成，已下载 .${ext} 文件`);
      stopPlay();
    };

    mediaRecorder.start();
    recording.value = true;
    recordSeconds.value = 0;
    recordTimer = window.setInterval(() => {
      recordSeconds.value++;
      if (recordSeconds.value >= 30) {
        stopRecord();
      }
    }, 1000);
  } catch (e: any) {
    ElMessage.error('录制启动失败：' + (e?.message || '') + '（推荐使用 Chrome / Edge）');
    recording.value = false;
  }
}

async function stopRecord() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  recording.value = false;
}

// ==================== 跳转管理后台 ====================

function goAdmin() {
  router.push('/admin/migration');
}
</script>

<style scoped>
.migration-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7fafc;
}

.migration-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  gap: 16px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
  margin: 0;
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.migration-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.no-data-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  z-index: 800;
}

.migration-footer {
  display: flex;
  gap: 32px;
  padding: 10px 20px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  font-size: 13px;
  flex-shrink: 0;
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-item .label {
  color: #718096;
}

.footer-item .value {
  color: #2d3748;
  font-weight: 500;
}
</style>
