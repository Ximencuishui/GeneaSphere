<script setup lang="ts">
/**
 * 云存储管理页
 * - 2024 真实性整改：取消「开发中」假入口，改为「人工审核扩容申请」
 * - 在支付 Provider 未配置时，提交申请后由平台管理员审核；禁止伪造支付/立即扩容
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import axios from 'axios';
import {
  storageUpgradeApi,
  type StorageUpgradePlan,
  type StorageUpgradeRequest,
} from '@/api/storageUpgrade';

const route = useRoute();

const clanSlug = ref('');
const loading = ref(false);
const storageInfo = ref({
  used_bytes: 0,
  used_percentage: 0,
  max_bytes: 5 * 1024 * 1024 * 1024,
  breakdown: { photos: 0, videos: 0, others: 0 },
});

/** 套餐列表 + 申请记录 */
const plans = ref<StorageUpgradePlan[]>([]);
const requests = ref<StorageUpgradeRequest[]>([]);

/** 提交申请对话框 */
const applyDialogVisible = ref(false);
const applySubmitting = ref(false);
const applyForm = ref({
  plan_code: '',
  reason: '',
  contact_info: '',
});
const applyRules = {
  plan_code: [{ required: true, message: '请选择套餐', trigger: 'change' }],
  reason: [
    { required: true, message: '请填写申请原因', trigger: 'blur' },
    { max: 500, message: '原因不能超过 500 字符', trigger: 'blur' },
  ],
  contact_info: [
    { max: 200, message: '联系方式不能超过 200 字符', trigger: 'blur' },
  ],
};

const DEFAULT_QUOTA = 5 * 1024 * 1024 * 1024;
const currentQuotaBytes = computed(
  () => storageInfo.value.max_bytes || DEFAULT_QUOTA,
);

const pendingRequest = computed(() =>
  requests.value.find((r) => r.status === 'PENDING'),
);
const latestDecidedRequest = computed(() =>
  requests.value.find((r) => r.status === 'APPROVED' || r.status === 'REJECTED'),
);

const formatGB = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(2);
const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString() : '—';

const fetchStorage = async () => {
  loading.value = true;
  try {
    const res = await axios.get('/api/admin/settings/storage', {
      params: { clanSlug: clanSlug.value },
    });
    storageInfo.value = {
      used_bytes: Number(res.data?.used_bytes || 0),
      used_percentage: Math.round(Number(res.data?.used_percentage || 0)),
      max_bytes: Number(res.data?.max_bytes || DEFAULT_QUOTA),
      breakdown: {
        photos: Number(res.data?.breakdown?.photos || 0),
        videos: Number(res.data?.breakdown?.videos || 0),
        others: Number(res.data?.breakdown?.others || 0),
      },
    };
  } catch (error) {
    console.error('Failed to fetch storage:', error);
  } finally {
    loading.value = false;
  }
};

const fetchPlans = async () => {
  try {
    const res = await storageUpgradeApi.listPlans();
    plans.value = (res?.data as StorageUpgradePlan[]) || [];
  } catch (error) {
    console.error('Failed to fetch plans:', error);
  }
};

const fetchRequests = async () => {
  if (!clanSlug.value) return;
  try {
    const res = await storageUpgradeApi.listMyRequests(clanSlug.value);
    requests.value = (res?.data as StorageUpgradeRequest[]) || [];
  } catch (error) {
    console.error('Failed to fetch upgrade requests:', error);
  }
};

const refreshAll = async () => {
  await Promise.all([fetchStorage(), fetchRequests()]);
};

const openApplyDialog = () => {
  if (pendingRequest.value) {
    ElMessage.warning('您还有一份待审核的申请，请先等待处理或撤销');
    return;
  }
  applyForm.value = {
    plan_code: plans.value[0]?.code || '',
    reason: '',
    contact_info: '',
  };
  applyDialogVisible.value = true;
};

