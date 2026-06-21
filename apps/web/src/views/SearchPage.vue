<template>
  <div class="search-page">
    <el-card class="search-card">
      <template #header>
        <div class="card-header">
          <h2>🔍 寻亲广场</h2>
          <el-button type="primary" @click="showCreateDialog = true">
            <el-icon><EditPen /></el-icon>
            发布寻亲帖
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索祖籍地、字辈关键词..."
          clearable
          @input="handleSearch"
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-input
          v-model="searchOriginPlace"
          placeholder="按祖籍地筛选"
          clearable
          @input="handleSearch"
          class="origin-filter"
        >
          <template #prefix>
            <el-icon><Location /></el-icon>
          </template>
        </el-input>
      </div>

      <!-- 寻亲帖列表 -->
      <div class="posts-list">
        <el-empty
          v-if="posts.length === 0 && !loading"
          description="暂无寻亲帖，快来发布第一条吧"
        />

        <div
          v-for="item in posts"
          :key="item.post.id"
          class="post-card"
          @click="handleViewPost(item.post)"
        >
          <div class="post-header">
            <div class="post-origin">
              <el-icon><Location /></el-icon>
              <strong>{{ item.post.origin_place }}</strong>
            </div>
            <div class="post-score" v-if="item.score > 0">
              <el-tag type="success">匹配度：{{ item.score }}</el-tag>
            </div>
          </div>

          <div class="post-keywords">
            <el-tag
              v-for="keyword in item.post.xipai_keywords"
              :key="keyword"
              size="small"
              class="keyword-tag"
            >
              {{ keyword }}
            </el-tag>
          </div>

          <div class="post-footer">
            <div class="post-time">
              {{ formatDate(item.post.created_at) }}
            </div>
            <el-button
              type="primary"
              link
              @click.stop="handleViewContact(item.post)"
            >
              查看联系方式
            </el-button>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="30"><Loading /></el-icon>
        <span>正在搜索...</span>
      </div>
    </el-card>

    <!-- 发布寻亲帖对话框 -->
    <el-dialog v-model="showCreateDialog" title="发布寻亲帖" width="600px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="祖籍地 *">
          <el-input
            v-model="createForm.origin_place"
            placeholder="如：广东省梅州市某某村"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="字辈关键词 *">
          <div class="keywords-input">
            <el-tag
              v-for="keyword in createForm.xipai_keywords"
              :key="keyword"
              closable
              @close="handleRemoveKeyword(keyword)"
            >
              {{ keyword }}
            </el-tag>
            <el-input
              v-if="keywordInputVisible"
              ref="keywordInputRef"
              v-model="keywordInputValue"
              size="small"
              @keyup.enter="handleAddKeyword"
              @blur="handleAddKeyword"
              style="width: 100px;"
            />
            <el-button
              v-else
              size="small"
              @click="keywordInputVisible = true"
            >
              + 添加关键词
            </el-button>
          </div>
          <div class="form-tip">添加字辈或关键祖先名，便于匹配</div>
        </el-form-item>

        <el-form-item label="联系方式 *">
          <el-input
            v-model="createForm.contact_info"
            type="textarea"
            :rows="3"
            placeholder="手机号码、微信、邮箱等（将加密存储）"
            maxlength="200"
            show-word-limit
          />
          <div class="form-tip">⚠️ 联系方式将被加密存储，仅授权用户可查看</div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitPost">
          发布
        </el-button>
      </template>
    </el-dialog>

    <!-- 联系方式对话框 -->
    <el-dialog v-model="showContactDialog" title="联系方式" width="400px">
      <div v-if="selectedPost" class="contact-info">
        <div class="contact-post-info">
          <strong>祖籍地：</strong>{{ selectedPost.origin_place }}
        </div>
        <div class="contact-detail">
          <strong>联系方式：</strong>
          <span class="contact-text">{{ contactInfo }}</span>
        </div>
        <el-alert
          type="warning"
          :closable="false"
          style="margin-top: 15px;"
        >
          请尊重他人隐私，合理使用联系方式
        </el-alert>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Location, EditPen, Loading } from '@element-plus/icons-vue';
import { searchPosts, createSearchPost, getContactInfo as getContactApi } from '@/api/search';
import type { SearchPost } from '@prisma/client';

const loading = ref(false);
const submitting = ref(false);
const posts = ref<{ post: SearchPost; score: number }[]>([]);
const searchQuery = ref('');
const searchOriginPlace = ref('');

