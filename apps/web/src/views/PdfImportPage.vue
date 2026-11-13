<template>
  <div class="pdf-import-page">
    <el-card class="import-card">
      <template #header>
        <div class="card-header">
          <h2>PDF 族谱导入</h2>
          <el-button @click="handleWizardBack">{{ backLabel }}</el-button>
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
          上传一份 PDF。文字版直接提取人名；扫描版自动 OCR。纸质旧谱请先拍照或扫描，导出成 PDF 再上传，单张照片不能直接导入。
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
                超出部分：¥{{ (quota.price_per_page ?? 0).toFixed(2) }}/页，
                ¥{{ (quota.price_per_100_chars ?? 0).toFixed(2) }}/百字
              </span>
              <span v-if="quota.paid_balance > 0" class="quota-balance">
                账户余额：¥{{ (quota.paid_balance ?? 0).toFixed(2) }}
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
              支持 .pdf，最大 50MB。照片请先导出为 PDF。
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
          <el-button
            v-if="taskInfo && (taskInfo.status === 'pending' || taskInfo.status === 'parsing')"
            @click="resumeParsing"
          >
            查看当前解析
          </el-button>
          <el-button v-if="canContinueCorrect" type="primary" plain @click="continueCorrect">
            继续校对
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
            v-if="showOcrPages"
            :percentage="ocrPercent"
            :stroke-width="20"
            :status="parsingStatus"
          />
          <el-progress
            v-else
            :percentage="textProgress"
            :indeterminate="parsingActive"
            :show-text="false"
            :stroke-width="20"
            :status="parsingStatus"
          />
          <p v-if="showOcrPages" class="page-progress">第 {{ ocrCurrentPage }} / {{ ocrTotalPages }} 页</p>
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

        <div class="step-actions">
          <el-button @click="handleWizardBack">返回重新上传</el-button>
          <el-button v-if="canContinueCorrect" type="primary" @click="continueCorrect">继续校对</el-button>
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

        <div class="batch-bar">
          <span>已选 {{ selectedRows.length }} 行</span>
          <el-select v-model="batchGender" placeholder="性别" size="small" class="batch-gender">
            <el-option label="男" value="M" />
            <el-option label="女" value="F" />
            <el-option label="未知" value="UNKNOWN" />
          </el-select>
          <el-button size="small" :disabled="!selectedRows.length || !batchGender" @click="applyBatchGender">修改性别</el-button>
          <el-input-number v-model="batchGeneration" :min="1" :max="100" size="small" />
          <el-button size="small" :disabled="!selectedRows.length || !batchGeneration" @click="applyBatchGeneration">修改世代</el-button>
          <el-button size="small" type="danger" :disabled="!selectedRows.length" @click="batchDelete">删除所选</el-button>
        </div>

        <div class="preview-layout">
        <div class="preview-table-wrap">
        <el-table
          :data="previewRecords"
          border
          stripe
          max-height="500"
          highlight-current-row
          :row-class-name="rowClassName"
          @selection-change="onSelectionChange"
          @row-click="setActiveRow"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="rowNumber" label="行号" width="64" />
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
          <el-table-column prop="parentName" label="父亲" width="120">
            <template #default="{ row }">
              <el-input v-model="row.parentName" size="small" placeholder="父名" />
            </template>
          </el-table-column>
          <el-table-column prop="motherName" label="母亲" width="120">
            <template #default="{ row }">
              <el-input v-model="row.motherName" size="small" placeholder="母名" />
            </template>
          </el-table-column>
          <el-table-column prop="spouseName" label="配偶" width="120">
            <template #default="{ row }">
              <el-input v-model="row.spouseName" size="small" placeholder="配偶" />
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
        </el-table>
        </div>

        <aside class="source-panel">
          <h4>原文对照</h4>
          <template v-if="activeRow">
            <p class="source-title">第 {{ activeRow.rowNumber }} 行 · {{ activeRow.fullName || '未命名' }}</p>
            <el-alert
              v-if="activeRow.parseWarning || activeRow.confidenceScore < 70"
              :title="activeRow.parseWarning || `置信度 ${activeRow.confidenceScore}%`"
              type="warning"
              :closable="false"
              show-icon
            />
            <pre class="source-text">{{ activeRow.originalText || '这一行没有留下原文片段' }}</pre>
            <img
              v-if="pageImageUrl"
              :src="pageImageUrl"
              class="source-image"
              alt="原 PDF 页面"
            />
            <p v-else-if="taskInfo?.parseMode === 'ocr'" class="source-hint">正在读取该页扫描图…</p>
          </template>
          <p v-else class="source-hint">点一行，查看它对应的原文。扫描件会同时显示该页图片。</p>
        </aside>
        </div>

        <div class="step-actions">
          <el-button @click="handleWizardBack">返回解析</el-button>
          <el-button
            type="primary"
            :loading="importing"
            @click="handleExecuteImport()"
          >
            {{ importing ? '导入中...' : '确认导入' }}
          </el-button>
        </div>
      </div>

      <!-- Step 4: 导入完成 -->
      <div v-if="currentStep === 4" class="step-content">
        <h3>导入完成</h3>

        <el-result
          :icon="completionTone"
          :title="completionTitle"
          :sub-title="completionSubtitle"
        >
          <template #extra>
            <el-button type="primary" @click="handleViewTree">查看族谱树</el-button>
            <el-button @click="handleReset">继续导入</el-button>
          </template>
        </el-result>

        <div v-if="completionIssues.length" class="issue-list">
          <h4>需要留意的记录</h4>
          <el-alert
            v-for="(issue, index) in completionIssues"
            :key="index"
            :title="issue"
            type="warning"
            :closable="false"
            show-icon
            class="issue-item"
          />
        </div>

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
                  {{ feeDetail.charged_pages }} 页 × ¥{{ (quota?.price_per_page ?? 0).toFixed(2) }} =
                  ¥{{ (feeDetail.charged_pages * (quota?.price_per_page || 0)).toFixed(2) }}
                </el-descriptions-item>
                <el-descriptions-item label="超出字数" v-if="feeDetail.charged_chars > 0">
                  {{ feeDetail.charged_chars }} 字（{{ Math.ceil(feeDetail.charged_chars / 100) }} 百字）×
                  ¥{{ (quota?.price_per_100_chars ?? 0).toFixed(2) }} =
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

    <el-dialog v-model="duplicateVisible" title="发现重名" width="480px">
      <p>以下姓名在当前族谱中已经存在：</p>
      <p class="duplicate-names">{{ duplicateNames.join('、') }}</p>
      <p>请选择这些重名记录如何写入。其余不重名的人仍会新增。</p>
      <template #footer>
        <el-button @click="confirmDuplicate('skip')">跳过</el-button>
        <el-button @click="confirmDuplicate('merge')">合并</el-button>
        <el-button type="primary" @click="confirmDuplicate('create')">新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UploadFilled, Document } from '@element-plus/icons-vue';
