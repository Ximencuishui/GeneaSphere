<template>
  <div class="tree-page">
    <!-- Top: Navigation Bar -->
    <div class="tree-navbar" v-if="genealogyStore.selectedNode">
      <div class="breadcrumb-path">
        <el-icon><Connection /></el-icon>
        <span class="breadcrumb-label">传承路径</span>
        <span v-if="genealogyStore.mainLineage.length" class="breadcrumb-count">
          ({{ genealogyStore.mainLineage.length }}代)
        </span>
      </div>
      <div class="navbar-actions">
        <el-button size="small" @click="focusMainLineage" :icon="Connection" plain>
          聚焦传承线路
        </el-button>
        <el-button size="small" @click="highlightFamilyCircle" :icon="User" plain>
          三代亲属
        </el-button>
      </div>
    </div>

    <!-- Left: Tree Canvas -->
    <div class="tree-canvas-container">
      <GenealogyTree ref="treeRef" :clanId="clanId" />
    </div>

    <!-- Right: Detail Panel -->
    <transition name="slide-fade">
      <div v-if="showDetail" class="detail-panel">
        <div v-if="!genealogyStore.selectedNode" class="empty-detail">
          <el-empty description="点击节点查看详情" :image-size="120">
            <template #image>
              <el-icon :size="80" color="#C9A96E"><User /></el-icon>
            </template>
          </el-empty>
        </div>

        <div v-else class="detail-content">
          <!-- Person Header with Warm Gradient -->
          <div class="person-header" :class="{ 'is-deceased': !genealogyStore.selectedNode.is_living }">
            <div class="header-bg"></div>
            <div class="person-avatar-wrapper">
              <el-avatar :size="90" class="person-avatar" v-if="!genealogyStore.selectedNode.thumbnail_url">
                {{ getInitial(genealogyStore.selectedNode.full_name || '') }}
              </el-avatar>
              <el-avatar :size="90" class="person-avatar has-photo" v-else :src="genealogyStore.selectedNode.thumbnail_url" />
            </div>
            <h3 class="person-name">{{ genealogyStore.selectedNode.full_name || genealogyStore.selectedNode.label }}</h3>
            <div class="person-meta">
              <el-tag 
                :type="genealogyStore.selectedNode.gender === 'male' ? '' : 'danger'"
                size="large"
                effect="dark"
              >
                <el-icon><Male v-if="genealogyStore.selectedNode.gender === 'male'" /><Female v-else /></el-icon>
                {{ genealogyStore.selectedNode.gender === 'male' ? '男' : '女' }}
              </el-tag>
              <div class="lifespan" v-if="genealogyStore.selectedNode.birth_date">
                <el-icon><Calendar /></el-icon>
                <span>{{ formatYear(genealogyStore.selectedNode.birth_date) }}</span>
                <span v-if="genealogyStore.selectedNode.death_date"> - {{ formatYear(genealogyStore.selectedNode.death_date) }}</span>
                <span v-else-if="!genealogyStore.selectedNode.is_living"> - 已故</span>
              </div>
            </div>
          </div>

          <!-- Person Info Cards -->
          <div class="person-info-section">
            <h4 class="section-title">
              <el-icon><InfoFilled /></el-icon>
              基本信息
            </h4>
            <div class="info-cards">
              <div class="info-card">
                <div class="card-icon" style="background: #E3F2FD; color: #1976D2;">
                  <el-icon><Postcard /></el-icon>
                </div>
                <div class="card-content">
                  <div class="card-label">ID</div>
                  <div class="card-value">{{ genealogyStore.selectedNode.id }}</div>
                </div>
              </div>
              <div class="info-card">
                <div class="card-icon" :style="{ background: genealogyStore.selectedNode.is_living ? '#E8F5E9' : '#F5F5F5', color: genealogyStore.selectedNode.is_living ? '#4CAF50' : '#9E9E9E' }">
                  <el-icon><CircleCheckFilled v-if="genealogyStore.selectedNode.is_living" /><CircleCloseFilled v-else /></el-icon>
                </div>
                <div class="card-content">
                  <div class="card-label">在世状态</div>
                  <div class="card-value">
                    <el-tag 
                      :type="genealogyStore.selectedNode.is_living ? 'success' : 'info'" 
                      size="small"
                      effect="light"
                    >
                      {{ genealogyStore.selectedNode.is_living ? '在世' : '已故' }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="person-actions">
            <h4 class="section-title">
              <el-icon><Operation /></el-icon>
              操作
            </h4>
            <div class="action-buttons">
              <el-button type="primary" @click="editPerson" :icon="Edit" size="large">
                编辑信息
              </el-button>
              <el-button @click="addRelative" :icon="Plus" size="large">
                添加亲属
              </el-button>
              <el-button @click="generateVideo" :icon="VideoCamera" size="large">
                生成历史音像墙
              </el-button>
              <el-button @click="generateLineageVideo" :icon="VideoPlay" size="large">
                生成直系血缘视频
              </el-button>
              <el-button type="danger" @click="deletePerson" :icon="Delete" size="large" plain>
                删除人员
              </el-button>
            </div>
          </div>

          <!-- Related Media -->
          <div class="related-media">
            <h4 class="section-title">
              <el-icon><Picture /></el-icon>
              相关影像
            </h4>
            <div v-if="relatedMedia.length > 0" class="media-grid">
              <div 
                v-for="media in relatedMedia" 
                :key="media.id" 
                class="media-thumbnail"
                @click="viewMedia(media)"
              >
                <img :src="media.file_url" :alt="media.description" />
                <div class="media-overlay">
                  <el-icon :size="24"><ZoomIn /></el-icon>
                </div>
              </div>
            </div>
            <el-empty v-else :image-size="80" description="暂无相关影像" />
          </div>
        </div>

        <!-- Close Button -->
        <div class="panel-header-actions">
          <el-button
            class="close-panel-btn"
            :icon="Close"
            circle
            size="default"
            @click="closeDetail"
            title="关闭详情面板"
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { 
  Edit, 
  Plus, 
  Delete, 
  Close,
  User,
  Male,
  Female,
  Calendar,
  InfoFilled,
  Postcard,
  CircleCheckFilled,
  CircleCloseFilled,
  Operation,
  Picture,
  ZoomIn,
  VideoCamera,
  VideoPlay,
  Connection
} from '@element-plus/icons-vue';
import GenealogyTree from '@/components/GenealogyTree.vue';
import { useGenealogyStore } from '@/stores/genealogy';
import { mediaApi } from '@/api/media';
import type { MediaArchive } from '@/types';

const route = useRoute();
const genealogyStore = useGenealogyStore();
const treeRef = ref();
const showDetail = ref(true);
const relatedMedia = ref<MediaArchive[]>([]);

const clanId = computed(() => route.params.clanId as string);

// Get initial letter of name
function getInitial(name: string) {
  return name ? name.charAt(0) : '?';
}

// Format year from date string
function formatYear(dateStr: string) {
  return new Date(dateStr).getFullYear().toString();
}

// View media in dialog
function viewMedia(_media: MediaArchive) {
  ElMessage.info('查看影像功能开发中');
}

// Fetch related media
async function fetchRelatedMedia(personId: number) {
  try {
    const response = await mediaApi.getByPersonId(personId);
    relatedMedia.value = response;
  } catch (error) {
    console.error('Failed to fetch related media:', error);
  }
}

// Watch for selected node changes
watch(
  () => genealogyStore.selectedNode,
  (node) => {
    if (node) {
      showDetail.value = true;
      const personId = typeof node.id === 'string' ? parseInt(node.id) : node.id;
      fetchRelatedMedia(personId);
    } else {
      showDetail.value = false;
    }
  },
);

function closeDetail() {
  genealogyStore.selectNode(null);
}

// Focus on main lineage in the genealogy tree
function focusMainLineage() {
  treeRef.value?.focusMainLineage?.();
}

// Highlight family circle (3 generations)
function highlightFamilyCircle() {
  if (!genealogyStore.selectedNode) return
  ElMessage.info('三代亲属高亮功能开发中')
}

function editPerson() {
  ElMessage.info('编辑功能开发中');
}

function addRelative() {
  ElMessage.info('添加亲属功能开发中');
}

function generateVideo() {
  if (!genealogyStore.selectedNode) return;
  const personId = genealogyStore.selectedNode.id;
  // 跳转到视频创建页，并预填目标人物
  window.location.href = `/user-center/videos/create?personId=${personId}`;
}

function generateLineageVideo() {
  if (!genealogyStore.selectedNode) return;
  const personId = genealogyStore.selectedNode.id;
  // 跳转到直系血缘视频设置页
  window.location.href = `/user-center/lineage-video?personId=${personId}`;
}

async function deletePerson() {
  if (!genealogyStore.selectedNode) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除"${genealogyStore.selectedNode.full_name}"吗？此操作不可恢复！`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );

    // Call API to delete
    ElMessage.success('删除成功');
    genealogyStore.selectNode(null);
    treeRef.value?.refresh();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

onMounted(() => {
  // Initialize
});
</script>

<style scoped>
.tree-page {
  display: flex;
  height: 100%;
  position: relative;
  background: #FAF8F5;
}

.tree-canvas-container {
  flex: 1;
  overflow: hidden;
}

/* Navigation Bar */
.tree-navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid rgba(201, 169, 110, 0.25);
  backdrop-filter: blur(12px);
  z-index: 5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.breadcrumb-path {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.breadcrumb-label {
  font-weight: 600;
  color: var(--color-accent);
}

.breadcrumb-count {
  color: var(--color-text-muted);
  font-size: 12px;
}

.navbar-actions {
  display: flex;
  gap: 8px;
}

/* Deceased person header - warm golden glow */
.person-header.is-deceased {
  background: linear-gradient(135deg, #5D4037 0%, #8D6E63 100%);
}

.person-header.is-deceased .person-avatar {
  border-color: #C9A96E;
  box-shadow: 0 0 0 3px rgba(201, 169, 110, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Detail Panel with Enhanced Styling */
.detail-panel {
  width: 420px;
  background: var(--color-bg-primary);
  border-left: 2px solid rgba(201, 169, 110, 0.3);
  overflow-y: auto;
  position: relative;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
}

/* Slide Fade Transition */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.empty-detail {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 40px;
}

.detail-content {
  padding: 0;
}

/* Person Header with Gradient */
.person-header {
  position: relative;
  text-align: center;
  padding: 40px 24px 32px;
  background: linear-gradient(135deg, #5D4037 0%, #8D6E63 100%);
  color: white;
  overflow: hidden;
}

.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.person-avatar {
  position: relative;
  z-index: 1;
  background: white;
  color: #5D4037;
  font-size: 36px;
  font-weight: 600;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  border: 3px solid rgba(255, 255, 255, 0.3);
}

.person-name {
  position: relative;
  z-index: 1;
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin: 0 0 12px 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.person-meta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  font-size: 14px;
}

.person-meta .el-tag {
  padding: 8px 16px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.lifespan {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

/* Info Section */
.person-info-section {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.section-title .el-icon {
  color: var(--color-accent);
}

.info-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.info-card:hover {
  background: var(--color-bg-tertiary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
}

.card-label {
  color: var(--color-text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.card-value {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 500;
}

/* Actions Section */
.person-actions {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-buttons .el-button {
  width: 100%;
  justify-content: center;
}

/* Related Media Section */
.related-media {
  padding: 24px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.media-thumbnail {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.media-thumbnail:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.media-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.media-thumbnail:hover img {
  transform: scale(1.1);
}

.media-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  color: white;
}

.media-thumbnail:hover .media-overlay {
  opacity: 1;
}

/* Panel Header Actions */
.panel-header-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
}

.close-panel-btn {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(201, 169, 110, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.close-panel-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: #C9A96E;
  transform: scale(1.05);
}

/* Responsive Design */
@media (max-width: 1200px) {
  .detail-panel {
    width: 360px;
  }
}

@media (max-width: 768px) {
  .tree-page {
    flex-direction: column;
    height: 100vh;
  }
  
  .tree-canvas-container {
    flex: 1;
    min-height: 40vh;
  }
  
  .detail-panel {
    width: 100%;
    max-height: 60vh;
    border-left: none;
    border-top: 2px solid rgba(201, 169, 110, 0.3);
    position: relative;
  }
  
  .panel-header-actions {
    top: 12px;
    right: 12px;
  }
  
  .close-panel-btn {
    width: 36px;
    height: 36px;
  }
  
  .media-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .person-header {
    padding: 32px 16px 24px;
  }
  
  .person-avatar {
    width: 70px !important;
    height: 70px !important;
    font-size: 28px !important;
  }
  
  .person-name {
    font-size: 20px;
  }
  
  .person-info-section,
  .person-actions,
  .related-media {
    padding: 16px;
  }
  
  .action-buttons .el-button {
    padding: 10px 16px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .media-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  
  .person-meta {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .action-buttons .el-button {
    padding: 8px 12px;
    font-size: 12px;
  }
}
</style>
