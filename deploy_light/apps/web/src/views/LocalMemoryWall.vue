<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useMemoryStore } from '@/stores/memory'
import { useAuthStore } from '@/stores/auth'
import CreateQuizDialog from '@/components/memory/CreateQuizDialog.vue'
import AnswerActionBar from '@/components/memory/AnswerActionBar.vue'
import BadgeDisplay from '@/components/memory/BadgeDisplay.vue'

const route = useRoute()
const router = useRouter()
const store = useMemoryStore()
const authStore = useAuthStore()

const location = ref((route.query.location as string) || '')
const decade = ref<number | undefined>(route.query.decade ? Number(route.query.decade) : undefined)
const page = ref(1)
const createDialog = ref<InstanceType<typeof CreateQuizDialog> | null>(null)

async function loadWall() {
  if (!location.value) return
  await store.fetchMemoryWall(location.value, decade.value, page.value)
}

function goToQuiz() {
  if (!authStore.token) {
    ElMessage.info('请先登录')
    router.push('/login')
    return
  }
  createDialog.value?.open()
}

function search() {
  page.value = 1
  loadWall()
}

function openQuizVerify() {
  if (!location.value) {
    ElMessage.warning('请先输入地点')
    return
  }
  const query: any = { location: location.value }
  if (decade.value) query.decade = decade.value
  if (authStore.token) {
    router.push({ path: '/quiz-verify', query })
  } else {
    router.push({ path: '/quiz-verify', query: { ...query, guest: '1' } })
  }
}

onMounted(() => {
  if (location.value) loadWall()
  if (authStore.token) {
    store.fetchBadges()
  }
})

watch(() => route.query, (q) => {
  if (q.location) {
    location.value = q.location as string
    loadWall()
  }
})
</script>

<template>
  <div class="memory-wall-page">
    <div class="page-header">
      <h1>地方记忆拼图</h1>
      <p class="header-desc">共建地方记忆题库，用本地人的真实回答见证历史</p>
    </div>

    <!-- 搜索栏 -->
    <div class="search-section">
      <div class="search-row">
        <el-input
          v-model="location"
          placeholder="输入地点名称..."
          class="input-location"
          clearable
          @keyup.enter="search"
        />
        <el-select v-model="decade" placeholder="年代（可选）" clearable class="select-decade">
          <el-option v-for="y in [1950,1960,1970,1980,1990,2000]" :key="y" :label="`${y}年代`" :value="y" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="openQuizVerify">答题验证身份</el-button>
      </div>
    </div>

    <!-- 用户徽章 -->
    <div v-if="authStore.token && store.badges.length > 0" class="badges-section">
      <h3>我的记忆徽章</h3>
      <BadgeDisplay :badges="store.badges" />
    </div>

    <!-- 记忆墙内容 -->
    <div class="wall-content">
      <div v-if="!store.wallData || store.wallData.quizzes.length === 0" class="wall-empty">
        <p>暂无该地区的记忆题目</p>
        <p class="empty-hint">成为第一个出题的人吧</p>
      </div>

      <div v-for="quiz in store.wallData?.quizzes || []" :key="quiz.id" class="wall-card">
        <div class="card-header">
          <span class="card-question">{{ quiz.question }}</span>
        </div>
        <div class="card-meta">
          <span class="meta-location">{{ quiz.location }}</span>
          <span class="meta-decade">{{ quiz.decade }} 年代</span>
          <span v-if="quiz.tags" class="meta-tags">{{ quiz.tags }}</span>
          <span class="meta-author">出题：{{ quiz.creator?.nickname || '匿名' }}</span>
        </div>

        <!-- 已有答案 -->
        <div v-if="quiz.answers && quiz.answers.length > 0" class="card-answers">
          <div v-for="ans in quiz.answers" :key="ans.id" class="answer-item">
            <div class="answer-content">
              <span v-if="ans.is_verified" class="verified-badge">已证实</span>
              {{ ans.content }}
            </div>
            <div class="answer-footer">
              <span class="answer-user">{{ ans.user?.nickname || '匿名' }}</span>
              <span class="answer-endorsements">{{ ans.endorsements }} 人证实</span>
            </div>
          </div>
        </div>

        <!-- 操作栏 -->
        <div v-if="authStore.token" class="card-actions">
          <AnswerActionBar
            :quiz-id="quiz.id"
            :initial-endorsements="0"
          />
        </div>
        <div v-else class="card-actions">
          <el-button size="small" @click="router.push('/login')">登录后参与</el-button>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="store.wallData && store.wallData.totalPages > 1" class="pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="store.wallData.total"
          layout="prev, pager, next"
          @current-change="loadWall"
        />
      </div>
    </div>

    <!-- 浮动创建按钮 -->
    <div v-if="authStore.token" class="fab-create">
      <el-button type="primary" circle size="large" @click="goToQuiz" title="创建题目">
        <span style="font-size: 20px;">+</span>
      </el-button>
    </div>

    <CreateQuizDialog ref="createDialog" />
  </div>
</template>

<style scoped>
.memory-wall-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
  min-height: 100vh;
  background: #faf8f5;
}
.page-header {
  text-align: center;
  margin-bottom: 32px;
}
.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 8px;
}
.header-desc {
  font-size: 14px;
  color: #5a6a7a;
  margin: 0;
}
.search-section {
  margin-bottom: 24px;
}
.search-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.input-location {
  flex: 1;
}
.select-decade {
  width: 140px;
}
.badges-section {
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e8e0d8;
}
.badges-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 12px;
}
.wall-empty {
  text-align: center;
  padding: 60px 24px;
  color: #94a3b8;
}
.empty-hint {
  font-size: 13px;
  margin-top: 8px;
}
.wall-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e8e0d8;
  padding: 20px;
  margin-bottom: 16px;
  transition: box-shadow 0.2s;
}
.wall-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.card-question {
  font-size: 15px;
  line-height: 1.6;
  color: #2c3e50;
  font-weight: 500;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.meta-location, .meta-decade, .meta-tags {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(93, 64, 55, 0.06);
  color: #5D4037;
}
.meta-author {
  font-size: 12px;
  color: #94a3b8;
  margin-left: auto;
}
.card-answers {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0ebe4;
}
.answer-item {
  padding: 8px 0;
  border-bottom: 1px solid #f8f5f0;
}
.answer-item:last-child {
  border-bottom: none;
}
.answer-content {
  font-size: 14px;
  line-height: 1.6;
  color: #5a6a7a;
}
.verified-badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(103, 194, 58, 0.1);
  color: #67C23A;
  margin-right: 6px;
  font-weight: 600;
}
.answer-footer {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.card-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0ebe4;
}
.pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
.fab-create {
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 100;
}
@media (max-width: 768px) {
  .search-row {
    flex-direction: column;
  }
  .select-decade {
    width: 100%;
  }
}
</style>