import {
  uploadPdf,
  getTaskStatus,
  getTaskPreview,
  getTaskPageImage,
  executeImport,
} from '@/api/pdf-import';
import type { PdfExecuteResult, PdfImportTask, PdfPersonRecord } from '@/api/pdf-import';
import { ocrApi } from '@/api/ocr';
import type { OcrQuota, OcrFeeDetail } from '@/api/ocr';

const route = useRoute();
const router = useRouter();
const clanSlug = computed(() => String(route.params.slug || ''));

// 状态
const currentStep = ref(route.query.taskId ? 2 : 1);
const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const importing = ref(false);
const taskId = ref(String(route.query.taskId || ''));
const taskInfo = ref<PdfImportTask | null>(null);
const previewRecords = ref<PdfPersonRecord[]>([]);
const quota = ref<OcrQuota | null>(null);
const selectedRows = ref<PdfPersonRecord[]>([]);
const activeRow = ref<PdfPersonRecord | null>(null);
const pageImageUrl = ref('');
const batchGender = ref<'M' | 'F' | 'UNKNOWN' | ''>('');
const batchGeneration = ref<number | undefined>(undefined);
const discardedIssues = ref<string[]>([]);
const completionIssues = ref<string[]>([]);
const followParse = ref(true);
const importResult = ref<{
  successCount: number;
  failureCount: number;
  skippedCount?: number;
  errors: string[];
  ocrFeeDetail?: OcrFeeDetail;
  anchorPersonId?: string;
} | null>(null);

const duplicateVisible = ref(false);
const duplicateNames = ref<string[]>([]);

// 轮询定时器。路由 fullPath 作为组件 key，替换 taskId 会卸载当前实例。
let pollingTimer: number | null = null;
let alive = true;

// 计算属性
const showOcrPages = computed(
  () => taskInfo.value?.parseMode === 'ocr' && ocrTotalPages.value > 0,
);
const ocrTotalPages = computed(
  () => taskInfo.value?.progress?.totalPages || taskInfo.value?.totalPages || 0,
);
const ocrCurrentPage = computed(() => taskInfo.value?.progress?.currentPage ?? 0);
const ocrPercent = computed(() => {
  if (!ocrTotalPages.value) return 0;
  return Math.min(100, Math.round((ocrCurrentPage.value / ocrTotalPages.value) * 100));
});
const parsingActive = computed(
  () => taskInfo.value?.status === 'pending' || taskInfo.value?.status === 'parsing',
);
const textProgress = computed(() => (parsingActive.value ? 0 : 100));

