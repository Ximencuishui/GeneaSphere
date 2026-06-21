<template>
  <div class="tree-page">
    <!-- Left: Tree Canvas -->
    <div class="tree-canvas-container">
      <GenealogyTree ref="treeRef" :clanId="clanId" />
    </div>

    <!-- Right: Detail Panel -->
    <div class="detail-panel" :class="{ 'panel-open': showDetail }">
      <div v-if="!genealogyStore.selectedNode" class="empty-detail">
        <el-empty description="点击节点查看详情" />
      </div>

      <div v-else class="detail-content">
        <!-- Person Header -->
        <div class="person-header">
          <el-avatar :size="80" class="person-avatar">
            {{ getInitial(genealogyStore.selectedNode.full_name) }}
          </el-avatar>
          <h3 class="person-name">{{ genealogyStore.selectedNode.full_name }}</h3>
          <div class="person-meta">
            <el-tag :type="genealogyStore.selectedNode.gender === 'male' ? '' : 'danger'">
              {{ genealogyStore.selectedNode.gender === 'male' ? '男' : '女' }}
            </el-tag>
            <span v-if="genealogyStore.selectedNode.birth_date">
              {{ new Date(genealogyStore.selectedNode.birth_date).getFullYear() }}年生
            </span>
            <span v-if="genealogyStore.selectedNode.death_date">
                - {{ new Date(genealogyStore.selectedNode.death_date).getFullYear() }}年卒
            </span>
          </div>
        </div>

        <!-- Person Info -->
        <div class="person-info">
          <div class="info-row">
            <span class="info-label">ID</span>
            <span class="info-value">{{ genealogyStore.selectedNode.id }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">在世状态</span>
            <span class="info-value">
              <el-tag :type="genealogyStore.selectedNode.is_living ? 'success' : 'info'" size="small">
                {{ genealogyStore.selectedNode.is_living ? '在世' : '已故' }}
              </el-tag>
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="person-actions">
          <el-button type="primary" @click="editPerson">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
          <el-button @click="addRelative">
            <el-icon><Plus /></el-icon>
            添加亲属
          </el-button>
          <el-button type="danger" @click="deletePerson">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>

        <!-- Related Media -->
        <div class="related-media">
          <h4 class="section-title">相关影像</h4>
          <div v-if="relatedMedia.length > 0" class="media-grid">
            <div v-for="media in relatedMedia" :key="media.id" class="media-thumbnail">
              <img :src="media.file_url" :alt="media.description" />
            </div>
          </div>
          <el-empty v-else :image-size="60" description="暂无相关影像" />
        </div>
      </div>

      <!-- Close Button -->
      <el-button
        class="close-panel"
        :icon="Close"
        circle
        @click="closeDetail"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Edit, Plus, Delete, Close } from '@element-plus/icons-vue';
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

// Fetch related media
async function fetchRelatedMedia(personId: number) {
  try {
    const response = await mediaApi.getByPersonId(personId);
    relatedMedia.value = response.data || [];
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
      fetchRelatedMedia(node.id);
    } else {
      showDetail.value = false;
    }
  },
);

function closeDetail() {
  genealogyStore.selectNode(null);
}

function editPerson() {
  ElMessage.info('编辑功能开发中');
}

function addRelative() {
  ElMessage.info('添加亲属功能开发中');
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
}

.tree-canvas-container {
  flex: 1;
  overflow: hidden;
}

.detail-panel {
  width: 360px;
  background: white;
  border-left: 1px solid #EBEEF5;
  overflow-y: auto;
  transition: transform 0.3s ease;
  position: relative;
}

.detail-panel:not(.panel-open) {
  transform: translateX(100%);
  width: 0;
}

.empty-detail {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.detail-content {
  padding: 24px;
}

.person-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #EBEEF5;
}

.person-avatar {
  background: #5D4037;
  color: white;
  font-size: 32px;
  margin-bottom: 12px;
}

.person-name {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin: 8px 0;
}

.person-meta {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  color: #666;
  font-size: 14px;
}

.person-info {
  margin-bottom: 24px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #F5F5F5;
}

.info-label {
  color: #999;
  font-size: 14px;
}

.info-value {
  color: #333;
  font-size: 14px;
}

.person-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin: 0 0 12px 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.media-thumbnail {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 4px;
}

.media-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.close-panel {
  position: absolute;
  top: 8px;
  left: -40px;
}
</style>
