<template>
  <div class="migration-particles-container">
    <!-- Leaflet 真实地图底图 -->
    <div ref="mapContainer" class="leaflet-bg" />
    <!-- 粒子动画 Canvas 叠加层（透明背景） -->
    <canvas
      ref="canvasRef"
      class="migration-particles-canvas"
      @mousemove="handleMouseMove"
      @mouseleave="emit('surnameHover', null); mouseX = -1000; mouseY = -1000"
      @click="handleCanvasClick"
    />
    <!-- 地图图源归属（极简，匹配暗色主题） -->
    <div class="map-attribution">
      &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import L from 'leaflet';
import type { SurnameData, ParticleState } from '@/types/home';

const props = defineProps<{
  highlightedSurname: string | null;
}>();

const emit = defineEmits<{
  (e: 'surnameHover', surname: string | null): void;
  (e: 'nodeClick', nodeName: string): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const mapContainer = ref<HTMLDivElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let map: L.Map | null = null;
let animationId = 0;
let particles: ParticleState[] = [];
let mouseX = -1000;
let mouseY = -1000;

// ==================== 姓氏迁徙数据 ====================

const surnames: SurnameData[] = [
  {
    name: '李', color: '#C9A96E',
    origin: { lng: 104.5, lat: 34.5 },
    paths: [
      [{ lng: 104.5, lat: 34.5 }, { lng: 108, lat: 34 }, { lng: 113, lat: 34 }, { lng: 116, lat: 36 }],
      [{ lng: 104.5, lat: 34.5 }, { lng: 106, lat: 30 }, { lng: 108, lat: 28 }, { lng: 112, lat: 27 }],
      [{ lng: 104.5, lat: 34.5 }, { lng: 100, lat: 36 }, { lng: 96, lat: 38 }],
    ],
    description: '发源于陇西（今甘肃东南部）',
  },
  {
    name: '王', color: '#E8A87C',
    origin: { lng: 113.5, lat: 35.0 },
    paths: [
      [{ lng: 113.5, lat: 35.0 }, { lng: 116, lat: 35 }, { lng: 118, lat: 36 }, { lng: 120, lat: 37 }],
      [{ lng: 113.5, lat: 35.0 }, { lng: 114, lat: 32 }, { lng: 116, lat: 30 }, { lng: 118, lat: 28 }],
      [{ lng: 113.5, lat: 35.0 }, { lng: 110, lat: 36 }, { lng: 108, lat: 38 }],
    ],
    description: '发源于太原（今山西中部）',
  },
  {
    name: '张', color: '#85C1A9',
    origin: { lng: 115.5, lat: 36.0 },
    paths: [
      [{ lng: 115.5, lat: 36.0 }, { lng: 118, lat: 35 }, { lng: 120, lat: 34 }],
      [{ lng: 115.5, lat: 36.0 }, { lng: 114, lat: 33 }, { lng: 113, lat: 31 }],
      [{ lng: 115.5, lat: 36.0 }, { lng: 112, lat: 38 }, { lng: 110, lat: 40 }],
    ],
    description: '发源于清河（今河北南部）',
  },
  {
    name: '刘', color: '#7FB3D8',
    origin: { lng: 112.0, lat: 34.5 },
    paths: [
      [{ lng: 112.0, lat: 34.5 }, { lng: 114, lat: 34 }, { lng: 116, lat: 34 }],
      [{ lng: 112.0, lat: 34.5 }, { lng: 110, lat: 32 }, { lng: 108, lat: 30 }],
      [{ lng: 112.0, lat: 34.5 }, { lng: 113, lat: 36 }, { lng: 114, lat: 38 }],
    ],
    description: '发源于彭城（今江苏徐州）',
  },
  {
    name: '陈', color: '#F0B27A',
    origin: { lng: 114.7, lat: 33.9 },
    paths: [
      [{ lng: 114.7, lat: 33.9 }, { lng: 116, lat: 33 }, { lng: 118, lat: 32 }, { lng: 120, lat: 31 }],
      [{ lng: 114.7, lat: 33.9 }, { lng: 115, lat: 30 }, { lng: 116, lat: 27 }],
      [{ lng: 114.7, lat: 33.9 }, { lng: 112, lat: 34 }, { lng: 110, lat: 35 }],
    ],
    description: '发源于颍川（今河南许昌）',
  },
  {
    name: '杨', color: '#A3D4C4',
    origin: { lng: 110.5, lat: 35.5 },
    paths: [
      [{ lng: 110.5, lat: 35.5 }, { lng: 112, lat: 34 }, { lng: 114, lat: 33 }],
      [{ lng: 110.5, lat: 35.5 }, { lng: 108, lat: 34 }, { lng: 106, lat: 33 }],
      [{ lng: 110.5, lat: 35.5 }, { lng: 113, lat: 37 }, { lng: 115, lat: 38 }],
    ],
    description: '发源于弘农（今河南灵宝）',
  },
  {
    name: '赵', color: '#D7A9E4',
    origin: { lng: 111.5, lat: 36.5 },
    paths: [
      [{ lng: 111.5, lat: 36.5 }, { lng: 114, lat: 36 }, { lng: 116, lat: 37 }],
      [{ lng: 111.5, lat: 36.5 }, { lng: 110, lat: 34 }, { lng: 108, lat: 33 }],
      [{ lng: 111.5, lat: 36.5 }, { lng: 113, lat: 38 }, { lng: 115, lat: 39 }],
    ],
    description: '发源于天水（今甘肃天水）',
  },
  {
    name: '黄', color: '#F5CBA7',
    origin: { lng: 114.3, lat: 31.0 },
    paths: [
      [{ lng: 114.3, lat: 31.0 }, { lng: 116, lat: 30 }, { lng: 118, lat: 28 }],
      [{ lng: 114.3, lat: 31.0 }, { lng: 112, lat: 30 }, { lng: 110, lat: 29 }],
      [{ lng: 114.3, lat: 31.0 }, { lng: 115, lat: 33 }, { lng: 116, lat: 35 }],
    ],
    description: '发源于江夏（今湖北武汉）',
  },
  {
    name: '周', color: '#A9CCE3',
    origin: { lng: 108.5, lat: 34.0 },
    paths: [
      [{ lng: 108.5, lat: 34.0 }, { lng: 110, lat: 33 }, { lng: 112, lat: 32 }],
      [{ lng: 108.5, lat: 34.0 }, { lng: 109, lat: 36 }, { lng: 111, lat: 37 }],
      [{ lng: 108.5, lat: 34.0 }, { lng: 107, lat: 32 }, { lng: 106, lat: 30 }],
    ],
    description: '发源于汝南（今河南平舆）',
  },
  {
    name: '吴', color: '#82E0AA',
    origin: { lng: 119.5, lat: 31.0 },
    paths: [
      [{ lng: 119.5, lat: 31.0 }, { lng: 120, lat: 30 }, { lng: 121, lat: 29 }],
      [{ lng: 119.5, lat: 31.0 }, { lng: 118, lat: 29 }, { lng: 116, lat: 28 }],
      [{ lng: 119.5, lat: 31.0 }, { lng: 120, lat: 33 }, { lng: 121, lat: 34 }],
    ],
    description: '发源于吴郡（今江苏苏州）',
  },
];

// 关键迁徙集散地
const migrationHubs = [
  { name: '山西洪洞', lng: 111.7, lat: 36.3, desc: '明代移民集散地' },
  { name: '湖北麻城', lng: 115.0, lat: 31.2, desc: '湖广填四川起点' },
  { name: '广东南雄', lng: 114.3, lat: 25.1, desc: '珠玑巷移民中转' },
  { name: '福建宁化', lng: 116.7, lat: 26.3, desc: '客家人中转站' },
  { name: '山东兖州', lng: 116.8, lat: 35.6, desc: '北方移民枢纽' },
];

// ==================== 地理投影 ====================
// 使用 Leaflet 的真实地图投影将经纬度转换为 Canvas 像素坐标

function geoToCanvas(lng: number, lat: number): [number, number] {
  if (!map) return [0, 0];
  const point = map.latLngToContainerPoint(L.latLng(lat, lng));
  return [point.x, point.y];
}

function initParticles() {
  particles = [];
  const totalParticles = 300;
  const perSurname = Math.floor(totalParticles / surnames.length);

  surnames.forEach((surname, si) => {
    for (let i = 0; i < perSurname; i++) {
      const [ox, oy] = geoToCanvas(surname.origin.lng, surname.origin.lat);
      const pathIdx = i % surname.paths.length;
      const path = surname.paths[pathIdx];
      const progress = Math.random();
      const pathPos = getPathPosition(path, progress);
      const [tx, ty] = geoToCanvas(pathPos[0], pathPos[1]);

      particles.push({
        x: ox + (Math.random() - 0.5) * 20,
        y: oy + (Math.random() - 0.5) * 20,
        targetX: tx + (Math.random() - 0.5) * 15,
        targetY: ty + (Math.random() - 0.5) * 15,
        speed: 0.002 + Math.random() * 0.005,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.7,
        surnameIndex: si,
        pathIndex: pathIdx,
        progress: Math.random(),
      });
    }
  });
}

function getPathPosition(path: { lng: number; lat: number }[], progress: number): [number, number] {
  if (path.length < 2) return [path[0].lng, path[0].lat];
  const totalSegments = path.length - 1;
  const segLen = 1 / totalSegments;
  const segIdx = Math.min(Math.floor(progress / segLen), totalSegments - 1);
  const segProgress = (progress - segIdx * segLen) / segLen;
  const from = path[segIdx];
  const to = path[segIdx + 1];
  return [
    from.lng + (to.lng - from.lng) * segProgress,
    from.lat + (to.lat - from.lat) * segProgress,
  ];
}

// ==================== 绘制函数 ====================

function drawHubs() {
  const c = ctx;
  if (!c) return;
  migrationHubs.forEach((hub) => {
    const [x, y] = geoToCanvas(hub.lng, hub.lat);
    const pulse = Math.sin(Date.now() / 1500 + hub.lng) * 0.3 + 0.7;
    c.beginPath();
    c.arc(x, y, 4 + pulse * 3, 0, Math.PI * 2);
    c.fillStyle = `rgba(201, 169, 110, ${0.3 + pulse * 0.3})`;
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    c.font = '11px "PingFang SC", sans-serif';
    c.textAlign = 'center';
    c.fillText(hub.name, x, y - 12);
    c.beginPath();
    c.arc(x, y, 2.5, 0, Math.PI * 2);
    c.fillStyle = 'rgba(201, 169, 110, 0.6)';
    c.fill();
  });
}

function drawSurnameOrigins() {
  const c = ctx;
  if (!c) return;
  surnames.forEach((s) => {
    const [x, y] = geoToCanvas(s.origin.lng, s.origin.lat);
    const isHighlighted =
      props.highlightedSurname === null || props.highlightedSurname === s.name;
    const alpha = isHighlighted ? 0.8 : 0.15;
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fillStyle =
      s.color +
      Math.round(alpha * 200)
        .toString(16)
        .padStart(2, '0');
    c.fill();
    c.strokeStyle =
      s.color +
      Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    c.font = 'bold 13px "PingFang SC", sans-serif';
    c.textAlign = 'center';
    c.fillText(s.name, x, y + 20);
  });
}

function drawParticles() {
  const c = ctx;
  if (!c) return;
  particles.forEach((p) => {
    const surname = surnames[p.surnameIndex];
    const isHighlighted =
      props.highlightedSurname === null ||
      props.highlightedSurname === surname.name;
    if (!isHighlighted && props.highlightedSurname !== null) return;

    const dx = mouseX - p.x;
    const dy = mouseY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const glow = Math.max(0, 1 - dist / 100);

    c.beginPath();
    c.arc(p.x, p.y, p.size + glow * 3, 0, Math.PI * 2);
    c.fillStyle =
      surname.color +
      Math.round(Math.min(1, p.alpha + glow * 0.5) * 180)
        .toString(16)
        .padStart(2, '0');
    c.fill();

    if (glow > 0.3) {
      c.beginPath();
      c.arc(p.x, p.y, p.size + 6 + glow * 4, 0, Math.PI * 2);
      c.strokeStyle = surname.color + '40';
      c.lineWidth = 1;
      c.stroke();
    }
  });
}

function updateParticles() {
  particles.forEach((p) => {
    p.progress += p.speed;
    if (p.progress > 1) {
      p.progress = 0;
      const surname = surnames[p.surnameIndex];
      const [ox, oy] = geoToCanvas(surname.origin.lng, surname.origin.lat);
      p.x = ox + (Math.random() - 0.5) * 20;
      p.y = oy + (Math.random() - 0.5) * 20;
      const pathIdx = Math.floor(Math.random() * surname.paths.length);
      p.pathIndex = pathIdx;
      const path = surname.paths[pathIdx];
      const pathPos = getPathPosition(path, 0.3 + Math.random() * 0.6);
      const [tx, ty] = geoToCanvas(pathPos[0], pathPos[1]);
      p.targetX = tx + (Math.random() - 0.5) * 15;
      p.targetY = ty + (Math.random() - 0.5) * 15;
    } else {
      const surname = surnames[p.surnameIndex];
      const path = surname.paths[p.pathIndex];
      const pos = getPathPosition(path, p.progress);
      const [cx, cy] = geoToCanvas(pos[0], pos[1]);
      p.x += (cx - p.x) * 0.02;
      p.y += (cy - p.y) * 0.02;
    }
  });
}

function drawTrails() {
  const c = ctx;
  if (!c) return;
  particles.forEach((p) => {
    const surname = surnames[p.surnameIndex];
    const isHighlighted =
      props.highlightedSurname === null ||
      props.highlightedSurname === surname.name;
    if (!isHighlighted && props.highlightedSurname !== null) return;

    const path = surname.paths[p.pathIndex];
    c.beginPath();
    const [sx, sy] = geoToCanvas(path[0].lng, path[0].lat);
    c.moveTo(sx, sy);
    for (let i = 1; i < path.length; i++) {
      const [x, y] = geoToCanvas(path[i].lng, path[i].lat);
      c.lineTo(x, y);
    }
    c.strokeStyle = surname.color + '15';
    c.lineWidth = 0.5;
    c.stroke();
  });
}

function animate() {
  const c = ctx;
  if (!c || !canvasRef.value) return;
  // 清除画布（透明背景，让 Leaflet 地图透出来）
  c.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  drawTrails();
  drawHubs();
  drawSurnameOrigins();
  updateParticles();
  drawParticles();

  animationId = requestAnimationFrame(animate);
}

// ==================== Canvas 尺寸管理 ====================

function resizeCanvas() {
  if (!canvasRef.value || !mapContainer.value) return;

  // 调整 Leaflet 地图尺寸
  if (map) {
    map.invalidateSize();
  }

  // 调整 Canvas 尺寸
  const parent = mapContainer.value;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  canvasRef.value.width = w * window.devicePixelRatio;
  canvasRef.value.height = h * window.devicePixelRatio;
  canvasRef.value.style.width = w + 'px';
  canvasRef.value.style.height = h + 'px';
  ctx = canvasRef.value.getContext('2d');
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  initParticles();
}

// ==================== 交互事件 ====================

function handleMouseMove(e: MouseEvent) {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;

  surnames.forEach((s) => {
    const [x, y] = geoToCanvas(s.origin.lng, s.origin.lat);
    const dx = mouseX - x;
    const dy = mouseY - y;
    if (dx * dx + dy * dy < 400) {
      emit('surnameHover', s.name);
      canvasRef.value!.style.cursor = 'pointer';
      return;
    }
  });

  migrationHubs.forEach((h) => {
    const [x, y] = geoToCanvas(h.lng, h.lat);
    const dx = mouseX - x;
    const dy = mouseY - y;
    if (dx * dx + dy * dy < 400) {
      canvasRef.value!.style.cursor = 'pointer';
    }
  });
}

function handleCanvasClick(e: MouseEvent) {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  for (const h of migrationHubs) {
    const [x, y] = geoToCanvas(h.lng, h.lat);
    const dx = cx - x;
    const dy = cy - y;
    if (dx * dx + dy * dy < 400) {
      emit('nodeClick', h.name);
      return;
    }
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  if (!mapContainer.value) return;

  // 初始化 Leaflet 地图（静态底图，不可交互）
  map = L.map(mapContainer.value, {
    center: [35, 105],
    zoom: 4,
    minZoom: 4,
    maxZoom: 4,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,
    keyboard: false,
  });

  // CartoDB Dark Matter 底图（暗色主题，与 Hero 背景匹配）
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      subdomains: 'abcd',
      maxZoom: 19,
    },
  ).addTo(map);

  // 等地图瓦片容器就绪后初始化 Canvas
  map.whenReady(() => {
    resizeCanvas();
    animate();
  });

  window.addEventListener('resize', resizeCanvas);
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', resizeCanvas);
  map?.remove();
  map = null;
});
</script>

<style scoped>
.migration-particles-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.leaflet-bg {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.leaflet-bg :deep(.leaflet-control-container) {
  display: none;
}

.migration-particles-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  cursor: default;
  pointer-events: auto;
}

.map-attribution {
  position: absolute;
  right: 8px;
  bottom: 4px;
  z-index: 3;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

.map-attribution a {
  color: rgba(255, 255, 255, 0.25);
  text-decoration: none;
}
</style>
