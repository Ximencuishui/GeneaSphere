<template>
  <div class="timeline-page">
    <el-card class="timeline-card">
      <template #header>
        <div class="card-header">
          <h2>📷 时光长廊</h2>
          <div class="header-actions">
            <el-button type="primary" @click="handleUpload">
              <el-icon><Upload /></el-icon>
              上传照片
            </el-button>
            <el-button @click="$router.push('/user-center/videos/create')">
              <el-icon><VideoCamera /></el-icon>
              生成音像墙
            </el-button>
          </div>
        </div>
      </template>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select
          v-model="selectedYear"
          placeholder="按年份筛选"
          clearable
          @change="handleFilterChange"
        >
          <el-option
            v-for="year in availableYears"
            :key="year"
            :label="year"
            :value="year"
          />
        </el-select>

        <el-input
          v-model="searchLocation"
          placeholder="按地点搜索"
          clearable
          @input="handleFilterChange"
          style="width: 200px; margin-left: 10px;"
        >
          <template #prefix>
            <el-icon><Location /></el-icon>
          </template>
        </el-input>

        <el-switch
          v-model="showRecommendations"
          active-text="显示同村推荐"
          @change="handleToggleRecommendations"
          style="margin-left: 20px;"
        />
      </div>

      <!-- 推荐影像区域 -->
      <div v-if="showRecommendations && recommendedMedia.length > 0" class="recommendation-section">
        <h3>🏘️ 同村推荐（来自其他家族）</h3>
        <div class="media-grid recommendation-grid">
          <div
            v-for="media in recommendedMedia"
            :key="'rec-' + media.id"
            class="media-card"
            @click="handleViewMedia(media)"
          >
            <div class="media-image">
              <img :src="media.file_url" :alt="media.description || '照片'" />
            </div>
            <div class="media-info">
              <div class="media-year">{{ media.taken_year || '未知年份' }}</div>
              <div class="media-location">{{ media.taken_location || '未知地点' }}</div>
              <div class="media-clan">来自家族：{{ media.clan_name }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 时光轴 -->
      <div class="timeline-container">
        <div v-for="group in groupedMedia" :key="group.year" class="timeline-year-group">
          <div class="year-marker">
            <h3>{{ group.year }}</h3>
            <div class="media-count">{{ group.items.length }} 张照片</div>
          </div>

          <div class="media-grid">
            <div
              v-for="media in group.items"
              :key="media.id"
              class="media-card"
              @click="handleViewMedia(media)"
            >
              <div class="media-image">
                <img :src="media.file_url" :alt="media.description || '照片'" />
              </div>
              <div class="media-info">
                <div class="media-location">
                  <el-icon><Location /></el-icon>
                  {{ media.taken_location || '未知地点' }}
                </div>
                <div class="media-description">{{ media.description || '' }}</div>
                <div class="media-persons">
                  <el-tag
                    v-for="link in media.person_links"
                    :key="link.person_id"
                    size="small"
                  >
                    {{ link.person_name }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <el-empty
          v-if="groupedMedia.length === 0 && !loading"
          description="暂无照片，快来上传吧"
        />
      </div>

      <!-- 加载更多 -->
      <div v-if="hasMore" class="load-more">
        <el-button :loading="loading" @click="loadMore">加载更多</el-button>
      </div>
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传照片" width="500px">
      <el-form :model="uploadForm" label-width="80px">
        <el-form-item label="照片">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".jpg,.jpeg,.png,.gif"
            :on-change="handleUploadFileChange"
            drag
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              将文件拖到此处，或 <em>点击上传</em>
            </div>
          </el-upload>
        </el-form-item>

        <el-form-item label="拍摄年份">
          <el-input-number
            v-model="uploadForm.taken_year"
            :min="1800"
            :max="new Date().getFullYear()"
            placeholder="如：1990"
          />
        </el-form-item>

        <el-form-item label="拍摄地点">
          <el-input
            v-model="uploadForm.taken_location"
            placeholder="如：广东省梅州市某某村"
          />
        </el-form-item>

        <el-form-item label="照片描述">
          <el-input
            v-model="uploadForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述这张照片的故事..."
          />
        </el-form-item>

        <el-form-item label="关联人物">
          <el-select
            v-model="uploadForm.person_ids"
            multiple
            filterable
            placeholder="搜索并选择人物"
          >
            <el-option
              v-for="person in clanPersons"
              :key="person.id"
              :label="person.full_name"
              :value="person.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="handleSubmitUpload">
          上传
        </el-button>
      </template>
    </el-dialog>

    <!-- 照片预览对话框 -->
    <el-dialog v-model="previewDialogVisible" title="照片详情" width="800px">
      <div v-if="selectedMedia" class="media-preview">
        <img :src="selectedMedia.file_url" :alt="selectedMedia.description" class="preview-image" />

        <div class="preview-info">
          <h3>{{ selectedMedia.description || '未命名照片' }}</h3>

          <el-descriptions :column="2" border>
            <el-descriptions-item label="拍摄年份">
              {{ selectedMedia.taken_year || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="拍摄地点">
              {{ selectedMedia.taken_location || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="上传时间">
              {{ formatDate(selectedMedia.created_at) }}
            </el-descriptions-item>
            <el-descriptions-item label="关联人物">
              <el-tag
                v-for="link in selectedMedia.person_links"
                :key="link.person_id"
                size="small"
                style="margin-right: 5px;"
              >
                {{ link.person_name }}
              </el-tag>
              <span v-if="!selectedMedia.person_links?.length">暂无</span>
            </el-descriptions-item>
          </el-descriptions>

          <div class="preview-actions" style="margin-top: 20px;">
            <el-button type="danger" @click="handleDeleteMedia(selectedMedia)">
              删除照片
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Upload, UploadFilled, Location } from '@element-plus/icons-vue';
import { useClanStore } from '@/stores/clan';
import { listMedia, deleteMedia as deleteMediaApi, recommendMedia } from '@/api/media';
import type { MediaArchive } from '@prisma/client';

const route = useRoute();
const router = useRouter();
const clanStore = useClanStore();

// 状态
const loading = ref(false);
const mediaList = ref<MediaArchive[]>([]);
const recommendedMedia = ref<MediaArchive[]>([]);
const selectedYear = ref<number | null>(null);
const searchLocation = ref('');
const showRecommendations = ref(false);
const hasMore = ref(false);
const uploading = ref(false);

// 对话框状态
const uploadDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const selectedMedia = ref<MediaArchive | null>(null);
const uploadForm = reactive({
  file: null as File | null,
  taken_year: undefined as number | undefined,
  taken_location: '',
  description: '',
  person_ids: [] as (string | number)[],
});
const clanPersons = ref<{ id: bigint; full_name: string }[]>([]);

// 可用年份（从媒体列表中提取）
const availableYears = computed(() => {
  const years = new Set<number>();
  mediaList.value.forEach(m => {
    if (m.taken_year) years.add(m.taken_year);
  });
  return Array.from(years).sort((a, b) => b - a); // 降序
});

// 按年份分组媒体
const groupedMedia = computed(() => {
  const groups: { year: number | string; items: MediaArchive[] }[] = [];
  const map = new Map<number | string, MediaArchive[]>();

  const filtered = mediaList.value.filter(m => {
    if (selectedYear.value && m.taken_year !== selectedYear.value) return false;
    if (searchLocation.value && m.taken_location &&
        !m.taken_location.includes(searchLocation.value)) return false;
    return true;
  });

  filtered.forEach(m => {
    const year = m.taken_year || '未知年份';
    if (!map.has(year)) {
      map.set(year, []);
    }
    map.get(year)!.push(m);
  });

  map.forEach((items, year) => {
    groups.push({ year, items });
  });

  // 按年份降序排序
  groups.sort((a, b) => {
    if (a.year === '未知年份') return 1;
    if (b.year === '未知年份') return -1;
    return (b.year as number) - (a.year as number);
  });

  return groups;
});

// 加载媒体列表
async function loadMedia() {
  if (!clanStore.currentClan) {
    ElMessage.error('请先选择家族');
    return;
  }

  loading.value = true;
  try {
    const result = await listMedia(clanStore.currentClan.id);
    mediaList.value = result.data || result;
  } catch (error: any) {
    ElMessage.error(`加载失败：${error.message}`);
  } finally {
    loading.value = false;
  }
}

// 加载推荐媒体
async function loadRecommendations() {
  if (!clanStore.currentClan) return;

  try {
    const result = await recommendMedia(
      clanStore.currentClan.id,
      searchLocation.value || undefined,
      selectedYear.value || undefined
    );
    recommendedMedia.value = result.data || result;
  } catch (error: any) {
    console.error('加载推荐失败：', error);
  }
}

// 处理筛选条件变化
function handleFilterChange() {
  if (showRecommendations.value) {
    loadRecommendations();
  }
}

// 切换推荐显示
function handleToggleRecommendations(show: boolean) {
  if (show) {
    loadRecommendations();
  }
}

// 处理上传按钮点击
function handleUpload() {
  uploadForm.file = null;
  uploadForm.taken_year = undefined;
  uploadForm.taken_location = '';
  uploadForm.description = '';
  uploadForm.person_ids = [];
  uploadDialogVisible.value = true;

  // TODO: 加载家族人物列表
}

// 处理上传文件选择
function handleUploadFileChange(file: any) {
  uploadForm.file = file.raw;
}

// 提交上传
async function handleSubmitUpload() {
  if (!uploadForm.file) {
    ElMessage.error('请选择照片');
    return;
  }

  if (!clanStore.currentClan) {
    ElMessage.error('请先选择家族');
    return;
  }

  uploading.value = true;
  try {
    await uploadMedia({
      file: uploadForm.file,
      clan_id: clanStore.currentClan.id,
      uploader_id: 'current-user-id', // TODO: 从 auth store 获取
      taken_year: uploadForm.taken_year,
      taken_location: uploadForm.taken_location,
      description: uploadForm.description,
    });

    ElMessage.success('上传成功！');
    uploadDialogVisible.value = false;
    loadMedia(); // 重新加载
  } catch (error: any) {
    ElMessage.error(`上传失败：${error.message}`);
  } finally {
    uploading.value = false;
  }
}

// 查看媒体详情
function handleViewMedia(media: MediaArchive) {
  selectedMedia.value = media;
  previewDialogVisible.value = true;
}

// 删除媒体
async function handleDeleteMedia(media: MediaArchive) {
  try {
    await ElMessageBox.confirm('确定要删除这张照片吗？', '确认删除', {
      type: 'warning',
    });

    await deleteMediaApi(media.id);
    ElMessage.success('删除成功');
    previewDialogVisible.value = false;
    loadMedia(); // 重新加载
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败：${error.message}`);
    }
  }
}

// 加载更多（占位）
function loadMore() {
  // TODO: 实现分页加载
  ElMessage.info('加载更多功能开发中...');
}

// 格式化日期
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// 初始化
onMounted(() => {
  loadMedia();
});
</script>

<style scoped>
.timeline-page {
  max-width: 1200px;
  margin: 20px auto;
  padding: 0 20px;
}

.timeline-card {
  min-height: 600px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
}

.filter-bar {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
}

.recommendation-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #fef9e7;
  border-radius: 8px;
}

.recommendation-section h3 {
  margin-top: 0;
  color: #c9a96e;
}

.timeline-container {
  margin-top: 20px;
}

.timeline-year-group {
  margin-bottom: 40px;
}

.year-marker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #c9a96e;
}

.year-marker h3 {
  margin: 0;
  font-size: 24px;
  color: #5d4037;
}

.media-count {
  color: #999;
  font-size: 14px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.recommendation-grid {
  margin-top: 15px;
}

.media-card {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.media-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.media-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.media-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-info {
  padding: 10px;
}

.media-location {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #666;
  font-size: 12px;
  margin-bottom: 5px;
}

.media-description {
  font-size: 14px;
  color: #333;
  margin-bottom: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-persons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.media-year {
  font-size: 12px;
  color: #999;
}

.media-clan {
  font-size: 12px;
  color: #c9a96e;
  margin-top: 5px;
}

.load-more {
  text-align: center;
  margin-top: 30px;
}

.media-preview {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview-image {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 8px;
}

.preview-info {
  padding: 10px 0;
}

.preview-info h3 {
  margin-top: 0;
}
</style>
