<template>
  <div class="clans-page">
    <div class="page-header">
      <h2 class="page-title">家族管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        创建家族
      </el-button>
    </div>

    <!-- Loading State -->
    <div v-if="clanStore.loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <!-- Empty State -->
    <div v-else-if="clanStore.clans.length === 0" class="empty-state">
      <el-empty description="暂无家族，点击右上角创建您的第一个家族">
        <el-button type="primary" @click="showCreateDialog = true">
          创建家族
        </el-button>
      </el-empty>
    </div>

    <!-- Clan List -->
    <div v-else class="clan-grid">
      <el-card
        v-for="clan in clanStore.clans"
        :key="clan.id"
        class="clan-card"
        shadow="hover"
        @click="goToClanDetail(clan.id)"
      >
        <div class="clan-card-header">
          <h3 class="clan-name">{{ clan.name }}</h3>
          <el-tag size="small" type="info">
            {{ clan._count?.persons || 0 }} 人
          </el-tag>
        </div>

        <p v-if="clan.description" class="clan-description">
          {{ clan.description }}
        </p>

        <div class="clan-card-footer">
          <span class="create-time">
            创建于 {{ formatDate(clan.created_at) }}
          </span>
          <div class="card-actions">
            <el-button
              type="primary"
              size="small"
              @click.stop="editClan(clan)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              @click.stop="confirmDelete(clan)"
            >
              删除
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="isEditing ? '编辑家族' : '创建家族'"
      width="500px"
      @close="resetForm"
    >
      <el-form
        ref="clanFormRef"
        :model="clanForm"
        :rules="formRules"
        label-width="80px"
      >
        <el-form-item label="家族名" prop="name">
          <el-input
            v-model="clanForm.name"
            placeholder="请输入家族名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="描述" prop="description">
          <el-input
            v-model="clanForm.description"
            type="textarea"
            placeholder="请输入家族描述（可选）"
            :rows="4"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEditing ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useClanStore } from '@/stores/clan';
import type { Clan, CreateClanDto, UpdateClanDto } from '@/types';

const router = useRouter();
const clanStore = useClanStore();

// Form state
const showCreateDialog = ref(false);
const isEditing = ref(false);
const submitting = ref(false);
const clanFormRef = ref();
const editingClanId = ref<string | null>(null);

const clanForm = ref<CreateClanDto>({
  name: '',
  description: '',
});

const formRules = {
  name: [
    { required: true, message: '请输入家族名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' },
  ],
};

// Fetch clans on mount
onMounted(async () => {
  try {
    await clanStore.fetchClans();
  } catch (error) {
    ElMessage.error('获取家族列表失败');
  }
});

// Methods
function goToClanDetail(clanId: number) {
  router.push(`/clans/${clanId}`);
}

function editClan(clan: Clan) {
  isEditing.value = true;
  editingClanId.value = String(clan.id);
  clanForm.value = {
    name: clan.name,
    description: clan.description || '',
  };
  showCreateDialog.value = true;
}

async function confirmDelete(clan: Clan) {
  try {
    await ElMessageBox.confirm(
      `确定要删除家族"${clan.name}"吗？此操作不可恢复！`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );

    await clanStore.deleteClan(String(clan.id));
    ElMessage.success('家族已删除');
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

async function handleSubmit() {
  if (!clanFormRef.value) return;

  try {
    await clanFormRef.value.validate();
  } catch {
    return;
  }

  submitting.value = true;

  try {
    if (isEditing.value && editingClanId.value) {
      await clanStore.updateClan(editingClanId.value, clanForm.value);
      ElMessage.success('家族已更新');
    } else {
      await clanStore.createClan(clanForm.value);
      ElMessage.success('家族已创建');
    }

    showCreateDialog.value = false;
    resetForm();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  isEditing.value = false;
  editingClanId.value = null;
  clanForm.value = {
    name: '',
    description: '',
  };
  if (clanFormRef.value) {
    clanFormRef.value.resetFields();
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN');
}
</script>

<style scoped>
.clans-page {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #5D4037;
  margin: 0;
}

.loading-container {
  padding: 24px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.clan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.clan-card {
  cursor: pointer;
  transition: transform 0.3s ease;
}

.clan-card:hover {
  transform: translateY(-4px);
}

.clan-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.clan-name {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  margin: 0;
}

.clan-description {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clan-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #EBEEF5;
}

.create-time {
  font-size: 12px;
  color: #999;
}

.card-actions {
  display: flex;
  gap: 8px;
}
</style>
