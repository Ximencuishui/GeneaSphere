<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const searchText = ref('')
const showDropdown = ref(false)
const suggestions = ref<{ label: string; type: string }[]>([])

const prefixSuggestions = [
  { label: '1985', type: 'year' },
  { label: '1990', type: 'year' },
  { label: '2000', type: 'year' },
  { label: '梅州', type: 'location' },
  { label: '湖北十堰', type: 'location' },
  { label: '山西洪洞', type: 'location' },
  { label: '广东南雄', type: 'location' },
  { label: '福建宁化', type: 'location' },
]

watch(searchText, (val) => {
  if (val.length > 0) {
    const filtered = prefixSuggestions.filter(s =>
      s.label.includes(val) || val.includes(s.label)
    )
    suggestions.value = filtered.length > 0 ? filtered : []
    showDropdown.value = filtered.length > 0
  } else {
    suggestions.value = []
    showDropdown.value = false
  }
})

function doSearch(query: string) {
  showDropdown.value = false
  router.push({ path: '/search', query: { q: query } })
}

function handleSearch() {
  if (searchText.value.trim()) {
    doSearch(searchText.value.trim())
  }
}

function handleBlur() {
  // 使用全局 setTimeout（不通过 Vue 实例 this.setTimeout 访问）
  globalThis.setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

function selectSuggestion(item: { label: string }) {
  searchText.value = item.label
  doSearch(item.label)
}
</script>

<template>
  <div class="quick-search-bar">
    <div class="search-input-wrapper">
      <el-icon class="search-icon"><i class="icon-search">&#128269;</i></el-icon>
      <input
        v-model="searchText"
        placeholder="搜索年份、地点、老照片..."
        class="search-input"
        @keyup.enter="handleSearch"
        @focus="showDropdown = suggestions.length > 0"
        @blur="handleBlur"
      />
      <el-button
        class="search-btn"
        size="small"
        @click="handleSearch"
      >
        探索
      </el-button>
    </div>
    <div v-if="showDropdown && suggestions.length > 0" class="search-dropdown">
      <div
        v-for="(item, idx) in suggestions"
        :key="idx"
        class="suggestion-item"
        @mousedown.prevent="selectSuggestion(item)"
      >
        <span class="suggestion-type">{{ item.type === 'year' ? '年份' : '地点' }}</span>
        <span class="suggestion-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-search-bar {
  position: relative;
  width: 100%;
  max-width: 480px;
  z-index: 20;
}
.search-input-wrapper {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50px;
  padding: 4px 4px 4px 20px;
  transition: all 0.3s;
}
.search-input-wrapper:focus-within {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(201, 169, 110, 0.5);
  box-shadow: 0 0 20px rgba(201, 169, 110, 0.15);
}
.search-icon {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  margin-right: 8px;
  font-style: normal;
}
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  height: 36px;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.search-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
.search-btn {
  background: linear-gradient(135deg, #C9A96E, #B8955A);
  border: none;
  color: white;
  border-radius: 50px;
  padding: 8px 20px;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.2s;
  height: 36px;
}
.search-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 15px rgba(201, 169, 110, 0.4);
}
.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgba(30, 28, 34, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  z-index: 30;
}
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
.suggestion-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: white;
}
.suggestion-type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(201, 169, 110, 0.15);
  color: #C9A96E;
}
.suggestion-label {
  font-weight: 500;
}
@media (max-width: 768px) {
  .quick-search-bar {
    max-width: 100%;
  }
}
</style>
