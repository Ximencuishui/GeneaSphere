<template>
  <div class="migration-events-page">
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><Location /></el-icon>
        迁徙事件管理
      </h2>
      <div class="page-actions">
        <el-select
          v-model="selectedClanId"
          placeholder="选择家族"
          filterable
          style="width: 240px"
          @change="onClanChange"
        >
          <el-option
            v-for="clan in myClans"
            :key="clan.id"
            :label="clan.name"
            :value="clan.id"
          />
        </el-select>
        <el-button type="primary" :disabled="!selectedClanId" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建迁徙事件
        </el-button>
        <el-button :disabled="!selectedClanId" @click="showMissingDialog = true">
          <el-icon><Warning /></el-icon>
          补全经纬度 ({{ missingLocations.length }})
        </el-button>
      </div>
    </div>

    <div v-if="selectedClanId" class="content-body">
      <!-- 统计卡片 -->
      <div class="stat-cards">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ events.length }}</div>
          <div class="stat-label">迁徙事件</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ uniqueLocations }}</div>
          <div class="stat-label">涉及地点</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ yearSpan }}</div>
          <div class="stat-label">跨越年份</div>
        </el-card>
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ missingLocations.length }}</div>
          <div class="stat-label">待补经纬度</div>
        </el-card>
      </div>

      <!-- 迁徙事件表格 -->
      <el-card class="events-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">迁徙事件列表</span>
            <span class="card-subtitle">按时间顺序排列</span>
          </div>
        </template>

        <el-table :data="events" stripe v-loading="loading">
          <el-table-column label="年份" prop="event_year" width="100" sortable />
          <el-table-column label="迁出地" min-width="160">
            <template #default="{ row }">
              <div class="location-cell">
                <span>{{ row.from_location }}</span>
                <el-tag
                  v-if="row.from_lat == null || row.from_lng == null"
                  size="small"
                  type="warning"
                  effect="plain"
                >无经纬度</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="" width="40" align="center">
            <template #default>
              <el-icon><Right /></el-icon>
            </template>
          </el-table-column>
          <el-table-column label="迁入地" min-width="160">
            <template #default="{ row }">
              <div class="location-cell">
                <span>{{ row.to_location }}</span>
                <el-tag
                  v-if="row.to_lat == null || row.to_lng == null"
                  size="small"
                  type="warning"
                  effect="plain"
                >无经纬度</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="关联人物" min-width="120">
            <template #default="{ row }">
              <span v-if="row.person">{{ row.person.full_name }}</span>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="支系" min-width="100">
            <template #default="{ row }">
              <el-tag v-if="row.branch" size="small">{{ row.branch }}</el-tag>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="90">
            <template #default="{ row }">
              <span v-if="row.reason">{{ reasonLabel(row.reason) }}</span>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="openEditDialog(row)">
                编辑
              </el-button>
              <el-button text type="danger" size="small" @click="confirmDelete(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-empty v-else description="请先选择一个家族" class="empty-state" />

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑迁徙事件' : '新建迁徙事件'"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="迁徙年份" prop="event_year">
          <el-input-number v-model="form.event_year" :min="-3000" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="迁出地" prop="from_location">
          <el-input v-model="form.from_location" placeholder="如：山西洪洞" />
        </el-form-item>
        <el-form-item label="迁出地经纬度">
          <el-col :span="11">
            <el-input-number v-model="form.from_lat" :precision="6" :step="0.0001" placeholder="纬度" style="width: 100%" />
          </el-col>
          <el-col :span="2" style="text-align: center;">·</el-col>
          <el-col :span="11">
            <el-input-number v-model="form.from_lng" :precision="6" :step="0.0001" placeholder="经度" style="width: 100%" />
          </el-col>
        </el-form-item>
        <el-form-item label="迁入地" prop="to_location">
          <el-input v-model="form.to_location" placeholder="如：四川成都" />
        </el-form-item>
        <el-form-item label="迁入地经纬度">
          <el-col :span="11">
            <el-input-number v-model="form.to_lat" :precision="6" :step="0.0001" placeholder="纬度" style="width: 100%" />
          </el-col>
          <el-col :span="2" style="text-align: center;">·</el-col>
          <el-col :span="11">
            <el-input-number v-model="form.to_lng" :precision="6" :step="0.0001" placeholder="经度" style="width: 100%" />
          </el-col>
        </el-form-item>
        <el-form-item label="关联人物">
          <el-select v-model="form.person_id" placeholder="可选" filterable clearable>
            <el-option
              v-for="p in persons"
              :key="p.id"
              :label="p.full_name"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="支系标签">
          <el-input v-model="form.branch" placeholder="如：长房、二房" />
        </el-form-item>
        <el-form-item label="迁徙原因">
          <el-select v-model="form.reason" placeholder="可选" clearable>
            <el-option label="战乱" value="WAR" />
            <el-option label="经商" value="BUSINESS" />
            <el-option label="仕宦" value="OFFICIAL" />
            <el-option label="垦荒" value="RECLAMATION" />
            <el-option label="灾荒" value="FAMINE" />
            <el-option label="其他" value="OTHER" />
          </el-select>
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 补全经纬度对话框 -->
    <el-dialog
      v-model="showMissingDialog"
      title="补全地点经纬度"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        title="以下地点缺失经纬度信息，会导致地图上无法定位。请用本地字典查询或地图软件获取。"
        show-icon
      />
      <el-table :data="missingLocations" max-height="380" style="margin-top: 12px">
        <el-table-column label="地点名称" prop="name" />
        <el-table-column label="族人数量" prop="person_count" width="100" />
        <el-table-column label="纬度" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.lat" :precision="6" :step="0.0001" placeholder="纬度" size="small" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="经度" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.lng" :precision="6" :step="0.0001" placeholder="经度" size="small" style="width: 100%" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showMissingDialog = false">关闭</el-button>
        <el-button type="primary" @click="batchFillCoords" :loading="fillingCoords">
          批量保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Location, Plus, Warning, Right } from '@element-plus/icons-vue';