const submitApply = async () => {
  if (!applyForm.value.plan_code) {
    ElMessage.warning('请选择套餐');
    return;
  }
  if (!applyForm.value.reason.trim()) {
    ElMessage.warning('请填写申请原因');
    return;
  }
  applySubmitting.value = true;
  try {
    await storageUpgradeApi.submitRequest(clanSlug.value, {
      plan_code: applyForm.value.plan_code,
      reason: applyForm.value.reason.trim(),
      contact_info: applyForm.value.contact_info.trim() || undefined,
    });
    ElMessage.success('扩容申请已提交，请等待管理员审核');
    applyDialogVisible.value = false;
    await fetchRequests();
  } catch (error: any) {
    const msg =
      error?.response?.data?.message || error?.message || '申请提交失败';
    ElMessage.error(msg);
  } finally {
    applySubmitting.value = false;
  }
};

const cancelRequest = async (req: StorageUpgradeRequest) => {
  try {
    await ElMessageBox.confirm('确定要撤销这份扩容申请吗？', '撤销申请', {
      type: 'warning',
      confirmButtonText: '撤销',
      cancelButtonText: '不撤销',
    });
  } catch {
    return;
  }
  try {
    await storageUpgradeApi.cancelRequest(req.id);
    ElMessage.success('申请已撤销');
    await fetchRequests();
  } catch (error: any) {
    const msg =
      error?.response?.data?.message || error?.message || '撤销失败';
    ElMessage.error(msg);
  }
};

const statusTagType = (status: string): 'success' | 'warning' | 'info' | 'danger' => {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    case 'CANCELED':
      return 'info';
    default:
      return 'info';
  }
};
const statusLabel = (status: string) => {
  switch (status) {
    case 'APPROVED':
      return '已通过';
    case 'PENDING':
      return '待审核';
    case 'REJECTED':
      return '已拒绝';
    case 'CANCELED':
      return '已撤销';
    default:
      return status;
  }
};

onMounted(async () => {
  clanSlug.value = (route.params.slug as string) || '1';
  await Promise.all([refreshAll(), fetchPlans()]);
});

watch(
  () => route.params.slug,
  (s) => {
    if (s) {
      clanSlug.value = String(s);
      refreshAll();
    }
  },
);
</script>

