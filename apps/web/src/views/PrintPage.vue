<template>
  <div class="print-page">
    <el-card class="print-card">
      <template #header>
        <div class="card-header">
          <h2>📕 族谱打印</h2>
        </div>
      </template>

      <!-- 打印选项 -->
      <div class="print-options">
        <el-form label-width="120px">
          <el-form-item label="选择家族">
            <el-select
              v-model="selectedClanId"
              placeholder="请选择要打印的家族"
              @change="handleClanChange"
            >
              <el-option
                v-for="clan in clanList"
                :key="clan.id"
                :label="clan.name"
                :value="clan.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="打印模板">
            <el-radio-group v-model="printTemplate">
              <el-radio value="classic">经典宣纸风格</el-radio>
              <el-radio value="modern">现代精装风格</el-radio>
              <el-radio value="simple">简约风格</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="包含内容">
            <el-checkbox-group v-model="printOptions">
              <el-checkbox value="tree">族谱树图</el-checkbox>
              <el-checkbox value="persons">人员名录</el-checkbox>
              <el-checkbox value="photos">照片墙</el-checkbox>
              <el-checkbox value="timeline">时光轴</el-checkbox>
            </el-checkbox-group>
          </el-form-item>

          <el-form-item label="打印份数">
            <el-input-number
              v-model="printQuantity"
              :min="1"
              :max="100"
            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 预览区域 -->
      <div class="preview-section">
        <h3>打印预览</h3>
        <div class="preview-container">
          <iframe
            v-if="pdfPreviewUrl"
            :src="pdfPreviewUrl"
            class="pdf-preview"
            frameborder="0"
          />
          <el-empty v-else description="请选择家族并生成预览" />
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!selectedClanId"
          @click="handleGeneratePreview"
        >
          生成预览
        </el-button>

        <el-button
          type="success"
          :loading="ordering"
          :disabled="!pdfPreviewUrl"
          @click="handlePlaceOrder"
        >
          立即下单
        </el-button>

        <el-button
          :disabled="!pdfPreviewUrl"
          @click="handleDownloadPdf"
        >
          下载 PDF
        </el-button>
      </div>

      <!-- 订单确认对话框 -->
      <el-dialog v-model="showOrderDialog" title="确认订单" width="500px">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="家族名称">
            {{ selectedClanName }}
          </el-descriptions-item>
          <el-descriptions-item label="打印模板">
            {{ templateLabel }}
          </el-descriptions-item>
          <el-descriptions-item label="包含内容">
            {{ optionsLabel }}
          </el-descriptions-item>
          <el-descriptions-item label="打印份数">
            {{ printQuantity }} 份
          </el-descriptions-item>
          <el-descriptions-item label="预估价格">
            <span class="price">¥ {{ estimatedPrice }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          type="info"
          :closable="false"
          style="margin-top: 15px;"
        >
          此为模拟下单功能，实际支付和打印服务将在未来版本中接入。
        </el-alert>

        <template #footer>
          <el-button @click="showOrderDialog = false">取消</el-button>
          <el-button type="primary" :loading="ordering" @click="handleConfirmOrder">
            确认下单
          </el-button>
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

// 状态
const selectedClanId = ref<string | number | null>(null);
const selectedClanName = ref('');
const printTemplate = ref('classic');
const printOptions = ref<string[]>(['tree', 'persons']);
const printQuantity = ref(1);
const generating = ref(false);
const ordering = ref(false);
const pdfPreviewUrl = ref('');
const showOrderDialog = ref(false);
const clanList = ref<{ id: bigint; name: string }[]>([]);

// 计算属性
const templateLabel = computed(() => {
  const map: Record<string, string> = {
    classic: '经典宣纸风格',
    modern: '现代精装风格',
    simple: '简约风格',
  };
  return map[printTemplate.value] || '未知';
});

const optionsLabel = computed(() => {
  const map: Record<string, string> = {
    tree: '族谱树图',
    persons: '人员名录',
    photos: '照片墙',
    timeline: '时光轴',
  };
  return printOptions.value.map(opt => map[opt] || opt).join('、');
});

const estimatedPrice = computed(() => {
  // 简单的价格计算逻辑
  const basePrice = 50; // 基础价格 50 元
  const optionsPrice = printOptions.value.length * 10; // 每个选项加 10 元
  const templateMultiplier = printTemplate.value === 'modern' ? 1.5 : 1; // 现代风格加价 50%
  return (basePrice + optionsPrice * templateMultiplier) * printQuantity.value;
});

// 处理家族选择变化
function handleClanChange(clanId: string | number) {
  const clan = clanList.value.find(c => String(c.id) === String(clanId));
  selectedClanName.value = clan?.name || '';
  pdfPreviewUrl.value = ''; // 清空预览
}

// 生成预览
async function handleGeneratePreview() {
  if (!selectedClanId.value) {
    ElMessage.error('请先选择家族');
    return;
  }

  generating.value = true;
  try {
    const response = await fetch(`/api/print/genealogy/${selectedClanId.value}`, {
      method: 'GET',
      headers: {
        // 如果有 token，添加到请求头
        ...(localStorage.getItem('geneasphere_token')
          ? { Authorization: `Bearer ${localStorage.getItem('geneasphere_token')}` }
          : {}),
      },
    });

    if (!response.ok) {
      throw new Error('生成 PDF 失败');
    }

    const blob = await response.blob();
    pdfPreviewUrl.value = URL.createObjectURL(blob);
    ElMessage.success('预览生成成功！');
  } catch (error: any) {
    ElMessage.error(`生成预览失败：${error.message}`);
  } finally {
    generating.value = false;
  }
}

// 下载 PDF
function handleDownloadPdf() {
  if (!pdfPreviewUrl.value) return;

  const link = document.createElement('a');
  link.href = pdfPreviewUrl.value;
  link.download = `族谱_${selectedClanName.value}.pdf`;
  link.click();
}

// 下单
function handlePlaceOrder() {
  if (!pdfPreviewUrl.value) {
    ElMessage.error('请先生成预览');
    return;
  }
  showOrderDialog.value = true;
}

// 确认下单
async function handleConfirmOrder() {
  ordering.value = true;
  try {
    // 模拟下单请求
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    ElMessage.success('下单成功！订单号：' + Date.now());
    showOrderDialog.value = false;
  } catch (error: any) {
    ElMessage.error(`下单失败：${error.message}`);
  } finally {
    ordering.value = false;
  }
}

// 加载家族列表
async function loadClans() {
  try {
    // TODO: 从 API 加载家族列表
    // 这里使用模拟数据
    clanList.value = [
      { id: 1n, name: '张氏家族' },
      { id: 2n, name: '李氏家族' },
    ];
  } catch (error: any) {
    console.error('加载家族列表失败：', error);
  }
}

// 初始化
onMounted(() => {
  loadClans();
});
</script>

<style scoped>
.print-page {
  max-width: 1200px;
  margin: 20px auto;
  padding: 0 20px;
}

.print-card {
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

.print-options {
  margin-bottom: 30px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

.preview-section {
  margin-bottom: 30px;
}

.preview-section h3 {
  margin-bottom: 15px;
}

.preview-container {
  width: 100%;
  height: 600px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
}

.pdf-preview {
  width: 100%;
  height: 100%;
}

.action-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.price {
  font-size: 20px;
  color: #f56c6c;
  font-weight: bold;
}
</style>
