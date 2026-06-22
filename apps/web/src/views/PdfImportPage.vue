<template>
  <div class="pdf-import-page">
    <el-card class="import-card">
      <template #header>
        <div class="card-header">
          <h2>PDF 族谱导入</h2>
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

        <!-- OCR 额度提示 -->
        <el-alert
          v-if="quota"
          class="quota-alert"
          :type="quotaAlertType"
          :closable="false"
          show-icon
        >
          <template #default>
            <div class="quota-row">
              <span>
                您本月剩余免费额度：
                <strong>{{ quota.free_pages_remaining }}</strong> 页 /
                <strong>{{ quota.free_chars_remaining }}</strong> 字
              </span>
              <span class="quota-pricing">
                超出部分：¥{{ quota.price_per_page.toFixed(2) }}/页，
                ¥{{ quota.price_per_100_chars.toFixed(2) }}/百字
              </span>
              <span v-if="quota.paid_balance > 0" class="quota-balance">
                账户余额：¥{{ quota.paid_balance.toFixed(2) }}
              </span>
              <span v-else class="quota-balance warn">
                当前为免费用户，超出免费额度需先充值
              </span>
            </div>
            <div class="quota-engine">
              当前 OCR 引擎：{{ quota.provider === 'tencent' ? '腾讯云 OCR' : 'Tesseract.js（本地）' }}
            </div>
          </template>
        </el-alert>

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
            系统正在使用OCR识别扫描件（{{ taskInfo?.ocrProvider === 'tencent' ? '腾讯云' : '本地' }}），这可能需要几分钟时间，请稍候...
          </span>
          <span v-else>
            系统正在解析PDF文档并提取人员信息，请稍候...
          </span>
        </p>

        <el-alert
          v-if="taskInfo?.parseMode === 'ocr'"
          title="OCR 识别模式"
          type="info"
          :closable="false"
          show-icon
          class="ocr-notice"
        >
          <template #default>
            <p>扫描件 PDF 将调用 OCR 服务，可能需要较长时间。识别完成后将按页数 / 字数自动结算费用。</p>
          </template>
        </el-alert>

        <div class="parsing-status">
          <el-progress
            :percentage="parsingProgress"
            :status="parsingStatus"
            :stroke-width="20"
          />
          <p class="status-text">{{ parsingMessage }}</p>

          <!-- OCR 实时消耗显示 -->
          <div v-if="taskInfo?.parseMode === 'ocr'" class="ocr-realtime">
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="总页数">{{ taskInfo.totalPages }} 页</el-descriptions-item>
              <el-descriptions-item label="预计费用">
                ¥{{ (taskInfo.ocrEstimatedFee ?? 0).toFixed(2) }}
              </el-descriptions-item>
              <el-descriptions-item label="引擎">
                {{ taskInfo.ocrProvider === 'tencent' ? '腾讯云' : 'Tesseract' }}
              </el-descriptions-item>
            </el-descriptions>
            <p class="realtime-tip">
              即将超出免费额度：第 {{ (quota?.free_pages_remaining ?? 0) + 1 }} 页起将开始扣费
            </p>
          </div>
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

        <!-- OCR 费用明细（仅扫描件 PDF 显示） -->
        <div v-if="feeDetail" class="fee-detail">
          <h4>OCR 费用明细</h4>
          <el-alert
            :title="feeDetailTitle"
            :type="feeDetail.fee_amount > 0 ? 'warning' : 'success'"
            :closable="false"
            show-icon
          >
            <template #default>
              <el-descriptions :column="2" border size="small" class="fee-descriptions">
                <el-descriptions-item label="成功识别">
                  {{ feeDetail.pages_total }} 页，{{ feeDetail.chars_total }} 字
                </el-descriptions-item>
                <el-descriptions-item label="免费页数">{{ feeDetail.free_pages_used }} 页</el-descriptions-item>
                <el-descriptions-item label="免费字数">{{ feeDetail.free_chars_used }} 字</el-descriptions-item>
                <el-descriptions-item label="超出页数" v-if="feeDetail.charged_pages > 0">
                  {{ feeDetail.charged_pages }} 页 × ¥{{ quota?.price_per_page.toFixed(2) }} =
                  ¥{{ (feeDetail.charged_pages * (quota?.price_per_page || 0)).toFixed(2) }}
                </el-descriptions-item>
                <el-descriptions-item label="超出字数" v-if="feeDetail.charged_chars > 0">
                  {{ feeDetail.charged_chars }} 字（{{ Math.ceil(feeDetail.charged_chars / 100) }} 百字）×
                  ¥{{ quota?.price_per_100_chars.toFixed(2) }} =
                  ¥{{ (Math.ceil(feeDetail.charged_chars / 100) * (quota?.price_per_100_chars || 0)).toFixed(2) }}
                </el-descriptions-item>
                <el-descriptions-item label="合计费用" v-if="feeDetail.fee_amount > 0">
                  <strong class="fee-total">¥{{ feeDetail.fee_amount.toFixed(2) }}</strong>
                </el-descriptions-item>
                <el-descriptions-item label="结算结果" v-if="feeDetail.fee_amount > 0">
                  已从余额扣除
                  <span v-if="feeDetail.paid_balance_after !== undefined">
                    （余额：¥{{ feeDetail.paid_balance_after.toFixed(2) }}）
                  </span>
                </el-descriptions-item>
              </el-descriptions>
              <div v-if="feeDetail.fee_amount === 0" class="free-note">
                本次识别全部走免费额度，未产生费用
              </div>
            </template>
          </el-alert>
        </div>

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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UploadFilled, Document } from '@element-plus/icons-vue';
import {
  uploadPdf,
  getTaskStatus,
  getTaskPreview,
  executeImport,
} from '@/api/pdf-import';
import type { PdfImportTask, PdfPersonRecord } from '@/api/pdf-import';
import { ocrApi } from '@/api/ocr';
import type { OcrQuota, OcrFeeDetail } from '@/api/ocr';
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
const importResult = ref<{
  successCount: number;
  failureCount: number;
  errors: string[];
  ocrFeeDetail?: OcrFeeDetail;
} | null>(null);

