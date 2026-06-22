<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMemoryStore } from '@/stores/memory'
import BadgeDisplay from '@/components/memory/BadgeDisplay.vue'

const store = useMemoryStore()
const activeTab = ref('badges')

onMounted(async () => {
  await Promise.all([
    store.fetchBadges(),
    store.fetchVerifiedLocations(),
  ])
})
</script>

<template>
  <div class="memory-contributions-page">
    <h2>我的记忆贡献</h2>
    <p class="page-desc">您在此平台上参与地方记忆共建的记录</p>

    <el-tabs v-model="activeTab" class="contrib-tabs">
      <el-tab-pane label="我的徽章" name="badges">
        <div class="tab-content">
          <BadgeDisplay :badges="store.badges" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="已验证地区" name="locations">
        <div class="tab-content">
          <div v-if="store.verifiedLocations.length === 0" class="empty-state">
            还没有已验证的地区
          </div>
          <div v-for="loc in store.verifiedLocations" :key="loc.id" class="location-item">
            <div class="location-info">
              <span class="location-name">{{ loc.location }}</span>
              <span class="location-decade">{{ loc.decade }} 年代</span>
            </div>
            <div class="location-date">
              验证于 {{ new Date(loc.verified_at).toLocaleDateString('zh-CN') }}
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.memory-contributions-page {
  padding: 24px;
}
h2 {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 4px;
}
.page-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 24px;
}
.contrib-tabs {
  background: white;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #e8e0d8;
}
.tab-content {
  min-height: 100px;
  padding: 16px 0;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #94a3b8;
  font-size: 14px;
}
.location-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0ebe4;
}
.location-item:last-child {
  border-bottom: none;
}
.location-info {
  display: flex;
  gap: 12px;
  align-items: center;
}
.location-name {
  font-size: 15px;
  font-weight: 600;
  color: #2c3e50;
}
.location-decade {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(93, 64, 55, 0.06);
  color: #5D4037;
}
.location-date {
  font-size: 12px;
  color: #94a3b8;
}
</style>
