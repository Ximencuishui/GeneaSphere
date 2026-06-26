<template>
  <div ref="mapContainer" class="migration-map">
    <!-- 加载提示 -->
    <div v-if="loading" class="map-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载迁徙地图...</span>
    </div>

    <!-- 当前朝代标注 -->
    <div v-if="currentDynasty" class="dynasty-badge" :style="{ borderColor: currentDynasty.color ?? '' }">
      <div class="dynasty-name" :style="{ color: currentDynasty.color ?? '' }">
        {{ currentDynasty.name }}
      </div>
      <div class="dynasty-period">
        {{ currentDynasty.start_year }} - {{ currentDynasty.end_year >= 9999 ? '今' : currentDynasty.end_year }}
      </div>
      <div v-if="currentDynasty.description" class="dynasty-desc">
        {{ currentDynasty.description }}
      </div>
    </div>

    <!-- POI 点击信息卡 -->
    <div v-if="selectedPoi" class="poi-info-card">
      <div class="poi-info-header">
        <span class="poi-name">{{ selectedPoi.name }}</span>
        <el-button text size="small" @click="selectedPoi = null">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="poi-info-meta">
        <span v-if="selectedPoi.earliest_year">
          最早记录：{{ selectedPoi.earliest_year }} 年
        </span>
        <span v-if="selectedPoi.latest_year && selectedPoi.latest_year !== selectedPoi.earliest_year">
          · 最晚：{{ selectedPoi.latest_year }}
        </span>
      </div>
      <div class="poi-info-stats">
        <span><el-icon><User /></el-icon> {{ selectedPoi.person_count }} 位族人</span>
        <span><el-icon><Picture /></el-icon> {{ selectedPoi.media_count }} 张照片</span>
      </div>
    </div>

    <!-- 当前播放的 POI 照片簇 -->
    <PhotoCluster
      v-if="activePoi && activePoiPhotos.length > 0"
      :location-name="activePoi.name"
      :media="activePoiPhotos"
      class="active-photo-cluster"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Loading,
  Close,
  User,
  Picture,
} from '@element-plus/icons-vue';
import L from 'leaflet';
import { migrationApi } from '@/api/migration';
import type {
  MigrationPoi,
  MigrationEvent,
  Dynasty,
  LocationMediaItem,
} from '@/types';
import PhotoCluster from './PhotoCluster.vue';

// ==================== 模块级朝代 GeoJSON 缓存 ====================
// 将缓存提升到模块级别（<script setup> 之外），跨组件挂载生命周期持久化。
// 用户在 SPA 内导航离开再回来时，无需重新 fetch GeoJSON。
const dynastyGeoJsonCache = new Map<number, any>();

const props = defineProps<{
  clanId: string | number;
  branch?: string | null;
  currentYear: number;
  /** 父组件可控制是否触发自动 flyTo */
  flying?: boolean;
}>();

const emit = defineEmits<{
  (e: 'poi-click', poi: MigrationPoi): void;
  (e: 'map-ready'): void;
  (e: 'photo-loaded', payload: { poi: MigrationPoi; photos: LocationMediaItem[] }): void;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const loading = ref(false);
const selectedPoi = ref<MigrationPoi | null>(null);

const pois = ref<MigrationPoi[]>([]);
const events = ref<MigrationEvent[]>([]);
const dynasties = ref<Dynasty[]>([]);
const currentDynasty = ref<Dynasty | null>(null);
const activePoi = ref<MigrationPoi | null>(null);
const activePoiPhotos = ref<LocationMediaItem[]>([]);

// Leaflet 实例
let map: L.Map | null = null;
let poiLayer: L.LayerGroup | null = null;
let pathLayer: L.LayerGroup | null = null;
let dynastyLayer: L.LayerGroup | null = null;

// 支系配色
const BRANCH_COLORS = ['#C53030', '#2B6CB0', '#2F855A', '#B7791F', '#6B46C1', '#0987A0'];
const branchColorMap = new Map<string, string>();

function getBranchColor(branch: string | null | undefined): string {
  if (!branch) return '#8B5A2B';
  if (!branchColorMap.has(branch)) {
    branchColorMap.set(branch, BRANCH_COLORS[branchColorMap.size % BRANCH_COLORS.length]);
  }
  return branchColorMap.get(branch)!;
}

// POI 图标颜色按 source 区分
function getPoiColor(poi: MigrationPoi): string {
  if (poi.source === 'birth') return '#E53E3E';
  if (poi.source === 'death') return '#718096';
  if (poi.source === 'mixed') return '#D69E2E';
  return '#2B6CB0';
}

// ==================== 初始化 ====================

onMounted(async () => {
  await nextTick();
  if (!mapContainer.value) return;

  // 修复 Leaflet 默认图标在 Vite 下的路径问题
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  map = L.map(mapContainer.value, {
    center: [35, 105],
    zoom: 4,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: true,
    attributionControl: true,
  });

  // CartoDB Voyager 底图（免费 CC-BY）
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    },
  ).addTo(map);

  poiLayer = L.layerGroup().addTo(map);
  pathLayer = L.layerGroup().addTo(map);
  dynastyLayer = L.layerGroup().addTo(map);

  await loadData();
  emit('map-ready');
});

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