const quota = ref<OcrQuota | null>(null);

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
    case 'parsing':
      return taskInfo.value.parseMode === 'ocr'
        ? '正在 OCR 识别扫描件，请稍候...'
        : '正在解析PDF文档...';
    case 'preview': return '解析完成！';
    case 'failed':
      return `解析失败: ${taskInfo.value.errorMessage}`;
    default: return '';
  }
});

const totalRecords = computed(() => previewRecords.value.length);
const highConfidenceCount = computed(
  () => previewRecords.value.filter((r) => r.confidenceScore >= 90).length,
);
const mediumConfidenceCount = computed(
  () =>
    previewRecords.value.filter(
      (r) => r.confidenceScore >= 70 && r.confidenceScore < 90,
    ).length,
);
const lowConfidenceCount = computed(
  () => previewRecords.value.filter((r) => r.confidenceScore < 70).length,
);

const feeDetail = computed<OcrFeeDetail | null>(
  () => importResult.value?.ocrFeeDetail || taskInfo.value?.ocrFeeDetail || null,
);

const feeDetailTitle = computed(() => {
  const f = feeDetail.value;
  if (!f) return '';
  if (f.fee_amount === 0) return '本次识别全部免费';
  return `本次 OCR 费用 ¥${f.fee_amount.toFixed(2)}，已从余额扣除`;
});

const quotaAlertType = computed(() => {
  if (!quota.value) return 'info';
  if (quota.value.paid_balance <= 0) return 'warning';
  return 'info';
});

onMounted(async () => {
  await fetchQuota();
});

onUnmounted(() => {
  stopPolling();
});

// ========== 数据获取 ==========

async function fetchQuota() {
  try {
    quota.value = await ocrApi.getQuota();
  } catch (error) {
    console.warn('获取 OCR 额度失败', error);
  }
}

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
      authStore.user?.sub || '',
    );

    taskId.value = response.data.taskId;
    currentStep.value = 2;

    // 开始轮询任务状态
    startPolling();
  } catch (error: any) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status === 402 && data?.error === 'INSUFFICIENT_BALANCE') {
      await handleInsufficientBalance({
        required: data.required ?? 0,
        current: data.current ?? 0,
      });
    } else {
      ElMessage.error(data?.message || '上传失败');
    }
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
        const billingErr = response.data.metadata?.ocrBillingError;
        if (billingErr) {
          await handleInsufficientBalance({
            required: billingErr.required ?? 0,
            current: billingErr.current ?? 0,
          });
        } else {
          ElMessage.error('PDF解析失败: ' + response.data.errorMessage);
        }
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
    // 刷新额度（任务可能消耗了免费额度）
    await fetchQuota();
  } catch (error: any) {
    ElMessage.error('加载预览数据失败');
  }
}

// 执行导入
async function handleExecuteImport() {
  if (!clanStore.currentClan) return;

  importing.value = true;
  try {
    const response = await executeImport(
      taskId.value,
      authStore.user?.sub || '',
      clanStore.currentClan.id,
    );

    importResult.value = response.data;
    currentStep.value = 4;

    ElMessage.success('导入完成');
    // 刷新额度
    await fetchQuota();
  } catch (error: any) {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status === 402 && data?.error === 'INSUFFICIENT_BALANCE') {
      await handleInsufficientBalance({
        required: data.required ?? 0,
        current: data.current ?? 0,
      });
    } else {
      ElMessage.error(data?.message || '导入失败');
    }
  } finally {
    importing.value = false;
  }
}

// 余额不足弹窗
async function handleInsufficientBalance(opts: {
  required: number;
  current: number;
}) {
  try {
    await ElMessageBox.confirm(
      `本次 OCR 识别预计需要 ¥${opts.required.toFixed(2)}，当前余额 ¥${opts.current.toFixed(2)}。请充值后再继续导入。`,
      '余额不足',
      {
        confirmButtonText: '去充值',
        cancelButtonText: '取消导入',
        type: 'warning',
      },
    );
    router.push('/user-center/toolbox');
  } catch {
    // 用户取消
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
  fetchQuota();
}
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
  color: #f56c6c;
}

/* ========== OCR 限免相关样式 ========== */
.quota-alert {
  margin-bottom: 20px;
}

.quota-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  font-size: 14px;
}

.quota-pricing {
  color: #909399;
}

.quota-balance {
  margin-left: auto;
  color: #67c23a;
  font-weight: 500;
}

.quota-balance.warn {
  color: #e6a23c;
}

.quota-engine {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.ocr-realtime {
  margin-top: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
}

.realtime-tip {
  margin: 10px 0 0 0;
  font-size: 13px;
  color: #e6a23c;
}

.fee-detail {
  margin-top: 30px;
  max-width: 800px;
}

.fee-detail h4 {
  margin-bottom: 12px;
  color: #303133;
}

.fee-descriptions {
  margin-top: 12px;
}

.fee-total {
  color: #f56c6c;
  font-size: 18px;
}

.free-note {
  margin-top: 12px;
  color: #67c23a;
  font-size: 13px;
}
</style>