const parsingStatus = computed(() => {
  if (taskInfo.value?.status === 'failed') return 'exception';
  if (taskInfo.value?.status === 'preview' || taskInfo.value?.status === 'correcting') return 'success';
  return undefined;
});

const parsingMessage = computed(() => {
  if (!taskInfo.value) return '正在准备解析...';
  if (taskInfo.value.status === 'failed') return `解析失败: ${taskInfo.value.errorMessage || '未知错误'}`;
  if (taskInfo.value.progress?.message) return taskInfo.value.progress.message;
  if (taskInfo.value.status === 'preview' || taskInfo.value.status === 'correcting') return '解析完成';
  return '正在解析 PDF';
});

const backLabel = computed(() => {
  if (currentStep.value === 2) return '重新上传';
  if (currentStep.value === 3) return '返回解析';
  return '返回';
});
const canContinueCorrect = computed(
  () => taskInfo.value?.status === 'preview' || taskInfo.value?.status === 'correcting',
);

const completionTone = computed<'success' | 'warning' | 'error'>(() => {
  const failed = importResult.value?.failureCount ?? 0;
  const success = importResult.value?.successCount ?? 0;
  if (failed > 0 && success === 0) return 'error';
  if (completionIssues.value.length || failed > 0 || (importResult.value?.skippedCount ?? 0) > 0) return 'warning';
  return 'success';
});
const completionTitle = computed(() => {
  if (completionTone.value === 'error') return '导入失败';
  if (completionTone.value === 'warning') return '导入完成，但有部分记录未通过';
  return 'PDF导入成功';
});
const completionSubtitle = computed(() => {
  const success = importResult.value?.successCount ?? 0;
  const failed = importResult.value?.failureCount ?? 0;
  const skipped = importResult.value?.skippedCount ?? 0;
  const dropped = discardedIssues.value.length;
  return `写入 ${success} 条，失败 ${failed} 条，跳过 ${skipped} 条，校对时剔除 ${dropped} 条`;
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
  const existingId = String(route.query.taskId || '');
  if (existingId) {
    taskId.value = existingId;
    await restoreTask(existingId);
  }
});

onUnmounted(() => {
  alive = false;
  stopPolling();
});

// ========== 数据获取 ==========

async function fetchQuota() {
  try {
    const data = await ocrApi.getQuota();
    if (data && typeof data.price_per_page === 'number') quota.value = data;
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
  if (!selectedFile.value || !clanSlug.value) return;

  uploading.value = true;
  try {
    const response = await uploadPdf(selectedFile.value, clanSlug.value);
    followParse.value = true;
    discardedIssues.value = [];
    completionIssues.value = [];
    await router.replace({
      path: route.path,
      query: { ...route.query, taskId: response.taskId },
    });
    // fullPath 变化会卸载本实例，新实例在 onMounted 里按 taskId 恢复并轮询。
    if (!alive) return;
    taskId.value = response.taskId;
    currentStep.value = 2;
    startPolling();
  } catch (error: any) {
    const data = error.response?.data ?? error;
    const code = data?.code || data?.error;
    if (code === 'INSUFFICIENT_BALANCE') {
      const details = data.details && typeof data.details === 'object' ? data.details : data;
      await handleInsufficientBalance({
        required: Number(details.required ?? 0),
        current: Number(details.current ?? 0),
      });
      return;
    }
    ElMessage.error(data?.message || '上传失败，请重试');
  } finally {
    uploading.value = false;
  }
}

// 轮询任务状态
function startPolling() {
  stopPolling();
  pollingTimer = window.setInterval(async () => {
    try {
      const task = await getTaskStatus(taskId.value);
      taskInfo.value = task;
      await applyTaskStatus(task);
    } catch (error) {
      console.error('轮询任务状态失败:', error);
    }
  }, 2000);
}

async function restoreTask(id: string) {
  try {
    const task = await getTaskStatus(id);
    taskInfo.value = task;
    await applyTaskStatus(task, true);
  } catch {
    ElMessage.error('无法打开该导入任务');
  }
}

async function applyTaskStatus(task: PdfImportTask, fromRestore = false) {
  if (task.status === 'preview' || task.status === 'correcting') {
    stopPolling();
    if (currentStep.value === 1 || (currentStep.value === 2 && !followParse.value)) return;
    await loadPreview();
    return;
  }
  if (task.status === 'completed') {
    stopPolling();
    importResult.value = {
      successCount: task.importResult?.successCount ?? task.recordCount ?? 0,
      failureCount: task.importResult?.failureCount ?? 0,
      skippedCount: task.importResult?.skippedCount ?? 0,
      errors: task.importResult?.errors ?? [],
      ocrFeeDetail: task.ocrFeeDetail,
      anchorPersonId: task.importResult?.anchorPersonId,
    };
    currentStep.value = 4;
    return;
  }
  if (task.status === 'failed') {
    stopPolling();
    currentStep.value = 2;
    const billingErr = task.metadata?.ocrBillingError;
    if (billingErr) {
      await handleInsufficientBalance({
        required: billingErr.required ?? 0,
        current: billingErr.current ?? 0,
      });
    } else {
      ElMessage.error('PDF解析失败: ' + (task.errorMessage || '未知错误'));
    }
    return;
  }
  currentStep.value = 2;
  if (fromRestore) startPolling();
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
    previewRecords.value = response.records;
    activeRow.value = response.records.find((item) => item.confidenceScore < 70 || item.parseWarning) ?? response.records[0] ?? null;
    await loadActivePage();
    currentStep.value = 3;
    // 刷新额度（任务可能消耗了免费额度）
    await fetchQuota();
  } catch (error: any) {
    ElMessage.error('加载预览数据失败');
  }
}