// 发布对话框
const showCreateDialog = ref(false);
const createForm = reactive({
  origin_place: '',
  xipai_keywords: [] as string[],
  contact_info: '',
});

// 关键词输入
const keywordInputVisible = ref(false);
const keywordInputValue = ref('');
const keywordInputRef = ref();

// 联系方式对话框
const showContactDialog = ref(false);
const selectedPost = ref<SearchPost | null>(null);
const contactInfo = ref('');

// 搜索寻亲帖
async function handleSearch() {
  if (!searchQuery.value && !searchOriginPlace.value) {
    // 如果没有搜索条件，加载所有帖子
    await loadAllPosts();
    return;
  }

  loading.value = true;
  try {
    const result = await searchPosts(searchQuery.value, searchOriginPlace.value || undefined);
    posts.value = result.data || result;
  } catch (error: any) {
    ElMessage.error(`搜索失败：${error.message}`);
  } finally {
    loading.value = false;
  }
}

// 加载所有帖子
async function loadAllPosts() {
  loading.value = true;
  try {
    const result = await searchPosts('', '');
    posts.value = result.data || result;
  } catch (error: any) {
    console.error('加载失败：', error);
  } finally {
    loading.value = false;
  }
}

// 查看帖子详情
function handleViewPost(post: SearchPost) {
  // TODO: 跳转到帖子详情页
  ElMessage.info('帖子详情功能开发中...');
}

// 查看联系方式
async function handleViewContact(post: SearchPost) {
  try {
    const result = await getContactApi(post.id);
    contactInfo.value = result.data?.contact_info || result.contact_info || '暂无联系方式';
    selectedPost.value = post;
    showContactDialog.value = true;
  } catch (error: any) {
    ElMessage.error(`获取联系方式失败：${error.message}`);
  }
}

// 提交发布寻亲帖
async function handleSubmitPost() {
  if (!createForm.origin_place.trim()) {
    ElMessage.error('请填写祖籍地');
    return;
  }

  if (createForm.xipai_keywords.length === 0) {
    ElMessage.error('请至少添加一个字辈关键词');
    return;
  }

  if (!createForm.contact_info.trim()) {
    ElMessage.error('请填写联系方式');
    return;
  }

  submitting.value = true;
  try {
    await createSearchPost({
      origin_place: createForm.origin_place.trim(),
      xipai_keywords: createForm.xipai_keywords,
      contact_info: createForm.contact_info.trim(),
      created_by: 'current-user', // TODO: 从 auth store 获取
    });

    ElMessage.success('发布成功！');
    showCreateDialog.value = false;
    
    // 重置表单
    createForm.origin_place = '';
    createForm.xipai_keywords = [];
    createForm.contact_info = '';
    
    // 重新加载列表
    loadAllPosts();
  } catch (error: any) {
    ElMessage.error(`发布失败：${error.message}`);
  } finally {
    submitting.value = false;
  }
}

// 添加关键词
function handleAddKeyword() {
  if (keywordInputValue.value.trim()) {
    if (!createForm.xipai_keywords.includes(keywordInputValue.value.trim())) {
      createForm.xipai_keywords.push(keywordInputValue.value.trim());
    }
    keywordInputValue.value = '';
  }
  keywordInputVisible.value = false;
}

// 移除关键词
function handleRemoveKeyword(keyword: string) {
  const index = createForm.xipai_keywords.indexOf(keyword);
  if (index > -1) {
    createForm.xipai_keywords.splice(index, 1);
  }
}

// 格式化日期
function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;

  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// 初始化
onMounted(() => {
  loadAllPosts();
});
</script>

<style scoped>
.search-page {
  max-width: 1000px;
  margin: 20px auto;
  padding: 0 20px;
}

.search-card {
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

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
}

.origin-filter {
  width: 250px;
}

.posts-list {
  min-height: 300px;
}

.post-card {
  padding: 15px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 15px;
  cursor: pointer;
  transition: all 0.3s;
}

.post-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.post-origin {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #5d4037;
}

.post-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.keyword-tag {
  margin-right: 5px;
}

.post-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #999;
  font-size: 12px;
}

.post-time {
  color: #999;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 30px;
  color: #999;
}

.keywords-input {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
}

.contact-info {
  padding: 10px 0;
}

.contact-post-info {
  margin-bottom: 15px;
  color: #666;
}

.contact-detail {
  font-size: 16px;
}

.contact-text {
  color: #409eff;
  font-weight: bold;
}
</style>
