<template>
  <div class="import-page">
    <el-card class="import-card">
      <template #header>
        <div class="card-header">
          <h2>📥 导入族谱数据</h2>
          <el-button @click="handleGoBack">返回</el-button>
        </div>
      </template>

      <!-- 步骤指示器 -->
      <el-steps
        :active="importStore.currentStep - 1"
        finish-status="success"
        class="import-steps"
      >
        <el-step title="上传文件" />
        <el-step title="列映射" />
        <el-step title="确认导入" />
        <el-step title="完成" />
      </el-steps>

      <!-- Step 1: 上传文件 -->
      <div v-if="importStore.isUploadStep" class="step-content">
        <h3>第一步：上传 Excel 文件</h3>
        <p class="step-description">
          请上传包含族谱数据的 Excel 文件（.xlsx 格式）。系统将自动解析文件内容。
        </p>

        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          accept=".xlsx"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          drag
          class="upload-dragger"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将文件拖到此处，或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              仅支持 .xlsx 格式，文件大小不超过 10MB
            </div>
          </template>
        </el-upload>

        <div class="step-actions">
          <el-button
            type="primary"
            :disabled="!importStore.uploadedFile"
            @click="handleParseFile"
            :loading="parsingFile"
          >
            解析文件
          </el-button>
          <el-button @click="handleDownloadTemplate">
            下载模板
          </el-button>
        </div>
      </div>

      <!-- Step 2: 列映射 -->
      <div v-if="importStore.isMappingStep" class="step-content">
        <h3>第二步：映射列名</h3>
        <p class="step-description">
          请将 Excel 中的列名映射到系统字段。系统已尝试自动匹配，请确认或修改。
          <strong>姓名</strong>和<strong>性别</strong>为必填项。
        </p>

        <el-table :data="mappingTableData" border class="mapping-table">
          <el-table-column prop="systemField" label="系统字段" width="150" />
          <el-table-column prop="description" label="说明" width="200" />
          <el-table-column label="Excel 列名">
            <template #default="{ row }">
              <el-select
                v-model="importStore.columnMapping[row.field]"
                placeholder="请选择对应的列"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="col in importStore.fileColumns"
                  :key="col"
                  :label="col"
                  :value="col"
                />
                <el-option label="不导入此字段" value="" />
              </el-select>
            </template>
          </el-table-column>
        </el-table>

        <!-- 数据预览 -->
        <div class="preview-section">
          <h4>数据预览（前 5 行）</h4>
          <el-table :data="importStore.previewData" border max-height="300">
            <el-table-column
              v-for="col in importStore.fileColumns"
              :key="col"
              :prop="col"
              :label="col"
            />
          </el-table>
        </div>

        <div class="step-actions">
          <el-button @click="importStore.prevStep()">上一步</el-button>
          <el-button
            type="primary"
            @click="importStore.nextStep()"
            :disabled="!importStore.canProceedToConfirm"
          >
            下一步
          </el-button>
        </div>
      </div>

      <!-- Step 3: 确认导入 -->
      <div v-if="importStore.isConfirmStep" class="step-content">
        <h3>第三步：确认导入</h3>
        <p class="step-description">
          请确认以下信息无误后，点击"开始导入"按钮。
        </p>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="文件名">
            {{ importStore.uploadedFile?.name }}
          </el-descriptions-item>
          <el-descriptions-item label="文件大小">
            {{ formatFileSize(importStore.uploadedFile?.size || 0) }}
          </el-descriptions-item>
          <el-descriptions-item label="数据行数">
            {{ importStore.previewData.length }} 行（预览）
          </el-descriptions-item>
          <el-descriptions-item label="映射字段数">
            {{ mappedFieldsCount }} 个
          </el-descriptions-item>
        </el-descriptions>

        <div class="mapping-summary">
          <h4>字段映射摘要</h4>
          <el-tag
            v-for="(value, key) in importStore.columnMapping"
            :key="key"
            v-show="value !== ''"
            class="mapping-tag"
          >
            {{ getFieldLabel(key) }} → {{ value }}
          </el-tag>
        </div>

        <div class="step-actions">
          <el-button @click="importStore.prevStep()">上一步</el-button>
          <el-button
            type="primary"
            @click="handleStartImport"
            :loading="importStore.uploading"
          >
            开始导入
          </el-button>
        </div>
      </div>

      <!-- Step 4: 完成 -->
      <div v-if="importStore.isCompleteStep" class="step-content">
        <el-result
          :icon="importResultIcon"
          :title="importResultTitle"
          :sub-title="importResultSubtitle"
        >
          <template #extra>
            <el-button type="primary" @click="handleViewTree">
              查看族谱树
            </el-button>
            <el-button @click="importStore.reset()">
              继续导入
            </el-button>
          </template>
        </el-result>

        <!-- 错误详情 -->
        <div v-if="importStore.importResult?.errors?.length > 0" class="error-details">
          <h4>导入错误详情</h4>
          <el-table :data="importStore.importResult.errors" border max-height="300">
            <el-table-column prop="row" label="行号" width="80" />
            <el-table-column prop="message" label="错误信息" />
          </el-table>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { useImportStore } from '@/stores/import';
