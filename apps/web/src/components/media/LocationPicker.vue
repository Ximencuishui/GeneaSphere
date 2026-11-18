<template>
  <div class="location-picker">
    <el-autocomplete
      :model-value="modelValue"
      :fetch-suggestions="queryLocations"
      :disabled="disabled"
      clearable
      placeholder="从本族已有拍摄地点补全"
      style="width: 100%;"
      @update:model-value="emit('update:modelValue', $event || '')"
      @select="onSelect"
    />
    <div v-if="suggestions.length" class="location-chips">
      <button
        v-for="name in suggestions"
        :key="name"
        type="button"
        class="location-chip"
        :disabled="disabled"
        @click="pick(name)"
      >
        {{ name }}
      </button>
    </div>
    <p class="location-hint">在地图上点选后，写入地点名称，并把经纬度交给表单。从本族已有地点补全时只填地名，不会编造坐标。</p>
    <div ref="mapEl" class="location-map" />
    <p v-if="pickedHint" class="location-hint">{{ pickedHint }}</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import L from 'leaflet'

const props = defineProps<{
  clanSlug: string
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'coordinates', value: { latitude: number; longitude: number }): void
}>()

const suggestions = ref<string[]>([])
const pickedHint = ref('')
const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let marker: L.CircleMarker | null = null

const pick = (name: string) => {
  if (props.disabled) return
  emit('update:modelValue', name)
}

const onSelect = (item: { value: string }) => {
  pick(item.value)
}

const queryLocations = async (query: string, cb: (items: { value: string }[]) => void) => {
  try {
    const res = await axios.get(`/api/admin/media/${props.clanSlug}/locations`, {
      params: { keyword: query?.trim() || undefined },
    })
    const names = (res.data?.data || []) as string[]
    if (!query?.trim()) suggestions.value = names
    cb(names.map((name) => ({ value: name })))
  } catch {
    cb([])
  }
}

const placeName = (data: any) => {
  const address = data?.address || {}
  const parts = [address.state, address.city || address.town || address.county, address.village || address.suburb || address.road]
    .filter((part) => typeof part === 'string' && part.trim())
  if (parts.length) return parts.join('')
  return String(data?.display_name || '').trim()
}

const onMapClick = async (event: L.LeafletMouseEvent) => {
  if (props.disabled || !map) return
  const { lat, lng } = event.latlng
  if (marker) marker.setLatLng(event.latlng)
  else marker = L.circleMarker(event.latlng, { radius: 7, color: '#8B5A2B', fillOpacity: 0.9 }).addTo(map)
  emit('coordinates', { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })
  pickedHint.value = `已记下经纬度 ${lat.toFixed(5)}, ${lng.toFixed(5)}。正在解析地点名称…`
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-CN`,
    )
    if (!res.ok) throw new Error('reverse failed')
    const name = placeName(await res.json())
    if (!name) throw new Error('empty name')
    emit('update:modelValue', name)
    pickedHint.value = `已写入地点名称：${name}`
  } catch {
    pickedHint.value = `选点参考：${lat.toFixed(5)}, ${lng.toFixed(5)}。未能解析地点名称，请从本族已有地点选择或手动填写。`
    ElMessage.warning('地图上未能解析出地点名称，请从已有地点选择或手动填写')
  }
}

onMounted(async () => {
  await nextTick()
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    center: [26.6, 118.2],
    zoom: 5,
    minZoom: 3,
    maxZoom: 18,
  })
  L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '&copy; 高德地图',
    },
  ).addTo(map)
  map.on('click', onMapClick)
  window.setTimeout(() => map?.invalidateSize(), 250)
  queryLocations('', () => undefined)
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<style scoped>
.location-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.location-chip {
  border: 1px solid var(--el-border-color);
  background: #fff;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
}

.location-chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.location-hint {
  margin: 8px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.location-map {
  height: 220px;
  margin-top: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #f5f7fa;
}
</style>
