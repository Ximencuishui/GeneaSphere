<template>
  <div class="clan-detail-page">
    <!-- Back Button -->
    <div class="back-link">
      <el-button text @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回家族列表
      </el-button>
    </div>

    <!-- Loading State -->
    <div v-if="clanStore.loading" class="loading-container">
      <el-skeleton :rows="8" animated />
    </div>

    <!-- Clan Detail -->
    <div v-else-if="clanStore.currentClan" class="detail-container">
      <!-- Header -->
      <div class="detail-header">
        <div class="header-info">
          <h2 class="clan-name">{{ clanStore.currentClan.name }}</h2>
          <p v-if="clanStore.currentClan.description" class="clan-description">
            {{ clanStore.currentClan.description }}
          </p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="goToTree">
            <el-icon><Share /></el-icon>
            查看族谱树
          </el-button>
          <el-button @click="editClan">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
        </div>
      </div>

      <!-- Statistics Cards -->
      <div class="statistics-cards">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ statistics.person_count || 0 }}</div>
          <div class="stat-label">族人数量</div>
        </el-card>

        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ statistics.media_count || 0 }}</div>
          <div class="stat-label">影像档案</div>
        </el-card>

        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ statistics.family_count || 0 }}</div>
          <div class="stat-label">家庭单元</div>
        </el-card>
      </div>

      <!-- Recent Members -->
      <div class="recent-members">
        <h3 class="section-title">最新成员</h3>
        <div v-if="recentMembers.length > 0" class="member-list">
          <div
            v-for="person in recentMembers"
            :key="person.id"
            class="member-item"
            @click="goToPersonDetail(person.id)"
          >
            <el-avatar :size="40" class="member-avatar">
              {{ person.full_name.charAt(0) }}
            </el-avatar>
            <div class="member-info">
              <div class="member-name">{{ person.full_name }}</div>
              <div class="member-meta">
                {{ person.gender === 'male' ? '男' : '女' }}
                <span v-if="person.birth_date">
                  · {{ new Date(person.birth_date).getFullYear() }}年生
                </span>
              </div>
            </div>
            <el-icon class="arrow-icon"><ArrowRight /></el-icon>
          </div>
        </div>
        <el-empty v-else description="暂无成员，请先添加" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else class="error-state">
      <el-empty description="家族不存在或已被删除">
        <el-button type="primary" @click="router.push('/clans')">
          返回家族列表
        </el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Edit, Share, ArrowRight } from '@element-plus/icons-vue';
import { useClanStore } from '@/stores/clan';
import { clanApi } from '@/api/clan';
import type { Clan, Person } from '@/types';

const route = useRoute();
const router = useRouter();
const clanStore = useClanStore();

const statistics = ref({
  person_count: 0,
  media_count: 0,
  family_count: 0,
});
const recentMembers = ref<Person[]>([]);

// Fetch clan details on mount
onMounted(async () => {
  const clanId = route.params.id as string;

  try {
    // Fetch clan details
    await clanStore.fetchClanById(clanId);

    // Fetch statistics
    const stats = await clanApi.getStatistics(clanId);
    statistics.value = stats;

    // Get recent members from the clan object
    if (clanStore.currentClan && '_count' in clanStore.currentClan) {
      // Recent members are included in the clan response
      // This is a simplified version - in production, you'd have a separate API
    }
  } catch (error: any) {
    ElMessage.error(error.message || '获取家族详情失败');
  }
});

// Methods
function goToTree() {
  router.push(`/tree/${route.params.id}`);
}

function editClan() {
  // Open edit dialog (simplified - in production, you'd reuse the create/edit dialog)
  ElMessage.info('编辑功能开发中');
}

function goToPersonDetail(personId: number) {
  router.push(`/persons/${personId}`);
}
</script>

<style scoped>
.clan-detail-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.back-link {
  margin-bottom: 16px;
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.clan-name {
  font-size: 24px;
  font-weight: 600;
  color: #5D4037;
  margin: 0 0 8px 0;
}

.clan-description {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.statistics-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-card {
  text-align: center;
  padding: 24px;
}

.stat-value {
  font-size: 36px;
  font-weight: 600;
  color: #5D4037;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #999;
}

.section-title {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  margin: 0 0 16px 0;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.3s ease;
}

.member-item:hover {
  background: #F5F5F5;
}

.member-avatar {
  background: #5D4037;
  color: white;
  font-size: 16px;
}

.member-info {
  flex: 1;
}

.member-name {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.member-meta {
  font-size: 12px;
  color: #999;
}

.arrow-icon {
  color: #999;
}
</style>