import { useClanStore } from '@/stores/clan';
import type { ColumnMapping } from '@/types';

const router = useRouter();
const importStore = useImportStore();
const clanStore = useClanStore();

const uploadRef = ref();
const parsingFile = ref(false);

// 映射表格数据
const mappingTableData = reactive([
  { field: 'full_name', systemField: '姓名 *', description: '必填，人员的完整姓名' },
  { field: 'gender', systemField: '性别 *', description: '必填，男/女 或 male/female' },
  { field: 'birth_date', systemField: '出生日期', description: '格式：YYYY-MM-DD' },
  { field: 'death_date', systemField: '死亡日期', description: '格式：YYYY-MM-DD，在世人员留空' },
  { field: 'is_living', systemField: '是否在世', description: '是/否 或 true/false' },
  { field: 'parent_name', systemField: '父/母姓名', description: '用于建立父子关系' },
  { field: 'spouse_name', systemField: '配偶姓名', description: '用于建立夫妻关系' },
  { field: 'generation', systemField: '辈分/字辈', description: '如：文、明、开' },
  { field: 'description', systemField: '简介', description: '人员简介或备注' },
]);

// 已映射字段数
const mappedFieldsCount = computed(() => {
  return Object.values(importStore.columnMapping).filter(v => v !== '').length;
});

// 导入结果图标
const importResultIcon = computed(() => {
  if (!importStore.importResult) return 'info';
  return importStore.importResult.failureCount === 0 ? 'success' : 'warning';
});

const importResultTitle = computed(() => {
  if (!importStore.importResult) return '';
  const { successCount, failureCount } = importStore.importResult;
  if (failureCount === 0) {
    return `导入成功！共导入 ${successCount} 条数据`;
  }
  return `导入完成（部分失败）`;
});

const importResultSubtitle = computed(() => {
  if (!importStore.importResult) return '';
  const { successCount, failureCount } = importStore.importResult;
  return `成功 ${successCount} 条，失败 ${failureCount} 条`;
});

// 获取字段标签
function getFieldLabel(field: string): string {
  const item = mappingTableData.find(m => m.field === field);
  return item ? item.systemField : field;
}

// 处理文件选择
function handleFileChange(file: any) {
  const rawFile = file.raw;
  
  // 验证文件类型
  if (!rawFile.name.endsWith('.xlsx')) {
    ElMessage.error('仅支持 .xlsx 格式文件');
    uploadRef.value?.clearFiles();
    return;
  }
  
  // 验证文件大小（10MB）
  if (rawFile.size > 10 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 10MB');
    uploadRef.value?.clearFiles();
    return;
  }
  
  importStore.setFile(rawFile);
}

// 处理文件移除
function handleFileRemove() {
  importStore.reset();
}

// 解析文件（读取列名和预览数据）
async function handleParseFile() {
  if (!importStore.uploadedFile) return;
  
  parsingFile.value = true;
  
  try {
    // 使用 SheetJS 在前端解析 Excel（预览用）
    const XLSX = await import('xlsx');
    const data = await importStore.uploadedFile.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // 获取列名（第一行）
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (jsonData.length < 2) {
      ElMessage.error('Excel 文件至少需包含标题行和一行数据');
      return;
    }
    
    const columns = (jsonData[0] as any[]).map(col => String(col).trim());
    const preview = XLSX.utils.sheet_to_json(worksheet, { range: 1, limit: 5 });
    
    importStore.setFileColumns(columns, preview as Record<string, any>[]);
    importStore.nextStep();
  } catch (error: any) {
    ElMessage.error(`文件解析失败：${error.message}`);
  } finally {
    parsingFile.value = false;
  }
}

// 开始导入
async function handleStartImport() {
  if (!clanStore.currentClan) {
    ElMessage.error('请先选择家族');
    return;
  }
  
  await importStore.submitImport(clanStore.currentClan.id);
}

// 查看族谱树
function handleViewTree() {
  if (!clanStore.currentClan) return;
  router.push(`/tree/${clanStore.currentClan.id}`);
}

// 下载模板
function handleDownloadTemplate() {
  ElMessage.info('模板下载功能开发中...');
}

// 返回
function handleGoBack() {
  router.back();
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
</script>

<style scoped>
.import-page {
  max-width: 1000px;
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

.step-actions {
  margin-top: 30px;
  display: flex;
  gap: 10px;
}

.mapping-table {
  margin-bottom: 30px;
}

.preview-section {
  margin-top: 30px;
}

.preview-section h4 {
  margin-bottom: 10px;
}

.mapping-summary {
  margin: 20px 0;
}

.mapping-summary h4 {
  margin-bottom: 10px;
}

.mapping-tag {
  margin-right: 10px;
  margin-bottom: 10px;
}

.error-details {
  margin-top: 30px;
}

.error-details h4 {
  margin-bottom: 10px;
  color: #F56C6C;
}
</style>