import { useClanStore } from '@/stores/clan';
import { migrationApi } from '@/api/migration';
import type { MigrationEvent, CreateMigrationEventDto, Branch } from '@/types';

const clanStore = useClanStore();

const myClans = computed(() => {
  const list = clanStore.clans || [];
  return list.map((c: any) => ({ id: c.id.toString(), name: c.name }));
});

const selectedClanId = ref<string>('');
const events = ref<MigrationEvent[]>([]);
const branches = ref<Branch[]>([]);
const persons = ref<Array<{ id: string; full_name: string }>>([]);
const missingLocations = ref<
  Array<{ name: string; lat: number | null; lng: number | null; person_count: number }>
>([]);
const loading = ref(false);
const submitting = ref(false);
const fillingCoords = ref(false);

const uniqueLocations = computed(() => {
  const set = new Set<string>();
  for (const e of events.value) {
    set.add(e.from_location);
    set.add(e.to_location);
  }
  return set.size;
});

const yearSpan = computed(() => {
  if (events.value.length === 0) return 0;
  const ys = events.value.map((e) => e.event_year);
  return Math.max(...ys) - Math.min(...ys);
});

const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance | null>(null);
const form = ref<CreateMigrationEventDto>({
  from_location: '',
  to_location: '',
  event_year: new Date().getFullYear(),
});

const rules: FormRules = {
  event_year: [{ required: true, message: '请输入迁徙年份', trigger: 'blur' }],
  from_location: [{ required: true, message: '请输入迁出地', trigger: 'blur' }],
  to_location: [{ required: true, message: '请输入迁入地', trigger: 'blur' }],
};

const showMissingDialog = ref(false);

onMounted(async () => {
  await clanStore.fetchClans();
});

watch(selectedClanId, async (id) => {
  if (!id) return;
  await loadEvents(id);
  await loadBranches(id);
  await loadMissingLocations(id);
  // 简化：这里只取前 50 个人物作为关联候选
  persons.value = Array.from({ length: 50 }, (_, i) => ({
    id: (i + 1).toString(),
    full_name: `示例人物 ${i + 1}`,
  }));
});

async function loadEvents(clanId: string) {
  loading.value = true;
  try {
    events.value = await migrationApi.getEvents(clanId);
  } catch (e: any) {
    ElMessage.error('加载迁徙事件失败：' + (e?.message || ''));
  } finally {
    loading.value = false;
  }
}

