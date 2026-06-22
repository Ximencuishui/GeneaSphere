<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import toolboxApi, { TOOLS } from '@/api/toolbox';
import type { CreditInfo, UsageLog, PackageConfig } from '@/api/toolbox';

const loading = ref(false);
const submitting = ref(false);
const credits = ref<CreditInfo | null>(null);
const history = ref<UsageLog[]>([]);
const historyTotal = ref(0);
const packages = ref<PackageConfig[]>([]);

// 弹窗状态
const purchaseDialogVisible = ref(false);
const processDialogVisible = ref(false);
const selectedTool = ref<typeof TOOLS[0] | null>(null);
const uploadedImage = ref<string>('');
const processedImage = ref<string>('');

// Blob URL 内存管理
const uploadedImageUrl = ref<string>('');

// 购买表单
const purchaseForm = ref({
  package_type: '',
  amount: 0,
});

onMounted(async () => {
  await Promise.all([
    fetchCredits(),
    fetchHistory(),
    fetchPackages(),
  ]);
});

onBeforeUnmount(() => {
  // 组件卸载时释放 Blob URL
  if (uploadedImageUrl.value) {
    URL.revokeObjectURL(uploadedImageUrl.value);
  }
});

async function fetchCredits() {
  try {
    credits.value = await toolboxApi.getCredits();
  } catch (error) {
    console.error('获取额度失败', error);
  }
}

async function fetchHistory() {
  loading.value = true;
  try {
    const result = await toolboxApi.getHistory(20, 0);
    history.value = result.logs || [];
    historyTotal.value = result.total || 0;
  } catch (error) {
    console.error('获取历史失败', error);
  } finally {
    loading.value = false;
  }
}

async function fetchPackages() {
  try {
    packages.value = await toolboxApi.getPackages();
  } catch (error) {
    console.error('获取次数包失败', error);
  }
}

function hasEnoughCredits(tool: typeof TOOLS[0]): boolean {
  if (!credits.value) return false;
  return credits.value.total >= tool.creditsCost;
}

function handleToolClick(tool: typeof TOOLS[0]) {
  if (!hasEnoughCredits(tool)) {
    ElMessage.warning('余额不足，请先购买次数包');
    purchaseDialogVisible.value = true;
    return;
  }
  selectedTool.value = tool;
  processDialogVisible.value = true;
}

function handlePurchasePackage(pkg: PackageConfig) {
  purchaseForm.value.package_type = pkg.type;
  purchaseForm.value.amount = pkg.price;
  purchaseDialogVisible.value = false;

  ElMessageBox.confirm(
    `确定购买 ${pkg.label} 吗？价格：¥${pkg.price}`,
    '确认购买',
    {
      confirmButtonText: '确认支付',
      cancelButtonText: '取消',
      type: 'warning',
    },
  ).then(async () => {
    submitting.value = true;
    try {
      const result = await toolboxApi.purchase(purchaseForm.value);
      if (result.success) {
        ElMessage.success(result.message || '购买成功');
        await fetchCredits();
      } else {
        ElMessage.error(result.message || '购买失败');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || '购买失败，请重试';
      ElMessage.error(msg);
    } finally {
      submitting.value = false;
    }
  }).catch(() => {});
}

async function handleProcessImage() {
  if (!selectedTool.value || !uploadedImage.value) {
    ElMessage.warning('请先上传图片');
    return;
  }

  submitting.value = true;
  try {
    const result = await toolboxApi.process({
      tool_type: selectedTool.value.type,
      image_url: uploadedImage.value,
    });

    if (result.success) {
      processedImage.value = result.outputUrl || uploadedImage.value;
      ElMessage.success(result.message || '处理成功');
      await fetchCredits();
      await fetchHistory();
    } else if (result.needPurchase) {
      ElMessage.warning(result.error || '余额不足');
      purchaseDialogVisible.value = true;
    } else {
      ElMessage.error(result.error || '处理失败');
    }
  } catch (error: any) {
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message || '处理失败，请重试';
      ElMessage.error(msg);
    } finally {
      submitting.value = false;
    }
}

function handleImageUpload(url: string) {
  // 释放旧的 Blob URL
  if (uploadedImageUrl.value) {
    URL.revokeObjectURL(uploadedImageUrl.value);
  }
  uploadedImageUrl.value = url;
  uploadedImage.value = url;
  processedImage.value = '';
}

function onFileSelect(file: File) {
  const blobUrl = URL.createObjectURL(file);
  handleImageUpload(blobUrl);
}

function statusTagType(status?: string) {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'danger';
    case 'processing': return 'warning';
    default: return 'info';
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case 'completed': return '已完成';
    case 'failed': return '失败';
    case 'processing': return '处理中';
    default: return '待处理';
  }
}