function showImportResult(skippedCount: number, result: PdfExecuteResult) {
  duplicateVisible.value = false;
  completionIssues.value = collectCompletionIssues(skippedCount);
  importResult.value = result;
  currentStep.value = 4;
}

async function recoverCompletedImport() {
  if (!taskId.value) return false;
  try {
    const task = await getTaskStatus(taskId.value);
    if (task.status !== 'completed' || !task.importResult) return false;
    showImportResult(task.importResult.skippedCount ?? 0, {
      success: true,
      message: '导入完成',
      successCount: task.importResult.successCount,
      failureCount: task.importResult.failureCount,
      skippedCount: task.importResult.skippedCount ?? 0,
      errors: task.importResult.errors ?? [],
      anchorPersonId: task.importResult.anchorPersonId,
    });
    return true;
  } catch {
    return false;
  }
}

// 执行导入
async function handleExecuteImport(strategy?: 'skip' | 'merge' | 'create') {
  if (!clanSlug.value) return;

  importing.value = true;
  try {
    const response = await executeImport(taskId.value, clanSlug.value, previewRecords.value, strategy);
    if (response.needsDuplicateChoice) {
      duplicateNames.value = (response.duplicates ?? []).map((item) => item.fullName);
      duplicateVisible.value = true;
      return;
    }

    showImportResult(response.skippedCount ?? 0, response);
    ElMessage.success(response.message || '导入完成');
    await fetchQuota();
  } catch (error: any) {
    const data = error.response?.data ?? error;
    const code = data?.code || data?.error;
    const details = data.details && typeof data.details === 'object' ? data.details : data;
    if (code === 'INSUFFICIENT_BALANCE') {
      await handleInsufficientBalance({
        required: Number(details.required ?? 0),
        current: Number(details.current ?? 0),
      });
    } else if (await recoverCompletedImport()) {
      ElMessage.success('导入完成');
    } else {
      ElMessage.error(data?.message || '导入失败，请重试');
    }
  } finally {
    importing.value = false;
  }
}

function confirmDuplicate(strategy: 'skip' | 'merge' | 'create') {
  duplicateVisible.value = false;
  handleExecuteImport(strategy);
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
  router.push(`/zupu/${clanSlug.value}/genealogy/data?tab=digitize`);
}

function handleWizardBack() {
  if (currentStep.value === 3) {
    followParse.value = false;
    currentStep.value = 2;
    return;
  }
  if (currentStep.value === 2) {
    followParse.value = false;
    stopPolling();
    currentStep.value = 1;
    return;
  }
  handleGoBack();
}

function resumeParsing() {
  followParse.value = true;
  currentStep.value = 2;
  startPolling();
}

async function continueCorrect() {
  followParse.value = true;
  if (!previewRecords.value.length && taskId.value) await loadPreview();
  else currentStep.value = 3;
}

function onSelectionChange(rows: PdfPersonRecord[]) {
  selectedRows.value = rows;
}

function setActiveRow(row: PdfPersonRecord) {
  activeRow.value = row;
  loadActivePage();
}