<template>
  <div class="storage-page">
    <ElCard v-loading="loading">
      <template #header>
        <h2>云存储</h2>
      </template>

      <div class="storage-content">
        <div class="usage-chart">
          <ElProgress
            type="dashboard"
            :percentage="storageInfo.used_percentage"
            :color="storageInfo.used_percentage > 80 ? '#F56C6C' : '#409EFF'"
            :stroke-width="20"
          >
            <template #default="{ percentage }">
              <span class="progress-label">{{ percentage }}%</span>
              <div class="progress-desc">已使用</div>
            </template>
          </ElProgress>
        </div>

        <div class="storage-details">
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="已用空间">
              {{ formatGB(storageInfo.used_bytes) }} GB
            </ElDescriptionsItem>
            <ElDescriptionsItem label="总空间">
              {{ formatGB(currentQuotaBytes) }} GB
            </ElDescriptionsItem>
            <ElDescriptionsItem label="剩余空间">
              {{
                formatGB(
                  Math.max(0, currentQuotaBytes - storageInfo.used_bytes),
                )
              }} GB
            </ElDescriptionsItem>
          </ElDescriptions>

          <div class="breakdown" style="margin-top: 20px;">
            <h4>文件构成</h4>
            <ElRow :gutter="20">
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #409EFF;" />
                  <span>照片：{{ storageInfo.breakdown.photos }} 张</span>
                </div>
              </ElCol>
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #67C23A;" />
                  <span>视频：{{ storageInfo.breakdown.videos }} 个</span>
                </div>
              </ElCol>
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #E6A23C;" />
                  <span>其他：{{ storageInfo.breakdown.others }} 个</span>
                </div>
              </ElCol>
            </ElRow>
          </div>
        </div>
      </div>

      <ElAlert
        type="info"
        show-icon
        style="margin-top: 20px;"
        :closable="false"
      >
        <template #title>扩容流程说明</template>
        <p>
          平台当前仅支持「人工审核扩容」流。提交申请后，平台管理员会评估您的家族规模、活跃度与历史用量，
          通过审核才会真正调整本家族存储上限。期间存储仍以当前配额为准，不会立刻生效。
        </p>
        <ElButton
          type="primary"
          style="margin-top: 12px;"
          :disabled="!!pendingRequest"
          @click="openApplyDialog"
        >
          提交扩容申请
        </ElButton>
        <span v-if="pendingRequest" class="pending-hint">
          您当前有 1 份待审核申请（提交于 {{ formatDate(pendingRequest.created_at) }}）
        </span>
      </ElAlert>

      <!-- 申请记录 -->
      <div v-if="requests.length > 0" class="request-history">
        <h3>申请记录</h3>
        <ElTable :data="requests" border size="small" max-height="320">
          <ElTableColumn prop="plan_name" label="申请套餐" min-width="160" />
          <ElTableColumn label="当前 / 目标容量" width="180">
            <template #default="{ row }">
              {{ formatGB(Number(row.current_quota_bytes)) }} GB
              →
              {{ formatGB(Number(row.quota_bytes)) }} GB
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="100">
            <template #default="{ row }">
              <ElTag :type="statusTagType(row.status)" size="small">
                {{ statusLabel(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="reason" label="原因" min-width="220" show-overflow-tooltip />
          <ElTableColumn label="提交时间" width="170">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="审核信息" min-width="200">
            <template #default="{ row }">
              <template v-if="row.reviewed_at">
                <div>审核人：{{ row.reviewer_id || '—' }}</div>
                <div>审核时间：{{ formatDate(row.reviewed_at) }}</div>
                <div v-if="row.reviewer_note">备注：{{ row.reviewer_note }}</div>
              </template>
              <span v-else>—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <ElButton
                v-if="row.status === 'PENDING'"
                size="small"
                type="danger"
                plain
                @click="cancelRequest(row)"
              >
                撤销
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <!-- 最近一次已决申请提示 -->
      <ElAlert
        v-if="latestDecidedRequest"
        :type="
          latestDecidedRequest.status === 'APPROVED' ? 'success' : 'warning'
        "
        style="margin-top: 16px;"
        :closable="false"
        show-icon
      >
        <template #title>
          最近一次审核结果：{{ statusLabel(latestDecidedRequest.status) }}
        </template>
        <div>
          套餐：{{ latestDecidedRequest.plan_name }}；提交于
          {{ formatDate(latestDecidedRequest.created_at) }}；审核于
          {{ formatDate(latestDecidedRequest.reviewed_at) }}。
        </div>
        <div v-if="latestDecidedRequest.reviewer_note">
          审核备注：{{ latestDecidedRequest.reviewer_note }}
        </div>
      </ElAlert>
    </ElCard>

    <!-- 申请扩容对话框 -->
    <ElDialog
      v-model="applyDialogVisible"
      title="提交扩容申请"
      width="520px"
      :close-on-click-modal="false"
    >
      <ElForm
        :model="applyForm"
        :rules="applyRules as any"
        ref="applyFormRef"
        label-width="100px"
      >
        <ElFormItem label="目标套餐" prop="plan_code">
          <ElSelect
            v-model="applyForm.plan_code"
            placeholder="请选择扩容套餐"
            style="width: 100%;"
          >
            <ElOption
              v-for="p in plans"
              :key="p.code"
              :label="`${p.name}（¥${p.price}）`"
              :value="p.code"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="申请原因" prop="reason">
          <ElInput
            v-model="applyForm.reason"
            type="textarea"
            :rows="4"
            placeholder="例如：家族已收录 3000+ 张照片与多段视频，需要更多空间保存近期祭祖、寿诞影像"
            maxlength="500"
            show-word-limit
          />
        </ElFormItem>
        <ElFormItem label="联系方式" prop="contact_info">
          <ElInput
            v-model="applyForm.contact_info"
            placeholder="便于审核员与您沟通（手机/微信/邮箱，可选）"
            maxlength="200"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="applyDialogVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :loading="applySubmitting"
          @click="submitApply"
        >
          提交申请
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.storage-page {
  max-width: 1000px;
  margin: 0 auto;
}

.storage-content {
  display: flex;
  gap: 40px;
  align-items: center;
}

.usage-chart {
  flex-shrink: 0;
}

.progress-label {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.progress-desc {
  font-size: 14px;
  color: #909399;
}

.storage-details {
  flex: 1;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breakdown-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.pending-hint {
  margin-left: 16px;
  color: #909399;
  font-size: 13px;
}

.request-history {
  margin-top: 24px;
}
.request-history h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
}
</style>