function toolName(type?: string) {
  const tool = TOOLS.find(t => t.type === type);
  return tool?.name || type || '未知';
}

function getToolIcon(iconName: string) {
  const iconMap: Record<string, string> = {
    'magic-stick': 'MagicStick',
    'palette': 'Palette',
    'full-screen': 'FullScreen',
    'delete': 'Delete',
    'connection': 'Connection',
    'zoom-in': 'ZoomIn',
    'video-play': 'VideoPlay',
  };
  return iconMap[iconName] || 'Tools';
}
</script>

<template>
  <div class="toolbox-page">
    <!-- 额度显示 -->
    <ElCard class="credit-card" v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">我的工具箱</h2>
          <ElButton type="primary" plain size="small" @click="purchaseDialogVisible = true">
            购买次数包
          </ElButton>
        </div>
      </template>

      <div class="credit-display">
        <div class="credit-item">
          <div class="credit-value">{{ credits?.free_remaining || 0 }}</div>
          <div class="credit-label">本月免费额度</div>
        </div>
        <div class="credit-item">
          <div class="credit-value paid">{{ credits?.paid_balance || 0 }}</div>
          <div class="credit-label">付费余额</div>
        </div>
        <div class="credit-item">
          <div class="credit-value shared">{{ credits?.shared_balance || 0 }}</div>
          <div class="credit-label">家族共享</div>
        </div>
        <div class="credit-item total">
          <div class="credit-value">{{ credits?.total || 0 }}</div>
          <div class="credit-label">总计可用</div>
        </div>
      </div>

      <ElAlert
        v-if="(credits?.total || 0) === 0"
        type="warning"
        :closable="false"
        show-icon
        class="credit-warning"
      >
        您的额度已用完，请购买次数包继续使用
      </ElAlert>
    </ElCard>

    <!-- 工具选择 -->
    <ElCard class="tools-card">
      <template #header>
        <div class="header">
          <h3 class="section-title">AI 图像处理工具</h3>
          <span class="tool-hint">点击工具开始处理</span>
        </div>
      </template>

      <div class="tools-grid">
        <div
          v-for="tool in TOOLS"
          :key="tool.type"
          class="tool-card"
          :class="{ disabled: !hasEnoughCredits(tool) }"
          @click="handleToolClick(tool)"
        >
          <div class="tool-icon">
            <ElIcon :size="32">
              <component :is="getToolIcon(tool.icon)" />
            </ElIcon>
          </div>
          <div class="tool-name">{{ tool.name }}</div>
          <div class="tool-desc">{{ tool.description }}</div>
          <div class="tool-cost" :class="{ highlight: tool.creditsCost > 1 }">
            消耗 {{ tool.creditsCost }} 次
            <span v-if="tool.creditsCost > 1" class="cost-note">（高级功能）</span>
          </div>
        </div>
      </div>
    </ElCard>

    <!-- 视频生成工具 -->
    <ElCard class="video-card">
      <template #header>
        <div class="header">
          <h3 class="section-title">视频生成工具</h3>
          <span class="tool-hint">生成专属的家族血脉视频</span>
        </div>
      </template>

      <div class="video-tools-grid">
        <div class="tool-card" @click="$router.push('/user-center/videos/create')">
          <div class="tool-icon">
            <ElIcon :size="32"><VideoCamera /></ElIcon>
          </div>
          <div class="tool-name">历史音像墙</div>
          <div class="tool-desc">为目标人物生成包含其全血脉的视频</div>
        </div>
        <div class="tool-card highlight" @click="$router.push('/user-center/lineage-video')">
          <div class="tool-icon">
            <ElIcon :size="32"><VideoPlay /></ElIcon>
          </div>
          <div class="tool-name">直系血缘视频</div>
          <div class="tool-desc">以中心人物追溯直系父/母/双系血脉线，生成专属视频</div>
          <div class="tool-cost highlight">免费 2 次/月</div>
        </div>
        <div class="tool-card" @click="$router.push('/user-center/family-book')">
          <div class="tool-icon">
            <ElIcon :size="32"><Notebook /></ElIcon>
          </div>
          <div class="tool-name">家庭图册</div>
          <div class="tool-desc">从某位前辈开始，生成向后若干代的家庭成员图文册</div>
          <div class="tool-cost">免费</div>
        </div>
      </div>
    </ElCard>

    <!-- 使用历史 -->
    <ElCard class="history-card" v-loading="loading">
      <template #header>
        <div class="header">
          <h3 class="section-title">最近使用记录</h3>
          <span class="history-count">共 {{ historyTotal }} 条记录</span>
        </div>
      </template>

      <ElTable :data="history" stripe>
        <ElTableColumn prop="tool_type" label="工具类型" width="140">
          <template #default="{ row }">
            {{ toolName(row.tool_type) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="处理时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="消耗次数" width="100">
          <template #default="{ row }">
            {{ row.credits_used }} 次
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="结果">
          <template #default="{ row }">
            <div v-if="row.output_url" class="result-preview">
              <ElImage
                :src="row.output_url"
                :preview-src-list="[row.output_url]"
                fit="cover"
                class="preview-img"
              />
            </div>
            <span v-else class="no-result">—</span>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty
        v-if="!loading && history.length === 0"
        description="暂无使用记录"
      >
        <template #image>
          <ElIcon :size="64" color="#c0c4cc"><Tools /></ElIcon>
        </template>
      </ElEmpty>
    </ElCard>

    <!-- 购买次数包弹窗 -->
    <ElDialog
      v-model="purchaseDialogVisible"
      title="购买次数包"
      width="600px"
      destroy-on-close
    >
      <div class="packages-grid">
        <div
          v-for="pkg in packages"
          :key="pkg.type"
          class="package-card"
          :class="{ selected: purchaseForm.package_type === pkg.type }"
          @click="purchaseForm.package_type = pkg.type; purchaseForm.amount = pkg.price"
        >
          <div class="package-label">{{ pkg.label }}</div>
          <div class="package-size">{{ pkg.size }} 次</div>
          <div class="package-price">¥{{ pkg.price }}</div>
          <div class="package-unit">约 ¥{{ pkg.pricePerUnit.toFixed(2) }}/次</div>
          <div class="package-validity">有效期 {{ pkg.validityYears }} 年</div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <ElButton @click="purchaseDialogVisible = false">取消</ElButton>
          <ElButton
            type="primary"
            :loading="submitting"
            :disabled="!purchaseForm.package_type"
            @click="handlePurchasePackage(packages.find(p => p.type === purchaseForm.package_type)!)"
          >
            立即购买 ¥{{ purchaseForm.amount || 0 }}
          </ElButton>
        </div>
      </template>
    </ElDialog>

    <!-- 图片处理弹窗 -->
    <ElDialog
      v-model="processDialogVisible"
      :title="selectedTool?.name || '图片处理'"
      width="800px"
      destroy-on-close
    >
      <div class="process-container">
        <div class="upload-area">
          <ElUpload
            class="image-uploader"
            :show-file-list="false"
            :before-upload="(file: File) => { onFileSelect(file); return false; }"
          >
            <div v-if="!uploadedImage" class="upload-placeholder">
              <ElIcon :size="48" color="#c0c4cc"><UploadFilled /></ElIcon>
              <span>点击上传图片</span>
            </div>
            <ElImage v-else :src="uploadedImage" fit="contain" class="uploaded-image" />
          </ElUpload>
        </div>

        <div v-if="processedImage" class="result-area">
          <div class="result-label">处理结果</div>
          <ElImage :src="processedImage" fit="contain" class="result-image" />
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <span class="cost-tip">
            本次消耗 {{ selectedTool?.creditsCost || 0 }} 次，剩余 {{ credits?.total || 0 }} 次
          </span>
          <ElButton @click="processDialogVisible = false">关闭</ElButton>
          <ElButton
            type="primary"
            :loading="submitting"
            :disabled="!uploadedImage"
            @click="handleProcessImage"
          >
            开始处理
          </ElButton>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.toolbox-page {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.section-title {
  margin: 0;
  font-size: 16px;
}

.credit-display {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 8px 0;
}

.credit-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.credit-item.total {
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  color: #fff;
}

.credit-value {
  font-size: 28px;
  font-weight: 700;
  color: #5d4037;
}

.credit-item.total .credit-value {
  color: #fff;
}

.credit-value.paid {
  color: #409eff;
}

.credit-value.shared {
  color: #67c23a;
}

.credit-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.credit-item.total .credit-label {
  color: rgba(255, 255, 255, 0.8);
}

.credit-warning {
  margin-top: 16px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.video-tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.video-tools-grid .tool-card.highlight {
  background: linear-gradient(135deg, #fff7e6 0%, #fff 100%);
  border-color: #ffd591;
}

.video-tools-grid .tool-card.highlight:hover {
  border-color: #fa8c16;
  box-shadow: 0 8px 24px rgba(250, 140, 22, 0.18);
}

.tool-card {
  padding: 20px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.tool-card:hover:not(.disabled) {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(93, 64, 55, 0.12);
  border-color: #5d4037;
}

.tool-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tool-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  background: linear-gradient(135deg, #fff5f0, #faf8f5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5d4037;
}

.tool-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.tool-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  line-height: 1.4;
}

.tool-cost {
  font-size: 12px;
  color: #606266;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  display: inline-block;
}

.tool-cost.highlight {
  color: #e6a23c;
  background: #fdf6ec;
}

.cost-note {
  font-size: 11px;
}

.tool-hint,
.history-count {
  font-size: 12px;
  color: #909399;
}

.result-preview {
  width: 48px;
  height: 48px;
}

.preview-img {
  width: 48px;
  height: 48px;
  border-radius: 4px;
}

.no-result {
  color: #c0c4cc;
}

.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.package-card {
  padding: 16px 12px;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.package-card:hover {
  border-color: #c9a96e;
}

.package-card.selected {
  border-color: #5d4037;
  background: #fdf8f5;
}

.package-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.package-size {
  font-size: 20px;
  font-weight: 700;
  color: #5d4037;
  margin-bottom: 4px;
}

.package-price {
  font-size: 16px;
  font-weight: 600;
  color: #f56c6c;
  margin-bottom: 2px;
}

.package-unit {
  font-size: 11px;
  color: #909399;
  margin-bottom: 2px;
}

.package-validity {
  font-size: 10px;
  color: #67c23a;
}

.process-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.upload-area,
.result-area {
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.image-uploader {
  width: 100%;
  height: 100%;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #909399;
  cursor: pointer;
}

.uploaded-image,
.result-image {
  width: 100%;
  max-height: 280px;
}

.result-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cost-tip {
  flex: 1;
  font-size: 13px;
  color: #606266;
}

@media (max-width: 768px) {
  .credit-display {
    grid-template-columns: repeat(2, 1fr);
  }

  .process-container {
    grid-template-columns: 1fr;
  }
}
</style>