function rowClassName({ row }: { row: PdfPersonRecord }) {
  return row.confidenceScore < 70 || row.parseWarning ? 'row-low-confidence' : '';
}

function applyBatchGender() {
  const gender = batchGender.value;
  if (gender !== 'M' && gender !== 'F' && gender !== 'UNKNOWN') return;
  selectedRows.value.forEach((row) => {
    row.gender = gender;
  });
  ElMessage.success(`已把 ${selectedRows.value.length} 行的性别改为${gender === 'M' ? '男' : gender === 'F' ? '女' : '未知'}`);
}

function applyBatchGeneration() {
  if (!batchGeneration.value) return;
  const generation = batchGeneration.value;
  selectedRows.value.forEach((row) => {
    row.generation = generation;
  });
  ElMessage.success(`已把 ${selectedRows.value.length} 行的世代改为第 ${generation} 世`);
}

async function batchDelete() {
  if (!selectedRows.value.length) return;
  await ElMessageBox.confirm(`删除选中的 ${selectedRows.value.length} 行？这些行不会写入族谱。`, '删除记录', {
    type: 'warning',
  });
  const removing = new Set(selectedRows.value);
  selectedRows.value.forEach((row) => {
    if (row.confidenceScore < 70 || row.parseWarning) {
      discardedIssues.value.push(`第 ${row.rowNumber} 行「${row.fullName || '未命名'}」：${row.parseWarning || `置信度 ${row.confidenceScore}%`}`);
    }
  });
  previewRecords.value = previewRecords.value.filter((row) => !removing.has(row));
  if (activeRow.value && removing.has(activeRow.value)) {
    activeRow.value = previewRecords.value[0] ?? null;
    loadActivePage();
  }
  selectedRows.value = [];
}

function collectCompletionIssues(skippedCount: number): string[] {
  const kept = previewRecords.value
    .filter((row) => row.confidenceScore < 70 || row.parseWarning)
    .map((row) => `第 ${row.rowNumber} 行「${row.fullName}」仍将写入，但${row.parseWarning || `置信度只有 ${row.confidenceScore}%`}`);
  const skipped = skippedCount > 0 ? [`有 ${skippedCount} 条因为重名被跳过，没有新建人物`] : [];
  return [...discardedIssues.value, ...kept, ...skipped];
}

async function loadActivePage() {
  pageImageUrl.value = '';
  const row = activeRow.value;
  if (!row || taskInfo.value?.parseMode !== 'ocr' || !taskId.value) return;
  const page = row.pageNumber || 1;
  try {
    const image = await getTaskPageImage(taskId.value, page);
    if (activeRow.value === row) pageImageUrl.value = image.dataUrl;
  } catch (error) {
    console.warn('读取原页失败', error);
  }
}

function handleViewTree() {
  if (!clanSlug.value) return;
  const root = importResult.value?.anchorPersonId;
  router.push(root ? { path: `/tree/${clanSlug.value}`, query: { root } } : `/tree/${clanSlug.value}`);
}

function handleReset() {
  stopPolling();
  currentStep.value = 1;
  selectedFile.value = null;
  taskId.value = '';
  taskInfo.value = null;
  previewRecords.value = [];
  importResult.value = null;
  discardedIssues.value = [];
  completionIssues.value = [];
  selectedRows.value = [];
  activeRow.value = null;
  pageImageUrl.value = '';
  followParse.value = true;
  router.replace({ path: route.path, query: {} });
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

.page-progress {
  margin: 8px 0 0;
  font-weight: 600;
}

.duplicate-names {
  font-weight: 600;
  line-height: 1.6;
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.batch-gender {
  width: 110px;
}

.preview-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.preview-table-wrap {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.preview-table-wrap .el-table {
  min-width: 1080px;
}

.source-panel {
  width: 280px;
  flex: none;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
}

.source-panel h4 {
  margin: 0 0 8px;
}

.source-title {
  margin: 0 0 8px;
  font-weight: 600;
}

.source-text {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  line-height: 1.6;
}

.source-image {
  width: 100%;
  margin-top: 8px;
  border: 1px solid #e5e7eb;
}

.source-hint {
  color: #6b7280;
  line-height: 1.6;
}

.issue-list {
  margin-top: 16px;
}

.issue-item {
  margin-bottom: 8px;
}

:deep(.row-low-confidence td) {
  background: #fde2e2 !important;
}

.duplicate-names {
  font-weight: 600;
  line-height: 1.6;
}

.free-note {
  margin-top: 12px;
  color: #67c23a;
  font-size: 13px;
}
</style>