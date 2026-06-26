<script setup lang="ts">
/**
 * PersonEditDrawer —— 人物侧栏编辑抽屉
 *
 * P1 任务：填补"画布节点点击后只能预览、无法编辑"的短板。
 *
 * 功能范围：
 * - 顶部：基本信息卡（头像 / 姓名 / 性别 / 生死）
 * - 中部：关系区（父母 / 配偶 / 子女，可点击跳转）
 * - 底部：基础信息编辑表单（姓名/性别/出生/死亡日期）
 * - 操作：保存（PUT → /api/tree/person/:id）/ 取消
 *
 * 血缘校验与新建婚姻不在此抽屉内（见 AddMarriageDialog，独立组件，
 * 创建时可联动此抽屉选择的两个人物）。
 *
 * 设计原则：
 * 1. 数据懒加载：抽屉打开时调 getPersonDetail，不打开不请求
 * 2. 取消时还原 dirty state，避免半保存
 * 3. 保存后通知父组件更新选中节点（emit 'updated'）
 */
import { ref, watch, computed, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Male, Female, Edit, Refresh, User, Delete } from '@element-plus/icons-vue';
import { treeApi } from '@/api/tree';
import type { PersonDetail, GenealogyNode } from '@/types';
import {
  updatePersonWithUndo,
  deletePersonWithUndo,
  deleteMarriageWithUndo,
} from '@/composables/useUndoableTree';

const props = defineProps<{
  /** 选中的 person id（来自画布点击） */
  personId: string | number | null;
  /** 选中的 person 基本信息（用于立即展示，不必等详情接口） */
  person?: GenealogyNode | null;
  /** 是否可以编辑（管理员/族谱 owner 才显示保存按钮） */
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', person: GenealogyNode): void;
  (e: 'navigate', personId: string | number): void;
  (e: 'create-marriage', withPersonId: string | number): void;
  /** 顶层数据发生变化（删除人物 / 卸载婚姻），通知父组件 reload */
  (e: 'mutated'): void;
}>();

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const detail = ref<PersonDetail | null>(null);

// 表单状态（与 detail.person 分离，便于 dirty 检测）
const form = reactive({
  full_name: '',
  gender: 'male' as 'male' | 'female',
  birth_date: '' as string,
  death_date: '' as string,
  is_living: true,
});

const originalSnapshot = ref('');

const isDirty = computed(() => JSON.stringify(form) !== originalSnapshot.value);