// ==================== 数据加载 ====================

async function loadData() {
  loading.value = true;
  try {
    const [poiRes, evtRes, dyRes] = await Promise.all([
      migrationApi.getPois(props.clanId, props.branch || undefined),
      migrationApi.getEvents(props.clanId, props.branch || undefined),
      migrationApi.getDynasties(),
    ]);
    pois.value = poiRes;
    events.value = evtRes;
    dynasties.value = dyRes;

    renderPois();
    renderPaths();
    fitToPois();

    // 预加载所有朝代的 GeoJSON 疆域数据，
    // 之后用户滑动时间轴时无需按需 fetch，直接从缓存读取
    preloadDynastyGeoJson();

    // 默认选中第一个有经纬度的 POI
    const firstValid = pois.value.find((p) => p.lat != null && p.lng != null);
    if (firstValid) {
      activePoi.value = firstValid;
      await loadPoiPhotos(firstValid);
    }
  } catch (e: any) {
    ElMessage.error('加载迁徙数据失败：' + (e?.message || '未知错误'));
  } finally {
    loading.value = false;
  }
}

// ==================== 渲染 POI ====================

function createPoiIcon(poi: MigrationPoi, isActive: boolean): L.DivIcon {
  const color = getPoiColor(poi);
  const size = isActive ? 32 : 22;
  const ringStyle = isActive ? `box-shadow: 0 0 0 4px ${color}55, 0 0 16px ${color};` : '';
  return L.divIcon({
    className: 'poi-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="poi-marker-dot" style="
        width:${size}px;
        height:${size}px;
        background:${color};
        border:2px solid #fff;
        border-radius:50%;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        ${ringStyle}
        animation: poiPulse 2s infinite ease-in-out;
        cursor:pointer;
      "></div>
    `,
  });
}

function renderPois() {
  if (!map || !poiLayer) return;
  poiLayer.clearLayers();

  for (const poi of pois.value) {
    if (poi.lat == null || poi.lng == null) continue;
    const isActive = activePoi.value?.id === poi.id;
    const marker = L.marker([poi.lat, poi.lng], {
      icon: createPoiIcon(poi, isActive),
      title: poi.name,
    });
    marker.on('click', () => onPoiClick(poi));
    marker.bindTooltip(poi.name, { direction: 'top', offset: [0, -10] });
    marker.addTo(poiLayer);
  }
}

async function onPoiClick(poi: MigrationPoi) {
  selectedPoi.value = poi;
  emit('poi-click', poi);

  // fly 到该点
  if (map && poi.lat != null && poi.lng != null) {
    map.flyTo([poi.lat, poi.lng], Math.max(map.getZoom(), 7), {
      duration: 1.2,
    });
  }

  // 切换活动 POI，触发照片簇
  activePoi.value = poi;
  await loadPoiPhotos(poi);
  renderPois();
}

async function loadPoiPhotos(poi: MigrationPoi) {
  try {
    const photos = await migrationApi.getLocationMedia(props.clanId, poi.name);
    activePoiPhotos.value = photos;
    emit('photo-loaded', { poi, photos });
  } catch (e) {
    activePoiPhotos.value = [];
  }
}

// ==================== 渲染迁徙路径 ====================

function renderPaths() {
  if (!map || !pathLayer) return;
  pathLayer.clearLayers();

  for (const evt of events.value) {
    if (evt.from_lat == null || evt.from_lng == null) continue;
    if (evt.to_lat == null || evt.to_lng == null) continue;
    const color = getBranchColor(evt.branch);
    const line = L.polyline(
      [
        [evt.from_lat, evt.from_lng],
        [evt.to_lat, evt.to_lng],
      ],
      {
        color,
        weight: 3,
        opacity: 0.7,
        dashArray: '6, 8',
        lineCap: 'round',
      },
    );
    line.bindTooltip(
      `<b>${evt.from_location} → ${evt.to_location}</b><br/>` +
        `${evt.event_year} 年${
          evt.reason
            ? ' · ' +
              {
                WAR: '战乱',
                BUSINESS: '经商',
                OFFICIAL: '仕宦',
                RECLAMATION: '垦荒',
                FAMINE: '灾荒',
                OTHER: '其他',
              }[evt.reason]
            : ''
        }`,
      { sticky: true },
    );
    line.addTo(pathLayer);
  }
}

// ==================== 预加载所有朝代 GeoJSON ====================

async function preloadDynastyGeoJson() {
  const urls = (dynasties.value || []).map((d) => ({
    id: d.id,
    url: d.geojson_url || `/geojson/dynasties/${getDynastyFileName(d)}.geojson`,
  }));

  await Promise.all(
    urls.map(async ({ id, url }) => {
      if (dynastyGeoJsonCache.has(id)) return;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return;
        const geo = await resp.json();
        dynastyGeoJsonCache.set(id, geo);
      } catch {
        // 单个 GeoJSON 加载失败不影响其他数据
      }
    }),
  );
}

// ==================== 朝代图层 ====================

watch(
  () => props.currentYear,
  async (year) => {
    updateDynastyLayer(year);
  },
);

async function updateDynastyLayer(year: number) {
  if (!map || !dynastyLayer) return;

  // 找出当前年份所属朝代
  const dy = dynasties.value.find(
    (d) => year >= d.start_year && year <= d.end_year,
  );
  currentDynasty.value = dy || null;

  dynastyLayer.clearLayers();

  if (!dy) return;

  let geo = dynastyGeoJsonCache.get(dy.id);
  if (!geo) {
    try {
      const url = dy.geojson_url || `/geojson/dynasties/${getDynastyFileName(dy)}.geojson`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      geo = await resp.json();
      dynastyGeoJsonCache.set(dy.id, geo);
    } catch (e) {
      return;
    }
  }

  if (!geo) return;

  const layer = L.geoJSON(geo as any, {
    style: () => ({
      color: dy.color || '#888',
      weight: 2,
      fillColor: dy.color || '#888',
      fillOpacity: dy.fill_opacity || 0.12,
      opacity: 0.7,
      dashArray: '4, 4',
    }),
  });
  layer.addTo(dynastyLayer);
}

function getDynastyFileName(d: Dynasty): string {
  if (d.id === 1) return 'ming';
  if (d.id === 2) return 'qing';
  if (d.id === 3) return 'republic';
  return 'modern';
}

// ==================== 自动 flyTo 当前 POI ====================

watch(
  () => [props.currentYear, pois.value.length],
  () => {
    if (!props.flying || !map) return;
    // 找出当前年份之前最近的 POI
    const beforeNow = pois.value
      .filter(
        (p) =>
          p.lat != null &&
          p.lng != null &&
          p.earliest_year != null &&
          p.earliest_year <= props.currentYear,
      )
      .sort((a, b) => (b.earliest_year || 0) - (a.earliest_year || 0));

    if (beforeNow.length === 0) return;

    // 仅在当前 active POI 改变时切换
    const target = beforeNow[0];
    if (activePoi.value?.id === target.id) return;

    activePoi.value = target;
    renderPois();
    loadPoiPhotos(target);

    map.panTo([target.lat!, target.lng!], { animate: true, duration: 0.8 });
  },
);

// ==================== 适应视野 ====================

function fitToPois() {
  if (!map) return;
  const valid = pois.value.filter((p) => p.lat != null && p.lng != null);
  if (valid.length === 0) return;
  const bounds = L.latLngBounds(valid.map((p) => [p.lat!, p.lng!] as L.LatLngTuple));
  map.fitBounds(bounds, { padding: [40, 40] });
}

// ==================== 外部数据变化响应 ====================

watch(
  () => [props.clanId, props.branch],
  async () => {
    await loadData();
  },
);

defineExpose({
  fitToPois,
  refresh: loadData,
});
</script>

<style scoped>
.migration-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  border-radius: 8px;
  overflow: hidden;
}

.migration-map :deep(.leaflet-container) {
  background: #1a202c;
  height: 100%;
  width: 100%;
}

.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.85);
  z-index: 500;
  font-size: 14px;
  color: #4a5568;
}

.dynasty-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 600;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid #888;
  border-radius: 8px;
  padding: 10px 16px;
  min-width: 180px;
  max-width: 280px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.4s ease;
}

.dynasty-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
}

.dynasty-period {
  font-size: 12px;
  color: #4a5568;
  margin-top: 2px;
}

.dynasty-desc {
  font-size: 11px;
  color: #718096;
  margin-top: 6px;
  line-height: 1.5;
}

.poi-info-card {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 600;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 220px;
  max-width: 320px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.poi-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.poi-name {
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
}

.poi-info-meta {
  font-size: 12px;
  color: #718096;
  margin-bottom: 8px;
}

.poi-info-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #4a5568;
}

.poi-info-stats .el-icon {
  margin-right: 4px;
}

.active-photo-cluster {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 600;
  max-width: 360px;
}
</style>

<style>
/* 全局样式（POI marker 因为是 divIcon 需要全局） */
.poi-marker {
  background: transparent !important;
  border: none !important;
}

@keyframes poiPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.leaflet-tooltip {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  font-size: 12px;
  color: #2d3748;
}
</style>