async function loadBranches(clanId: string) {
  try {
    branches.value = await migrationApi.getBranches(clanId);
  } catch (e) {
    branches.value = [];
  }
}

async function loadMissingLocations(clanId: string) {
  try {
    const list = await migrationApi.getMissingCoords(clanId);
    missingLocations.value = list.map((x) => ({
      name: x.name,
      lat: x.lat,
      lng: x.lng,
      person_count: x.person_count,
    }));
  } catch (e) {
    missingLocations.value = [];
  }
}

function onClanChange(id: string) {
  selectedClanId.value = id;
}

function openCreateDialog() {
  editingId.value = null;
  form.value = {
    from_location: '',
    to_location: '',
    event_year: new Date().getFullYear(),
  };
  dialogVisible.value = true;
}

function openEditDialog(row: MigrationEvent) {
  editingId.value = row.id;
  form.value = {
    person_id: row.person_id || undefined,
    branch: row.branch || undefined,
    from_location: row.from_location,
    from_lat: row.from_lat ?? undefined,
    from_lng: row.from_lng ?? undefined,
    to_location: row.to_location,
    to_lat: row.to_lat ?? undefined,
    to_lng: row.to_lng ?? undefined,
    event_year: row.event_year,
    reason: row.reason || undefined,
    description: row.description || undefined,
  };
  dialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      if (editingId.value) {
        await migrationApi.updateEvent(selectedClanId.value, editingId.value, form.value);
        ElMessage.success('已更新');
      } else {
        await migrationApi.createEvent(selectedClanId.value, form.value);
        ElMessage.success('已创建');
      }
      dialogVisible.value = false;
      await loadEvents(selectedClanId.value);
      await loadMissingLocations(selectedClanId.value);
    } catch (e: any) {
      ElMessage.error('保存失败：' + (e?.message || ''));
    } finally {
      submitting.value = false;
    }
  });
}

async function confirmDelete(row: MigrationEvent) {
  await ElMessageBox.confirm(
    `确定要删除「${row.from_location} → ${row.to_location}（${row.event_year}）」吗？`,
    '删除确认',
    { type: 'warning' },
  );
  try {
    await migrationApi.deleteEvent(selectedClanId.value, row.id);
    ElMessage.success('已删除');
    await loadEvents(selectedClanId.value);
    await loadMissingLocations(selectedClanId.value);
  } catch (e: any) {
    if (e === 'cancel') return;
    ElMessage.error('删除失败：' + (e?.message || ''));
  }
}

async function batchFillCoords() {
  if (!selectedClanId.value) return;
  const toFill = missingLocations.value.filter(
    (loc) => typeof loc.lat === 'number' && typeof loc.lng === 'number' && (loc.lat !== null && loc.lng !== null),
  );
  if (toFill.length === 0) {
    ElMessage.warning('请先填写有效的经纬度');
    return;
  }
  fillingCoords.value = true;
  try {
    for (const loc of toFill) {
      await migrationApi.fillCoords(selectedClanId.value, {
        location_name: loc.name,
        lat: loc.lat as number,
        lng: loc.lng as number,
      });
    }
    ElMessage.success(`已补全 ${toFill.length} 个地点的经纬度`);
    showMissingDialog.value = false;
    await loadMissingLocations(selectedClanId.value);
  } catch (e: any) {
    ElMessage.error('批量补全失败：' + (e?.message || ''));
  } finally {
    fillingCoords.value = false;
  }
}

function reasonLabel(r: string): string {
  return (
    {
      WAR: '战乱',
      BUSINESS: '经商',
      OFFICIAL: '仕宦',
      RECLAMATION: '垦荒',
      FAMINE: '灾荒',
      OTHER: '其他',
    }[r] || r
  );
}
</script>

<style scoped>
.migration-events-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 600;
  color: #2d3748;
  margin: 0;
}

.page-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  text-align: center;
  padding: 16px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #5D4037;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: #718096;
}

.events-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
}

.card-subtitle {
  font-size: 12px;
  color: #718096;
}

.location-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-muted {
  color: #a0aec0;
}

.empty-state {
  margin-top: 80px;
}
</style>
