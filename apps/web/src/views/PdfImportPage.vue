<template>
  <div class="pdf-import-page">
    <el-card class="import-card">
      <template #header>
        <div class="card-header">
          <h2>📄 PDF族谱导入</h2>
          <el-button @click="handleGoBack">返回</el-button>
        </div>
      </template>

      <!-- 步骤指示器 -->
      <el-steps
        :active="currentStep - 1"
        finish-status="success"
        class="import-steps"
      >
        <el-step title="上传PDF" />
        <el-step title="解析中" />
        <el-step title="预览校对" />
        <el-step title="导入完成" />
      </el-steps>

      <!-- Step 1: 上传PDF -->
      <div v-if="currentStep === 1" class="step-content">
        <h3>第一步：上传PDF族谱文档</h3>
        <p class="step-description">
          请上传PDF格式的族谱文档（支持文本PDF和扫描PDF）。系统将自动解析并提取人员信息。
        </p>

        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          accept=".pdf"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          drag
          class="upload-dragger"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将PDF文件拖到此处，或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持格式：.pdf，最大50MB
            </div>
          </template>
        </el-upload>

        <div v-if="selectedFile" class="file-info">
          <el-icon><Document /></el-icon>
          <span>{{ selectedFile.name }}</span>
          <span class="file-size">({{ formatFileSize(selectedFile.size) }})</span>
        </div>

        <div class="step-actions">
          <el-button
            type="primary"
            :disabled="!selectedFile || uploading"
            :loading="uploading"
            @click="handleUpload"
          >
            {{ uploading ? '上传中...' : '开始解析' }}
          </el-button>
          <el-button @click="handleGoBack">取消</el-button>
        </div>
      </div>

      <!-- Step 2: 解析中 -->
      <div v-if="currentStep === 2" class="step-content">
        <h3>第二步：PDF解析中</h3>
        <p class="step-description">
          <span v-if="taskInfo?.parseMode === 'ocr'">
            系统正在使用OCR识别扫描件，这可能需要几分钟时间，请稍候...
          </span>
          <span v-else>
            系统正在解析PDF文档并提取人员信息，请稍候...
          </span>
        </p>

        <!-- OCR模式提示 -->
        <el-alert
          v-if="taskInfo?.parseMode === 'ocr'"
          title="OCR识别模式"
          type="info"
          :closable="false"
          show-icon
          class="ocr-notice"
        >
          <template #default>
            <p>正在识别扫描件，可能需要较长时间。请保持页面开启，识别进度如下：</p>
          </template>
        </el-alert>

        <div class="parsing-status">
          <el-progress
            :percentage="parsingProgress"
            :status="parsingStatus"
            :stroke-width="20"
          />
          <p class="status-text">{{ parsingMessage }}</p>
        </div>

        <div v-if="taskInfo" class="task-details">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="文件名">{{ taskInfo.fileName }}</el-descriptions-item>
            <el-descriptions-item label="文件大小">{{ formatFileSize(taskInfo.fileSize) }}</el-descriptions-item>
            <el-descriptions-item label="总页数">{{ taskInfo.totalPages }}</el-descriptions-item>
            <el-descriptions-item label="解析模式">
              <el-tag :type="taskInfo.parseMode === 'ocr' ? 'warning' : 'success'">
                {{ taskInfo.parseMode === 'text' ? '文本PDF' : 'OCR识别' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <!-- Step 3: 预览校对 -->
      <div v-if="currentStep === 3" class="step-content">
        <h3>第三步：预览与校对</h3>
        <p class="step-description">
          系统已从PDF中提取到 <strong>{{ totalRecords }}</strong> 条人员记录。请检查并校对数据，低置信度的记录需要重点关注。
        </p>

        <div class="confidence-summary">
          <el-tag type="success" class="confidence-tag">
            高置信度(≥90%): {{ highConfidenceCount }}条
          </el-tag>
          <el-tag type="warning" class="confidence-tag">
            中置信度(70-89%): {{ mediumConfidenceCount }}条
          </el-tag>
          <el-tag type="danger" class="confidence-tag">
            低置信度(<70%): {{ lowConfidenceCount }}条
          </el-tag>
        </div>

        <el-table
          :data="previewRecords"
          border
          stripe
          style="width: 100%"
          max-height="500"
        >
          <el-table-column prop="rowNumber" label="行号" width="80" />
          <el-table-column prop="fullName" label="姓名" width="120">
            <template #default="{ row }">
              <el-input v-model="row.fullName" size="small" />
            </template>
          </el-table-column>
          <el-table-column prop="gender" label="性别" width="100">
            <template #default="{ row }">
              <el-select v-model="row.gender" size="small">
                <el-option label="男" value="M" />
                <el-option label="女" value="F" />
                <el-option label="未知" value="UNKNOWN" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="generation" label="辈分" width="100">
            <template #default="{ row }">
              <el-input-number v-model="row.generation" :min="1" :max="100" size="small" />
            </template>
          </el-table-column>
          <el-table-column prop="birthDate" label="出生日期" width="150">
            <template #default="{ row }">
              <el-date-picker
                v-model="row.birthDate"
                type="date"
                placeholder="选择日期"
                size="small"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </template>
          </el-table-column>
          <el-table-column prop="deathDate" label="逝世日期" width="150">
            <template #default="{ row }">
              <el-date-picker
                v-model="row.deathDate"
                type="date"
                placeholder="选择日期"
                size="small"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </template>
          </el-table-column>
          <el-table-column prop="confidenceScore" label="置信度" width="120">
            <template #default="{ row }">
              <el-tag
                :type="getConfidenceType(row.confidenceScore)"
                size="small"
              >
                {{ row.confidenceScore }}%
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="originalText" label="原始文本" min-width="200" show-overflow-tooltip />
        </el-table>

        <div class="step-actions">
          <el-button @click="currentStep = 2">返回</el-button>
          <el-button
            type="primary"
            :loading="importing"
            @click="handleExecuteImport"
          >
            {{ importing ? '导入中...' : '确认导入' }}
          </el-button>
        </div>
      </div>

      <!-- Step 4: 导入完成 -->
      <div v-if="currentStep === 4" class="step-content">
        <h3>导入完成</h3>

        <el-result
          icon="success"
          title="PDF导入成功"
          :sub-title="`成功导入 ${importResult?.successCount || 0} 条记录，失败 ${importResult?.failureCount || 0} 条`"
        >
          <template #extra>
            <el-button type="primary" @click="handleViewTree">查看族谱树</el-button>
            <el-button @click="handleReset">继续导入</el-button>
          </template>
        </el-result>

        <div v-if="importResult?.errors && importResult.errors.length > 0" class="error-details">
          <h4>错误详情</h4>
          <el-alert
            v-for="(error, index) in importResult.errors"
            :key="index"
            :title="error"
            type="error"
            :closable="false"
            style="margin-bottom: 10px"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { UploadFilled, Document } from '@element-plus/icons-vue';
import { uploadPdf, getTaskStatus, getTaskPreview, executeImport } from '@/api/pdf-import';
import type { PdfImportTask, PdfPersonRecord } from '@/api/pdf-import';
import { useAuthStore } from '@/stores/auth';
import { useClanStore } from '@/stores/clan';

const router = useRouter();
const authStore = useAuthStore();
const clanStore = useClanStore();

// 状态
const currentStep = ref(1);
const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const importing = ref(false);
const taskId = ref('');
const taskInfo = ref<PdfImportTask | null>(null);
const previewRecords = ref<PdfPersonRecord[]>([]);
const importResult = ref<{ successCount: number; failureCount: number; errors: string[] } | null>(null);

// 轮询定时器
let pollingTimer: number | null = null;

// 计算属性
const parsingProgress = computed(() => {
  if (!taskInfo.value) return 0;
  switch (taskInfo.value.status) {
    case 'pending': return 10;
    case 'parsing': return 50;
    case 'preview': return 100;
    default: return 0;
  }
});

const parsingStatus = computed(() => {
  if (!taskInfo.value) return '';
  return taskInfo.value.status === 'failed' ? 'exception' : '';
});

const parsingMessage = computed(() => {
  if (!taskInfo.value) return '';
  switch (taskInfo.value.status) {
    case 'pending': return '任务已创建，等待解析...';
    case 'parsing': return '正在解析PDF文档...';
    case 'preview': return '解析完成！';
    case 'failed': return `解析失败: ${taskInfo.value.errorMessage}`;
    default: return '';
  }
});

const totalRecords = computed(() => previewRecords.value.length);
const highConfidenceCount = computed(() => previewRecords.value.filter(r => r.confidenceScore >= 90).length);
const mediumConfidenceCount = computed(() => previewRecords.value.filter(r => r.confidenceScore >= 70 && r.confidenceScore < 90).length);
const lowConfidenceCount = computed(() => previewRecords.value.filter(r => r.confidenceScore < 70).length);

// 文件处理
function handleFileChange(file: any) {
  selectedFile.value = file.raw;
}

function handleFileRemove() {
  selectedFile.value = null;
}

// 上传PDF
async function handleUpload() {
  if (!selectedFile.value || !clanStore.currentClan) return;

  uploading.value = true;
  try {
    const response = await uploadPdf(
      selectedFile.value,
      clanStore.currentClan.id,
      authStore.userId
    );

    taskId.value = response.data.taskId;
    currentStep.value = 2;

    // 开始轮询任务状态
    startPolling();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

// 轮询任务状态
function startPolling() {
  pollingTimer = window.setInterval(async () => {
    try {
      const response = await getTaskStatus(taskId.value);
      taskInfo.value = response.data;

      if (response.data.status === 'preview') {
        // 解析完成，获取预览数据
        stopPolling();
        await loadPreview();
      } else if (response.data.status === 'failed') {
        stopPolling();
        ElMessage.error('PDF解析失败: ' + response.data.errorMessage);
      }
    } catch (error) {
      console.error('轮询任务状态失败:', error);
    }
  }, 2000);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// 加载预览数据
async function loadPreview() {
  try {
    const response = await getTaskPreview(taskId.value);
    previewRecords.value = response.data.records;
    currentStep.value = 3;
  } catch (error: any) {
    ElMessage.error('加载预览数据失败');
  }
}

// 执行导入
async function handleExecuteImport() {
  if (!clanStore.currentClan) return;

  importing.value = true;
  try {
    // 先提交校对数据
    // await submitCorrection(taskId.value, previewRecords.value);

    // 执行导入
    const response = await executeImport(
      taskId.value,
      authStore.userId,
      clanStore.currentClan.id
    );

    importResult.value = response.data;
    currentStep.value = 4;

    ElMessage.success('导入完成');
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

// 工具函数
function getConfidenceType(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 90) return 'success';
  if (score >= 70) return 'warning';
  return 'danger';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleGoBack() {
  router.back();
}

function handleViewTree() {
  if (clanStore.currentClan) {
    router.push(`/tree/${clanStore.currentClan.id}`);
  }
}

function handleReset() {
  currentStep.value = 1;
  selectedFile.value = null;
  taskId.value = '';
  taskInfo.value = null;
  previewRecords.value = [];
  importResult.value = null;
}

// 组件卸载时清理定时器
onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.pdf-import-page {
  max-width: 1200px;
  margin: 20px auto;
  padding: 0 20px;
}

.import-card {
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

.import-steps {
  margin-bottom: 40px;
}

.step-content {
  padding: 20px 0;
}

.step-description {
  color: #666;
  margin-bottom: 20px;
}

.upload-dragger {
  width: 100%;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.file-size {
  color: #999;
  margin-left: auto;
}

.step-actions {
  margin-top: 30px;
  display: flex;
  gap: 10px;
}

.parsing-status {
  margin: 30px 0;
}

.status-text {
  text-align: center;
  color: #666;
  margin-top: 10px;
}

.ocr-notice {
  margin-bottom: 20px;
}

.ocr-notice p {
  margin: 5px 0 0 0;
  font-size: 14px;
}

.task-details {
  margin-top: 30px;
}

.confidence-summary {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.confidence-tag {
  margin-right: 0;
}

.error-details {
  margin-top: 30px;
}

.error-details h4 {
  margin-bottom: 10px;
  color: #F56C6C;
}
</style>