async function loadDetail() {
  if (!props.personId) return;
  loading.value = true;
  try {
    const resp: any = await treeApi.getPersonDetail(String(props.personId));
    detail.value = resp?.data || resp;
    syncForm(detail.value!.person);
  } catch (e: any) {
    ElMessage.error(`加载人物详情失败：${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}

function syncForm(p: GenealogyNode) {
  form.full_name = p.full_name || '';
  form.gender = (p.gender as 'male' | 'female') || 'male';
  form.birth_date = p.birth_date ? String(p.birth_date).substring(0, 10) : '';
  form.death_date = p.death_date ? String(p.death_date).substring(0, 10) : '';
  form.is_living = !!p.is_living;
  originalSnapshot.value = JSON.stringify(form);
}

watch(
  () => props.personId,
  (id) => {
    if (id) loadDetail();
    else detail.value = null;
  },
  { immediate: true },
);

watch(
  () => props.person,
  (p) => {
    if (p && (!detail.value || String(detail.value.person.id) !== String(p.id))) {
      syncForm(p);
    }
  },
);

async function handleSave() {
  if (!props.personId) return;
  if (!form.full_name.trim()) {
    ElMessage.warning('姓名不能为空');
    return;
  }
  saving.value = true;
  try {
    const updates: any = {
      full_name: form.full_name.trim(),
      gender: form.gender,
      birth_date: form.birth_date || null,
      death_date: form.death_date || null,
      is_living: form.is_living,
    };
    // 用可撤销封装：自动加入撤销栈，用户可 Ctrl+Z 撤销
    await updatePersonWithUndo({
      personId: String(props.personId),
      updates,
      currentValues: {
        full_name: detail.value!.person.full_name,
        gender: detail.value!.person.gender as any,
        birth_date: detail.value!.person.birth_date ?? null,
        death_date: detail.value!.person.death_date ?? null,
        is_living: detail.value!.person.is_living,
      },
    });
    originalSnapshot.value = JSON.stringify(form);
    // 重新拉详情，保证父母/配偶/子女列表与最新 person 同步
    await loadDetail();
    emit('updated', detail.value!.person);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || String(e);
    ElMessage.error(`保存失败：${msg}`);
  } finally {
    saving.value = false;
  }
}

function handleCancel() {
  if (!detail.value) {
    emit('close');
    return;
  }
  if (isDirty.value) {
    ElMessageBox.confirm('有未保存的修改，确定放弃？', '提示', {
      type: 'warning',
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑',
    })
      .then(() => {
        syncForm(detail.value!.person);
      })
      .catch(() => {
        /* user chose keep editing */
      });
  } else {
    emit('close');
  }
}

function navigate(personId: string | number) {
  emit('navigate', personId);
}

function createMarriageWith() {
  if (!props.personId) return;
  emit('create-marriage', props.personId);
}

/**
 * 删除人物（软删除，可通过撤销栈反向恢复）
 * - 二步确认（输入姓名匹配以防误删）
 * - 防双击：删除期间按钮 disabled，避免重复触发 onUndo 栈
 */
async function handleDeletePerson() {
  if (!props.personId || !detail.value) return;
  if (deleting.value) return;
  const targetName = detail.value.person.full_name || '';
  let confirmValue = '';
  try {
    await ElMessageBox.prompt(
      `此操作将软删除「${targetName}」，可在 5 秒内点撤销恢复。\n\n请输入人物姓名以确认：`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        inputPattern: /^[\s\S]*$/, // 不限制（用自定义校验）
        inputValue: '',
        inputPlaceholder: targetName,
        inputValidator: (val: string) => (val.trim() === targetName ? true : '姓名不匹配'),
        customClass: 'delete-confirm-box',
      },
    ).then(({ value }) => {
      confirmValue = value;
    }).catch(() => {
      /* user cancelled */
    });
  } catch {
    return;
  }
  if (confirmValue.trim() !== targetName) return;

  deleting.value = true;
  try {
    await deletePersonWithUndo({
      personId: String(props.personId),
      displayName: targetName,
      reload: async () => {
        emit('mutated');
      },
    });
    // 主动通知父组件刷新画布
    emit('mutated');
    // 关闭抽屉（被删除的人不能再编辑）
    emit('close');
  } catch (e: any) {
    // 错误已由 withUndo 报 ElMessage.error，此处不再重复
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PersonEditDrawer] delete failed', e);
    }
  } finally {
    deleting.value = false;
  }
}

/**
 * 删除某段婚姻（family_id 来自 spouse 列表项）
 * - 可选传递 recreatePayload 以便撤销时自动重建（未提供则需用户手动重建）
 */
async function handleDeleteMarriage(familyId: string | number, displayName: string) {
  // 从 detail.spouses 反查 payload 中需要的字段
  const item = detail.value?.spouses.find((s) => String(s.family_id) === String(familyId));
  let recreatePayload: Parameters<typeof treeApi.createMarriage>[0] | undefined;
  if (item && detail.value) {
    const personGender = detail.value.person.gender;
    const clanId = String((detail.value.person as any).clan_id ?? '');
    // 只传递与 enum 兼容的值，避免类型断言；优先当前人物的性别
    let husbandId: string;
    let wifeId: string;
    if (personGender === 'male') {
      husbandId = String(detail.value.person.id);
      wifeId = String(item.id);
    } else {
      husbandId = String(item.id);
      wifeId = String(detail.value.person.id);
    }
    const endReason = item.end_reason === 'divorce' || item.end_reason === 'widowed'
      ? item.end_reason
      : undefined;
    recreatePayload = {
      clan_id: clanId,
      husband_id: husbandId,
      wife_id: wifeId,
      marriage_date: item.marriage_date ?? undefined,
      end_date: item.end_date ?? undefined,
      end_reason: endReason,
      is_current: item.is_current,
      note: item.note ?? undefined,
    };
  }

  try {
    await ElMessageBox.confirm(
      `确认删除与「${displayName}」的婚姻记录？5 秒内可点撤销。`,
      '删除婚姻',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  try {
    await deleteMarriageWithUndo({
      familyId: String(familyId),
      displayName,
      recreatePayload,
      reload: async () => {
        await loadDetail();
        emit('mutated');
      },
    });
    await loadDetail();
    emit('mutated');
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PersonEditDrawer] delete marriage failed', e);
    }
  }
}
</script>

<template>
  <el-drawer
    :model-value="!!personId"
    direction="rtl"
    size="420px"
    :with-header="false"
    :destroy-on-close="false"
    @close="emit('close')"
    class="person-edit-drawer"
  >
    <div v-if="loading && !detail" class="loading-state">
      <el-icon class="rotating"><Refresh /></el-icon>
      <span>加载中…</span>
    </div>

    <template v-else-if="detail">
      <!-- 顶部人物信息卡 -->
      <div class="header-card">
        <div class="avatar" :class="form.gender">
          <el-icon v-if="form.gender === 'male'"><Male /></el-icon>
          <el-icon v-else><Female /></el-icon>
        </div>
        <div class="info">
          <div class="name">
            {{ form.full_name || '（未命名）' }}
            <el-tag v-if="!form.is_living" type="info" size="small" effect="plain" class="ml-2">已故</el-tag>
          </div>
          <div class="meta">
            {{ form.gender === 'male' ? '男' : '女' }}
            <template v-if="form.birth_date"> · {{ form.birth_date }}</template>
            <template v-if="form.death_date"> - {{ form.death_date }}</template>
          </div>
        </div>
      </div>

      <el-divider />

      <!-- 关系区 -->
      <section class="relation-section">
        <h4 class="section-title">
          <el-icon><User /></el-icon>
          父母
          <el-tag size="small" type="info">{{ detail.parents.length }}</el-tag>
        </h4>
        <div v-if="detail.parents.length === 0" class="empty-hint">无记录</div>
        <ul v-else class="relation-list">
          <li
            v-for="p in detail.parents"
            :key="p.id"
            class="relation-item"
            @click="navigate(p.id)"
          >
            <span class="dot" :class="p.gender" />
            <span class="name">{{ p.full_name }}</span>
            <span class="arrow">›</span>
          </li>
        </ul>

        <h4 class="section-title">
          <el-icon><User /></el-icon>
          配偶 / 婚姻
          <el-tag size="small" type="info">{{ detail.spouses.length }}</el-tag>
          <el-button
            v-if="canEdit && detail.spouses.length <= 2"
            link
            type="primary"
            size="small"
            class="ml-auto"
            @click="createMarriageWith"
          >+ 添加</el-button>
        </h4>
        <div v-if="detail.spouses.length === 0" class="empty-hint">无配偶记录</div>
        <ul v-else class="relation-list">
          <li
            v-for="s in detail.spouses"
            :key="s.family_id"
            class="relation-item"
          >
            <span class="dot" :class="s.gender" @click="navigate(s.id)" />
            <span class="name" @click="navigate(s.id)">{{ s.name }}</span>
            <el-tag
              v-if="s.marriage_order > 1"
              size="small"
              effect="plain"
              type="warning"
            >{{ s.marriage_order }}婚</el-tag>
            <el-tag
              v-if="!s.is_current"
              size="small"
              effect="plain"
              type="info"
            >{{ s.end_reason === 'divorce' ? '离异' : '故' }}</el-tag>
            <span class="arrow" @click="navigate(s.id)">›</span>
            <el-button
              v-if="canEdit"
              link
              type="danger"
              size="small"
              class="ml-2"
              @click.stop="handleDeleteMarriage(s.family_id, s.name)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </li>
        </ul>

        <h4 class="section-title">
          <el-icon><User /></el-icon>
          子女
          <el-tag size="small" type="info">{{ detail.children.length }}</el-tag>
        </h4>
        <div v-if="detail.children.length === 0" class="empty-hint">无子女记录</div>
        <ul v-else class="relation-list">
          <li
            v-for="c in detail.children"
            :key="c.id"
            class="relation-item"
            @click="navigate(c.id)"
          >
            <span class="dot" :class="c.gender" />
            <span class="name">{{ c.full_name }}</span>
            <span v-if="c.birth_year" class="meta">{{ c.birth_year }}</span>
            <span class="arrow">›</span>
          </li>
        </ul>
      </section>

      <el-divider />

      <!-- 编辑表单 -->
      <section v-if="canEdit" class="form-section">
        <h4 class="section-title">
          <el-icon><Edit /></el-icon>
          编辑基础信息
        </h4>
        <el-form label-position="top" size="default">
          <el-form-item label="姓名" required>
            <el-input v-model="form.full_name" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="性别">
            <el-radio-group v-model="form.gender">
              <el-radio-button value="male">男</el-radio-button>
              <el-radio-button value="female">女</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="出生日期">
            <el-date-picker
              v-model="form.birth_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="form.is_living">仍在世</el-checkbox>
          </el-form-item>
          <el-form-item v-if="!form.is_living" label="去世日期">
            <el-date-picker
              v-model="form.death_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>

        <div class="action-bar">
          <el-button
            type="danger"
            plain
            :loading="deleting"
            :disabled="deleting"
            @click="handleDeletePerson"
          >
            <el-icon><Delete /></el-icon>
            删除人物
          </el-button>
          <div class="action-bar__spacer" />
          <el-button @click="handleCancel">取消</el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!isDirty"
            @click="handleSave"
          >保存</el-button>
        </div>
      </section>

      <div v-else class="readonly-tip">
        <el-icon><User /></el-icon>
        当前为只读模式，登录后或族谱管理员可编辑
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.person-edit-drawer :deep(.el-drawer__body) {
  padding: 20px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: #909399;
}

.loading-state .rotating {
  animation: rotate 1.2s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.header-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 4px;
}

.header-card .avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
  flex-shrink: 0;
}

.header-card .avatar.male {
  background: linear-gradient(135deg, #5C9DE0, #1976D2);
}

.header-card .avatar.female {
  background: linear-gradient(135deg, #F48FB1, #C2185B);
}

.header-card .info .name {
  font-size: 18px;
  font-weight: 600;
  color: #2C3E50;
  display: flex;
  align-items: center;
}

.header-card .info .meta {
  font-size: 13px;
  color: #7F8C8D;
  margin-top: 4px;
}

.ml-2 { margin-left: 8px; }
.ml-auto { margin-left: auto; }

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #5D4037;
  margin: 16px 0 8px;
}

.section-title .el-icon {
  font-size: 14px;
  color: #C9A96E;
}

.empty-hint {
  font-size: 12px;
  color: #B0BEC5;
  padding: 4px 0 8px;
}

.relation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.relation-item:hover {
  background: #F5F0E8;
}

.relation-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.relation-item .dot.male {
  background: #1976D2;
}

.relation-item .dot.female {
  background: #C2185B;
}

.relation-item .name {
  flex: 1;
  font-size: 14px;
  color: #2C3E50;
}

.relation-item .meta {
  font-size: 12px;
  color: #909399;
}

.relation-item .arrow {
  color: #B0BEC5;
  font-size: 16px;
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.action-bar__spacer {
  flex: 1;
}

.readonly-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  background: #FFF8E7;
  border: 1px solid #FFE0B2;
  border-radius: 6px;
  font-size: 13px;
  color: #8D6E63;
  margin-top: 16px;
}
</style>