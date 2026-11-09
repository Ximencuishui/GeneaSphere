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
import { ref, watch, computed, reactive, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Male, Female, Edit, Check, Close, Camera, Refresh, User, Delete } from '@element-plus/icons-vue';
import { treeApi } from '@/api/tree';
import { mediaApi } from '@/api/media';
import { useAuthStore } from '@/stores/auth';
import type { PersonDetail, GenealogyNode, SpouseInfo, PersonKin } from '@/types';
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
  /** 从「编辑信息」入口打开时直接进入表单。画布点卡片不传，保持详情。 */
  startInEdit?: boolean;
  /** 每次点中卡片都会变。用来把已经打开的编辑态拉回详情。 */
  detailEpoch?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', person: GenealogyNode): void;
  (e: 'navigate', personId: string | number): void;
  (e: 'create-marriage', withPersonId: string | number): void;
  /** 顶层数据发生变化（删除人物 / 卸载婚姻），通知父组件 reload */
  (e: 'mutated'): void;
  /** 已创建子女并绑定亲子关系。带上新节点，父组件挂到当前树再重画。 */
  (e: 'child-added', child: {
    id: string;
    full_name: string;
    gender: 'male' | 'female';
    child_type: 'BIOLOGICAL' | 'ADOPTED' | 'STEP' | 'FOSTER' | 'ADOPTED_OUT';
  }): void;
  /** 把当前人物设为亲属聚焦的中心 */
  (e: 'set-center', personId: string | number): void;
}>();

const loading = ref(false);
let loadToken = 0;
const saving = ref(false);
const deleting = ref(false);
const detail = ref<PersonDetail | null>(null);
/** 默认先看详情。点「编辑信息」才进入表单。 */
const isEditing = ref(false);

const viewPerson = computed(() => detail.value?.person ?? props.person ?? null);

function dateText(value?: string | null, year?: number | null) {
  if (value) return String(value).substring(0, 10);
  if (year) return String(year);
  return '';
}

const lifespanText = computed(() => {
  const person = viewPerson.value;
  if (!person) return '不详';
  const birth = dateText(person.birth_date, person.birth_year);
  const death = person.is_living ? '' : dateText(person.death_date, person.death_year);
  if (!birth && !death) return '不详';
  if (person.is_living) return birth ? `${birth} — 在世` : '在世';
  return `${birth || '？'} — ${death || '？'}`;
});

// 表单状态（与 detail.person 分离，便于 dirty 检测）
const form = reactive({
  full_name: '',
  gender: 'male' as 'male' | 'female',
  birth_date: '' as string,
  death_date: '' as string,
  is_living: true,
  birth_place: '',
  death_place: '',
  migration_branch: '',
  premature: false,
  bio: {} as Record<string, string>,
  events: [] as { event_year: string; content: string }[],
  child_types: {} as Record<string, string>,
  unions: {} as Record<string, string>,
});

const originalSnapshot = ref('');

const isDirty = computed(() => JSON.stringify(form) !== originalSnapshot.value);

const profile = computed(() => detail.value?.profile ?? null);

const story = computed(() => {
  const fromDetail = detail.value?.person;
  const fromProp = props.person;
  const pick = <T>(a: T | undefined | null, b: T | undefined | null): T | undefined =>
    a != null && a !== '' ? a : b != null && b !== '' ? b : undefined;
  const mediaPhoto = (detail.value?.media || []).find((item) => {
    if (item.media_type === 'image') return true;
    return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(item.url || '');
  })?.url;
  return {
    photo: pick(fromDetail?.photo_url, fromProp?.photo_url)
      || pick(fromDetail?.avatar_url, fromProp?.avatar_url)
      || pick(fromDetail?.thumbnail_url, fromProp?.thumbnail_url)
      || mediaPhoto,
  };
});

const authStore = useAuthStore();
const route = useRoute();

const addChildVisible = ref(false);
const addChildSubmitting = ref(false);
const addChildForm = reactive({
  full_name: '',
  gender: 'male' as 'male' | 'female',
  child_type: 'BIOLOGICAL' as 'BIOLOGICAL' | 'ADOPTED' | 'STEP' | 'FOSTER' | 'ADOPTED_OUT',
});

function openAddChild() {
  addChildForm.full_name = '';
  addChildForm.gender = 'male';
  addChildForm.child_type = 'BIOLOGICAL';
  addChildVisible.value = true;
}

function resolveClanId(): string {
  const fromDetail = (detail.value?.person as { clan_id?: string | number } | undefined)?.clan_id;
  if (fromDetail != null && fromDetail !== '') return String(fromDetail);
  const fromProp = (props.person as { clan_id?: string | number } | null | undefined)?.clan_id;
  if (fromProp != null && fromProp !== '') return String(fromProp);
  const fromRoute = route.params.clanId;
  if (typeof fromRoute === 'string' && fromRoute) return fromRoute;
  return '';
}

/** 只刷新子女列表，避免 loadDetail 把未保存的编辑表单冲掉。 */
async function refreshChildren() {
  if (!props.personId || !detail.value) return;
  const resp: any = await treeApi.getPersonDetail(String(props.personId));
  const next = resp?.data || resp;
  const children = Array.isArray(next?.children) ? next.children : [];
  detail.value.children = children;
  const prev = originalSnapshot.value ? JSON.parse(originalSnapshot.value) : null;
  const added: Record<string, string> = {};
  for (const child of children) {
    const id = String(child.id);
    if (!form.child_types[id]) {
      const value = child.child_type || 'BIOLOGICAL';
      form.child_types[id] = value;
      added[id] = value;
    }
  }
  if (prev) {
    prev.child_types = { ...(prev.child_types || {}), ...added };
    originalSnapshot.value = JSON.stringify(prev);
  }
}

async function submitAddChild() {
  if (!props.personId || addChildSubmitting.value) return;
  const fullName = addChildForm.full_name.trim();
  if (!fullName) {
    ElMessage.warning('请输入子女姓名');
    return;
  }
  if (fullName.length > 50) {
    ElMessage.warning('姓名长度不超过 50 个字符');
    return;
  }
  const clanId = resolveClanId();
  if (!clanId) {
    ElMessage.error('缺少家族信息，无法添加子女');
    return;
  }
  addChildSubmitting.value = true;
  try {
    const created: any = await treeApi.createPerson({
      clan_id: clanId,
      full_name: fullName,
      gender: addChildForm.gender,
      is_living: true,
      parent_id: String(props.personId),
      child_type: addChildForm.child_type,
    });
    const row = created?.data ?? created;
    const childId = String(row?.id ?? '');
    const childType = addChildForm.child_type;
    addChildVisible.value = false;
    await refreshChildren();
    if (childId) {
      emit('child-added', {
        id: childId,
        full_name: fullName,
        gender: addChildForm.gender,
        child_type: childType,
      });
    }
    ElMessage.success('已添加子女');
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '添加子女失败';
    ElMessage.error(msg);
  } finally {
    addChildSubmitting.value = false;
  }
}
const photoInput = ref<HTMLInputElement | null>(null);
const photoPreview = ref('');
const pendingPhoto = ref<File | null>(null);
const displayPhoto = computed(() => photoPreview.value || story.value.photo || '');

function clearPhotoPreview() {
  if (photoPreview.value.startsWith('blob:')) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = '';
  pendingPhoto.value = null;
}

function onPhotoChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file?.type.startsWith('image/')) return;
  if (photoPreview.value.startsWith('blob:')) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = URL.createObjectURL(file);
  pendingPhoto.value = file;
}

async function persistPendingPhoto() {
  const file = pendingPhoto.value;
  if (!file || !props.personId) return;
  const person = detail.value?.person as (GenealogyNode & { clan_id?: string | number }) | undefined;
  const clanId = person?.clan_id;
  const uploaderId = authStore.user?.sub;
  if (clanId == null || clanId === '' || !uploaderId) {
    throw new Error('缺少家族或登录信息，无法上传头像');
  }
  const uploaded: any = await mediaApi.uploadMedia({
    file,
    clan_id: clanId,
    uploader_id: uploaderId,
    description: '头像',
  });
  const media = uploaded?.data ?? uploaded;
  const fileUrl = media?.display_url || media?.file_url;
  if (!fileUrl || media?.id == null) {
    throw new Error('头像上传未返回地址');
  }
  await mediaApi.linkMediaToPerson(media.id, props.personId);
  if (detail.value?.person) {
    detail.value.person.photo_url = fileUrl;
    detail.value.person.avatar_url = fileUrl;
    if (media.thumb_url) detail.value.person.thumbnail_url = media.thumb_url;
    detail.value.person.has_photo = true;
  }
  clearPhotoPreview();
}

const BIO_KEYS = [
  'courtesy_name', 'native_place', 'burial_place', 'achievements', 'anecdotes',
  'biography', 'marital_notes', 'adoption_note',
  'taboo_name', 'art_name', 'posthumous_name', 'infant_name', 'alias_name',
  'former_name', 'nickname', 'ethnicity', 'education', 'occupation', 'job_title',
  'alma_mater', 'employer', 'lunar_birth', 'lunar_death', 'religion', 'blood_type',
  'epitaph', 'source_note',
] as const;

const CHILD_TYPE_OPTIONS = [
  { value: 'BIOLOGICAL', label: '亲生' },
  { value: 'ADOPTED', label: '收养' },
  { value: 'STEP', label: '继' },
  { value: 'FOSTER', label: '过继' },
  { value: 'ADOPTED_OUT', label: '出继' },
];

const CHILD_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CHILD_TYPE_OPTIONS.map(item => [item.value, item.label]),
);

function dateTimeText(value?: string | null) {
  if (!value) return '';
  const text = String(value);
  if (!text.includes('T')) return text.slice(0, 10);
  const [day, time] = text.split('T');
  const hm = time.slice(0, 5);
  return hm && hm !== '00:00' ? `${day} ${hm}` : day;
}

function kinLabel(person: PersonKin) {
  const parts: string[] = [];
  if (person.birth_order) parts.push(`行${person.birth_order}`);
  if (person.child_type && CHILD_TYPE_LABEL[person.child_type]) {
    parts.push(CHILD_TYPE_LABEL[person.child_type]);
  }
  if (person.premature) parts.push('早夭');
  return parts.join(' · ');
}

function otherNames(facts?: { infant_name?: string | null; alias_name?: string | null; former_name?: string | null; nickname?: string | null } | null) {
  if (!facts) return '';
  const parts = [
    facts.infant_name ? `乳名${facts.infant_name}` : '',
    facts.alias_name ? `别名${facts.alias_name}` : '',
    facts.former_name ? `曾用名${facts.former_name}` : '',
    facts.nickname ? `绰号${facts.nickname}` : '',
  ].filter(Boolean);
  return parts.join('、');
}

function spouseRole(spouse: SpouseInfo) {
  const union = spouse.union_type || '';
  if (union === 'concubine' || union === '侧室') return '侧室';
  if (union === 'uxorilocal' || union === '入赘') return '入赘';
  if (!spouse.is_current) return spouse.end_reason === 'divorce' ? '离异' : '已故';
  return (spouse.marriage_order ?? 1) <= 1 ? '原配' : '继配';
}

function addEvent() {
  form.events.push({ event_year: '', content: '' });
}

function removeEvent(index: number) {
  form.events.splice(index, 1);
}

const showNameGroup = computed(() => {
  const facts = profile.value;
  return !!(
    facts?.courtesy_name
    || facts?.taboo_name
    || facts?.art_name
    || facts?.posthumous_name
    || otherNames(facts)
    || facts?.generation_word
    || facts?.birth_order
    || facts?.generation
    || viewPerson.value?.migration_branch
  );
});

const showLifeGroup = computed(() => {
  const person = viewPerson.value;
  const facts = profile.value;
  return !!(
    person?.birth_date
    || person?.birth_place
    || facts?.native_place
    || (!person?.is_living && person?.death_date)
    || (!person?.is_living && person?.death_place)
    || facts?.age_at_death
    || facts?.burial_place
    || facts?.premature
    || facts?.lunar_birth
    || (person && !person.is_living && facts?.lunar_death)
    || detail.value?.contact?.phone
    || detail.value?.migrations?.length
  );
});

const showRelationGroup = computed(() => {
  const data = detail.value;
  if (!data) return false;
  return !!(
    data.father
    || data.mother
    || data.parents.length
    ||     data.spouses.length
    || data.children.length
    || data.siblings?.length
    || props.canEdit
  );
});

const showCareerGroup = computed(() => {
  const facts = profile.value;
  return !!(
    facts?.achievements
    || facts?.ethnicity
    || facts?.education
    || facts?.occupation
    || facts?.job_title
    || facts?.alma_mater
    || facts?.employer
    || facts?.religion
    || facts?.blood_type
    || detail.value?.events?.length
  );
});
const showBioGroup = computed(() => {
  const facts = profile.value;
  return !!(
    facts?.biography
    || facts?.anecdotes
    || facts?.marital_notes
    ||     facts?.adoption_note
    || facts?.epitaph
    || facts?.source_note
    || detail.value?.media?.length
  );
});

async function loadDetail() {
  if (!props.personId) return;
  const token = ++loadToken;
  const personId = props.personId;
  loading.value = true;
  try {
    const resp: any = await treeApi.getPersonDetail(String(personId));
    if (token !== loadToken) return;
    detail.value = resp?.data || resp;
    syncForm(detail.value!.person);
    consumeLivingApplyAfterLoad();
  } catch (e: any) {
    if (token !== loadToken) return;
    ElMessage.error(`加载人物详情失败：${e?.message || e}`);
    if (props.person && !detail.value) {
      detail.value = { person: props.person, parents: [], spouses: [], children: [] };
      syncForm(props.person);
      consumeLivingApplyAfterLoad();
    }
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

/** syncForm 回填生日时不触发在世重算，避免和用户改日期混在一起。 */
const ignoreBirthWatch = ref(0);

function syncForm(p: GenealogyNode) {
  ignoreBirthWatch.value += 1;
  form.full_name = p.full_name || '';
  form.gender = (p.gender as 'male' | 'female') || 'male';
  form.birth_date = p.birth_date ? String(p.birth_date).substring(0, 10) : '';
  form.death_date = p.death_date ? String(p.death_date).substring(0, 10) : '';
  form.is_living = !!p.is_living;
  form.birth_place = p.birth_place || '';
  form.death_place = p.death_place || '';
  form.migration_branch = p.migration_branch || '';
  const facts = detail.value?.profile;
  form.premature = !!facts?.premature;
  for (const key of BIO_KEYS) {
    form.bio[key] = (facts as any)?.[key] || '';
  }
  form.events = (detail.value?.events || []).map(event => ({
    event_year: event.event_year == null ? '' : String(event.event_year),
    content: event.content,
  }));
  form.child_types = {};
  for (const child of detail.value?.children || []) {
    form.child_types[child.id] = child.child_type || 'BIOLOGICAL';
  }
  form.unions = {};
  for (const spouse of detail.value?.spouses || []) {
    const union = spouse.union_type || '';
    form.unions[spouse.family_id] = union === 'concubine' || union === 'uxorilocal' ? union : 'normal';
  }
  originalSnapshot.value = JSON.stringify(form);
  nextTick(() => {
    ignoreBirthWatch.value = Math.max(0, ignoreBirthWatch.value - 1);
  });
}

let livingPromptToken = 0;
let livingDialogOpen = false;
let lastLivingKey = '';
/** 直接以编辑态打开时，等详情回填完再按生日重算，避免用画布节点的残缺数据弹确认。 */
let applyLivingAfterLoad = false;

function dismissLivingDialog() {
  livingPromptToken += 1;
  if (!livingDialogOpen) return;
  livingDialogOpen = false;
  ElMessageBox.close();
}

function consumeLivingApplyAfterLoad() {
  if (!applyLivingAfterLoad || !isEditing.value) return;
  applyLivingAfterLoad = false;
  void applyLivingFromBirth();
}

watch(
  () => props.personId,
  (id) => {
    lastLivingKey = '';
    dismissLivingDialog();
    isEditing.value = !!id && !!props.startInEdit;
    applyLivingAfterLoad = isEditing.value;
    clearPhotoPreview();
    detail.value = null;
    if (id) loadDetail();
  },
  { immediate: true },
);

watch(
  () => props.detailEpoch,
  () => {
    if (!props.personId) return;
    dismissLivingDialog();
    lastLivingKey = '';
    isEditing.value = false;
  },
);

/** 按公历生日到今天的周岁。生日未到则减一岁。无法解析时返回 null。 */
function completedAge(birth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let age = today.getFullYear() - year;
  const monthNow = today.getMonth() + 1;
  const dayNow = today.getDate();
  if (monthNow < month || (monthNow === month && dayNow < day)) age -= 1;
  return age;
}

const livingAge = computed(() => (isEditing.value ? completedAge(form.birth_date) : null));

const livingAgeHint = computed(() => {
  const age = livingAge.value;
  if (age == null || age < 0) return '';
  if (form.death_date) return '已填写去世日期，按已故处理。';
  if (age > 90) return `已满 ${age} 岁，超过 90 岁，默认已故。`;
  if (age >= 70) return `已满 ${age} 岁。90 岁以内默认仍在世，70–90 岁需确认。`;
  if (age === 0) return '未满 1 岁，90 岁以内默认仍在世。';
  return `已满 ${age} 岁，90 岁以内默认仍在世。`;
});

/** 70–90 岁：编辑时必须由人确认仍在世或标为已故。 */
async function confirmElderLiving(age: number) {
  const token = ++livingPromptToken;
  if (livingDialogOpen) ElMessageBox.close();
  livingDialogOpen = true;
  try {
    await ElMessageBox.confirm(
      `按出生日期计算，此人已满 ${age} 岁，处于 70–90 岁。请确认是否仍在世。`,
      '确认在世状态',
      {
        confirmButtonText: '仍在世',
        cancelButtonText: '标为已故',
        type: 'warning',
        distinguishCancelAndClose: true,
      },
    );
    if (token !== livingPromptToken) return;
    form.is_living = true;
  } catch (action) {
    if (token !== livingPromptToken) return;
    if (action === 'cancel') form.is_living = false;
  } finally {
    if (token === livingPromptToken) livingDialogOpen = false;
  }
}

/**
 * 没有去世日期时：90 岁以内默认仍在世，超过 90 岁默认已故。
 * 已填写去世日期则保持已故，不再按年龄改回在世。
 */
async function applyLivingFromBirth() {
  if (!isEditing.value) return;
  const age = completedAge(form.birth_date);
  const key = `${form.birth_date}|${form.death_date}|${age ?? ''}`;
  if (key === lastLivingKey) return;
  lastLivingKey = key;
  if (age == null || age < 0) return;
  if (form.death_date) {
    form.is_living = false;
    return;
  }
  if (age > 90) {
    form.is_living = false;
    return;
  }
  form.is_living = true;
  if (age >= 70) await confirmElderLiving(age);
}

async function onLivingToggle(checked: boolean | string | number) {
  const next = checked === true;
  const age = completedAge(form.birth_date);
  form.is_living = next;
  if (next && age != null && age >= 70 && age <= 90 && !form.death_date) {
    await confirmElderLiving(age);
  }
}

function startEdit() {
  if (detail.value) syncForm(detail.value.person);
  else if (props.person) syncForm(props.person);
  isEditing.value = true;
  lastLivingKey = '';
  void applyLivingFromBirth();
}

watch(
  () => form.birth_date,
  () => {
    if (!isEditing.value || ignoreBirthWatch.value > 0) return;
    void applyLivingFromBirth();
  },
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
    await persistPendingPhoto();
    const bio: Record<string, string | boolean | null> = { premature: form.premature };
    for (const key of BIO_KEYS) bio[key] = form.bio[key]?.trim() || null;
    const previous = detail.value?.profile;
    const previousBio: Record<string, string | boolean | null> = {
      premature: previous?.premature ?? null,
    };
    for (const key of BIO_KEYS) previousBio[key] = previous?.[key] ?? null;
    const updates: any = {
      full_name: form.full_name.trim(),
      gender: form.gender,
      birth_date: form.birth_date || null,
      death_date: form.death_date || null,
      is_living: form.is_living,
      birth_place: form.birth_place.trim() || null,
      death_place: form.death_place.trim() || null,
      migration_branch: form.migration_branch.trim() || null,
      bio,
      events: form.events
        .filter(event => event.content.trim())
        .map((event, index) => ({
          event_year: event.event_year.trim() ? Number(event.event_year) : null,
          content: event.content.trim(),
          sort_order: index,
        })),
      child_types: Object.entries(form.child_types).map(([child_id, child_type]) => ({ child_id, child_type })),
      unions: Object.entries(form.unions).map(([family_id, union_type]) => ({ family_id, union_type })),
    };
    await updatePersonWithUndo({
      personId: String(props.personId),
      updates,
      currentValues: {
        full_name: detail.value!.person.full_name,
        gender: detail.value!.person.gender as any,
        birth_date: detail.value!.person.birth_date ?? null,
        death_date: detail.value!.person.death_date ?? null,
        is_living: detail.value!.person.is_living,
        birth_place: detail.value!.person.birth_place ?? null,
        death_place: detail.value!.person.death_place ?? null,
        migration_branch: detail.value!.person.migration_branch ?? null,
        bio: previousBio,
        events: (detail.value?.events || []).map((event, index) => ({
          event_year: event.event_year,
          content: event.content,
          sort_order: event.sort_order ?? index,
        })),
        child_types: (detail.value?.children || []).map(child => ({
          child_id: child.id,
          child_type: child.child_type || 'BIOLOGICAL',
        })),
        unions: (detail.value?.spouses || []).map(spouse => ({
          family_id: spouse.family_id,
          union_type: spouse.union_type === 'concubine' || spouse.union_type === 'uxorilocal'
            ? spouse.union_type
            : 'normal',
        })),
      },
    });
    originalSnapshot.value = JSON.stringify(form);
    // 重新拉详情，保证父母/配偶/子女列表与最新 person 同步
    await loadDetail();
    const saved = detail.value?.person;
    if (saved && (saved.avatar_url || saved.photo_url || saved.thumbnail_url)) {
      saved.has_photo = true;
      if (!saved.photo_url) saved.photo_url = saved.avatar_url || saved.thumbnail_url;
    }
    isEditing.value = false;
    emit('updated', detail.value!.person);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || String(e);
    ElMessage.error(`保存失败：${msg}`);
  } finally {
    saving.value = false;
  }
}

function leaveEdit() {
  clearPhotoPreview();
  dismissLivingDialog();
  lastLivingKey = '';
  if (detail.value) syncForm(detail.value.person);
  isEditing.value = false;
}

function handleCancel() {
  if (!isDirty.value) {
    leaveEdit();
    return;
  }
  ElMessageBox.confirm('有未保存的修改，确定放弃？', '提示', {
    type: 'warning',
    confirmButtonText: '放弃修改',
    cancelButtonText: '继续编辑',
  })
    .then(() => leaveEdit())
    .catch(() => {
      /* user chose keep editing */
    });
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
    :append-to-body="true"
    :lock-scroll="false"
    @close="emit('close')"
    class="person-edit-drawer"
  >
    <div v-if="viewPerson" class="header-card">
        <div class="avatar-wrap">
          <img v-if="displayPhoto" class="avatar photo" :src="displayPhoto" alt="" />
          <div v-else class="avatar" :class="viewPerson?.gender || 'male'">
            <el-icon v-if="(viewPerson?.gender || 'male') === 'male'"><Male /></el-icon>
            <el-icon v-else><Female /></el-icon>
          </div>
          <button
            v-if="isEditing && canEdit"
            type="button"
            class="avatar-cam"
            title="更换头像"
            @click="photoInput?.click()"
          >
            <el-icon><Camera /></el-icon>
          </button>
          <input
            ref="photoInput"
            type="file"
            accept="image/*"
            hidden
            @change="onPhotoChange"
          />
        </div>
        <div class="info">
          <div class="name">
            {{ viewPerson?.full_name || viewPerson?.label || '（未命名）' }}
            <el-tag v-if="viewPerson && !viewPerson.is_living" type="info" size="small" effect="plain" class="ml-2">已故</el-tag>
          </div>
          <div class="meta">
            {{ viewPerson?.gender === 'female' ? '女' : '男' }}
            · {{ lifespanText }}
          </div>
        </div>
        <div class="header-actions">
          <el-button
            v-if="viewPerson?.id && !isEditing"
            size="small"
            plain
            @click="emit('set-center', viewPerson.id)"
          >
            设为中心
          </el-button>
          <template v-if="isEditing && canEdit">
            <el-button
              :icon="Check"
              circle
              type="primary"
              title="保存"
              :loading="saving"
              :disabled="!isDirty && !pendingPhoto"
              @click="handleSave"
            />
            <el-button :icon="Close" circle title="取消" @click="handleCancel" />
          </template>
          <el-button
            v-else-if="detail && canEdit"
            :icon="Edit"
            circle
            title="编辑"
            @click="startEdit"
          />
        </div>
      </div>

    <div v-if="loading && !detail" class="detail-skeleton" aria-busy="true">
      <div class="sk-block" />
      <div class="sk-line" />
      <div class="sk-line short" />
      <div class="sk-line" />
      <div class="sk-line short" />
    </div>

    <template v-else-if="detail">
      <section v-if="!isEditing && showNameGroup" class="relation-section">
        <h4 class="section-title">姓名称谓</h4>
        <dl class="detail-facts">
          <div v-if="profile?.taboo_name"><dt>讳</dt><dd>{{ profile.taboo_name }}</dd></div>
          <div v-if="profile?.courtesy_name"><dt>字</dt><dd>{{ profile.courtesy_name }}</dd></div>
          <div v-if="profile?.art_name"><dt>号</dt><dd>{{ profile.art_name }}</dd></div>
          <div v-if="profile?.posthumous_name"><dt>谥号</dt><dd>{{ profile.posthumous_name }}</dd></div>
          <div v-if="otherNames(profile)"><dt>其他称呼</dt><dd>{{ otherNames(profile) }}</dd></div>
          <div v-if="profile?.generation_word"><dt>字辈</dt><dd>{{ profile.generation_word }}</dd></div>
          <div v-if="profile?.birth_order"><dt>排行</dt><dd>行{{ profile.birth_order }}</dd></div>
          <div v-if="profile?.generation"><dt>世代</dt><dd>第 {{ profile.generation }} 世</dd></div>
          <div v-if="viewPerson?.migration_branch"><dt>房派</dt><dd>{{ viewPerson.migration_branch }}</dd></div>
        </dl>
      </section>

      <section v-if="!isEditing && showLifeGroup" class="relation-section">
        <h4 class="section-title">生卒籍贯墓葬</h4>
        <dl class="detail-facts">
          <div v-if="viewPerson?.birth_date"><dt>出生</dt><dd>{{ dateTimeText(viewPerson.birth_date) }}</dd></div>
          <div v-if="profile?.lunar_birth"><dt>农历生日</dt><dd>{{ profile.lunar_birth }}</dd></div>
          <div v-if="viewPerson?.birth_place"><dt>出生地</dt><dd>{{ viewPerson.birth_place }}</dd></div>
          <div v-if="profile?.native_place"><dt>籍贯</dt><dd>{{ profile.native_place }}</dd></div>
          <div v-if="viewPerson && !viewPerson.is_living && viewPerson.death_date"><dt>逝世</dt><dd>{{ dateTimeText(viewPerson.death_date) }}</dd></div>
          <div v-if="viewPerson && !viewPerson.is_living && profile?.lunar_death"><dt>农历忌日</dt><dd>{{ profile.lunar_death }}</dd></div>
          <div v-if="viewPerson && !viewPerson.is_living && viewPerson.death_place"><dt>逝世地</dt><dd>{{ viewPerson.death_place }}</dd></div>
          <div v-if="detail?.contact?.phone"><dt>电话</dt><dd>{{ detail.contact.phone }}</dd></div>
          <div v-if="profile?.age_at_death != null"><dt>享年</dt><dd>{{ profile.age_at_death }} 岁</dd></div>
          <div v-if="profile?.burial_place"><dt>安葬</dt><dd>{{ profile.burial_place }}</dd></div>
          <div v-if="profile?.premature"><dt>早夭</dt><dd>是</dd></div>
        </dl>
        <ul v-if="detail?.migrations?.length" class="story-events">
          <li v-for="move in detail.migrations" :key="move.id">
            <strong>{{ move.event_year }}</strong>
            <span>{{ move.from_location }} → {{ move.to_location }}<template v-if="move.reason">，{{ move.reason }}</template></span>
          </li>
        </ul>
      </section>

      <section v-if="!isEditing && showRelationGroup" class="relation-section">
        <h4 class="section-title">家庭关系</h4>
        <template v-if="detail.father">
          <h4 class="section-title">父亲</h4>
          <ul class="relation-list">
            <li class="relation-item" @click="navigate(detail.father.id)">
              <span class="dot male" />
              <span class="name">{{ detail.father.full_name }}</span>
              <span class="arrow">›</span>
            </li>
          </ul>
        </template>
        <template v-if="detail.mother">
          <h4 class="section-title">母亲</h4>
          <ul class="relation-list">
            <li class="relation-item" @click="navigate(detail.mother.id)">
              <span class="dot female" />
              <span class="name">{{ detail.mother.full_name }}</span>
              <span class="arrow">›</span>
            </li>
          </ul>
        </template>
        <template v-if="detail.spouses.length">
          <h4 class="section-title">配偶</h4>
          <ul class="relation-list">
            <li v-for="s in detail.spouses" :key="s.family_id" class="relation-item" @click="navigate(s.id)">
              <span class="dot" :class="s.gender" />
              <span class="name">{{ s.name }}</span>
              <span class="meta">{{ spouseRole(s) }}</span>
              <span class="arrow">›</span>
            </li>
          </ul>
        </template>
        <template v-if="detail.children.length || canEdit">
          <h4 class="section-title">
            子女
            <el-button
              v-if="canEdit"
              link
              type="primary"
              size="small"
              class="ml-auto"
              @click="openAddChild"
            >+ 添加</el-button>
          </h4>
          <div v-if="detail.children.length === 0" class="empty-hint">无子女记录</div>
          <ul v-else class="relation-list">
            <li v-for="c in detail.children" :key="c.id" class="relation-item" @click="navigate(c.id)">
              <span class="dot" :class="c.gender" />
              <span class="name">{{ c.full_name }}</span>
              <span v-if="kinLabel(c)" class="meta">{{ kinLabel(c) }}</span>
              <span v-if="c.birth_year" class="meta">{{ c.birth_year }}</span>
              <span class="arrow">›</span>
            </li>
          </ul>
        </template>
        <template v-if="detail.siblings?.length">
          <h4 class="section-title">兄弟姐妹</h4>
          <ul class="relation-list">
            <li v-for="c in detail.siblings" :key="c.id" class="relation-item" @click="navigate(c.id)">
              <span class="dot" :class="c.gender" />
              <span class="name">{{ c.full_name }}</span>
              <span v-if="c.birth_order" class="meta">行{{ c.birth_order }}</span>
              <span class="arrow">›</span>
            </li>
          </ul>
        </template>
      </section>

      <section v-if="!isEditing && showCareerGroup" class="relation-section">
        <h4 class="section-title">个人履历</h4>
        <dl class="detail-facts">
          <div v-if="profile?.ethnicity"><dt>民族</dt><dd>{{ profile.ethnicity }}</dd></div>
          <div v-if="profile?.education"><dt>学历</dt><dd>{{ profile.education }}</dd></div>
          <div v-if="profile?.occupation"><dt>职业</dt><dd>{{ profile.occupation }}</dd></div>
          <div v-if="profile?.job_title"><dt>职务</dt><dd>{{ profile.job_title }}</dd></div>
          <div v-if="profile?.alma_mater"><dt>毕业院校</dt><dd>{{ profile.alma_mater }}</dd></div>
          <div v-if="profile?.employer"><dt>工作单位</dt><dd>{{ profile.employer }}</dd></div>
          <div v-if="profile?.religion"><dt>宗教</dt><dd>{{ profile.religion }}</dd></div>
          <div v-if="profile?.blood_type"><dt>血型</dt><dd>{{ profile.blood_type }}</dd></div>
        </dl>
        <p v-if="profile?.achievements" class="story-bio">{{ profile.achievements }}</p>
        <ul v-if="detail?.events?.length" class="story-events">
          <li v-for="event in detail.events" :key="event.id || event.content">
            <strong v-if="event.event_year">{{ event.event_year }}</strong>
            <span>{{ event.content }}</span>
          </li>
        </ul>
      </section>

      <section v-if="!isEditing && showBioGroup" class="relation-section">
        <h4 class="section-title">传记与资料</h4>
        <p v-if="profile?.biography" class="story-bio">{{ profile.biography }}</p>
        <p v-if="profile?.anecdotes" class="story-bio">{{ profile.anecdotes }}</p>
        <p v-if="profile?.marital_notes" class="story-bio">{{ profile.marital_notes }}</p>
        <p v-if="profile?.adoption_note" class="story-bio">{{ profile.adoption_note }}</p>
        <p v-if="profile?.epitaph" class="story-bio">墓碑：{{ profile.epitaph }}</p>
        <p v-if="profile?.source_note" class="story-bio">来源：{{ profile.source_note }}</p>
        <ul v-if="detail?.media?.length" class="relation-list">
          <li v-for="item in detail.media" :key="item.id" class="relation-item">
            <span class="name">{{ item.description || item.category || '资料' }}</span>
          </li>
        </ul>
      </section>

      <el-divider v-if="isEditing" />

      <!-- 编辑态仍用原来的关系列表，方便添加或删除婚姻 -->
      <section v-if="isEditing" class="relation-section">
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
            v-if="isEditing && canEdit && detail.spouses.length <= 2"
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
            <el-select
              v-if="canEdit && s.union_type !== 'merger'"
              v-model="form.unions[s.family_id]"
              size="small"
              class="union-select"
              @click.stop
            >
              <el-option label="原配/继配" value="normal" />
              <el-option label="侧室" value="concubine" />
              <el-option label="入赘" value="uxorilocal" />
            </el-select>
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
              v-if="isEditing && canEdit"
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
          <el-button
            v-if="canEdit"
            link
            type="primary"
            size="small"
            class="ml-auto"
            @click="openAddChild"
          >+ 添加</el-button>
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
            <el-select
              v-if="canEdit"
              v-model="form.child_types[c.id]"
              size="small"
              class="union-select"
              @click.stop
            >
              <el-option
                v-for="option in CHILD_TYPE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <span v-if="c.birth_year" class="meta">{{ c.birth_year }}</span>
            <span class="arrow">›</span>
          </li>
        </ul>
      </section>

      <el-divider />

      <!-- 编辑表单：只有点了「编辑信息」才出现 -->
      <section v-if="isEditing && canEdit" class="form-section">
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
          <el-form-item label="出生地">
            <el-input v-model="form.birth_place" placeholder="出生地" />
          </el-form-item>
          <el-form-item>
            <el-checkbox
              :model-value="form.is_living"
              @change="onLivingToggle"
            >仍在世</el-checkbox>
            <p v-if="livingAgeHint" class="living-hint" :class="{ warn: livingAge != null && livingAge >= 70 && livingAge <= 90 && !form.death_date }">
              {{ livingAgeHint }}
            </p>
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
          <el-form-item v-if="!form.is_living" label="逝世地">
            <el-input v-model="form.death_place" placeholder="逝世地" />
          </el-form-item>
          <el-form-item label="农历生日">
            <el-input v-model="form.bio.lunar_birth" placeholder="不覆盖公历" />
          </el-form-item>
          <el-form-item v-if="!form.is_living" label="农历忌日">
            <el-input v-model="form.bio.lunar_death" />
          </el-form-item>
          <el-form-item label="籍贯">
            <el-input v-model="form.bio.native_place" />
          </el-form-item>
          <el-form-item label="安葬地点">
            <el-input v-model="form.bio.burial_place" />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="form.premature">早夭</el-checkbox>
          </el-form-item>
        </el-form>

        <h4 class="section-title">姓名称谓</h4>
        <el-form label-position="top" size="default">
          <el-form-item label="讳"><el-input v-model="form.bio.taboo_name" /></el-form-item>
          <el-form-item label="字"><el-input v-model="form.bio.courtesy_name" /></el-form-item>
          <el-form-item label="号"><el-input v-model="form.bio.art_name" /></el-form-item>
          <el-form-item label="谥号"><el-input v-model="form.bio.posthumous_name" /></el-form-item>
          <el-form-item label="乳名"><el-input v-model="form.bio.infant_name" /></el-form-item>
          <el-form-item label="别名"><el-input v-model="form.bio.alias_name" /></el-form-item>
          <el-form-item label="曾用名"><el-input v-model="form.bio.former_name" /></el-form-item>
          <el-form-item label="绰号"><el-input v-model="form.bio.nickname" /></el-form-item>
          <el-form-item label="房派"><el-input v-model="form.migration_branch" /></el-form-item>
        </el-form>

        <h4 class="section-title">个人履历</h4>
        <el-form label-position="top" size="default">
          <el-form-item label="民族"><el-input v-model="form.bio.ethnicity" /></el-form-item>
          <el-form-item label="学历"><el-input v-model="form.bio.education" /></el-form-item>
          <el-form-item label="职业"><el-input v-model="form.bio.occupation" /></el-form-item>
          <el-form-item label="职务"><el-input v-model="form.bio.job_title" /></el-form-item>
          <el-form-item label="毕业院校"><el-input v-model="form.bio.alma_mater" /></el-form-item>
          <el-form-item label="工作单位"><el-input v-model="form.bio.employer" /></el-form-item>
          <el-form-item label="宗教"><el-input v-model="form.bio.religion" /></el-form-item>
          <el-form-item label="血型"><el-input v-model="form.bio.blood_type" /></el-form-item>
          <el-form-item label="功名">
            <el-input v-model="form.bio.achievements" type="textarea" :rows="3" />
          </el-form-item>
        </el-form>
        <div v-for="(event, index) in form.events" :key="index" class="event-edit">
          <el-input v-model="event.event_year" placeholder="年份" class="event-year" />
          <el-input v-model="event.content" placeholder="事件" />
          <el-button link type="danger" @click="removeEvent(index)">删除</el-button>
        </div>
        <el-button link type="primary" @click="addEvent">添加事件</el-button>

        <h4 class="section-title">传记与资料</h4>
        <el-form label-position="top" size="default">
          <el-form-item label="生平小传">
            <el-input v-model="form.bio.biography" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item label="轶事">
            <el-input v-model="form.bio.anecdotes" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="配偶家世">
            <el-input v-model="form.bio.marital_notes" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="出继 / 兼祧说明">
            <el-input v-model="form.bio.adoption_note" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="墓碑文字">
            <el-input v-model="form.bio.epitaph" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="考证与来源">
            <el-input v-model="form.bio.source_note" type="textarea" :rows="2" />
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
            :disabled="!isDirty && !pendingPhoto"
            @click="handleSave"
          >保存</el-button>
        </div>
      </section>

      <div v-else-if="!canEdit" class="readonly-tip">
        <el-icon><User /></el-icon>
        当前为只读模式，登录后或族谱管理员可编辑
      </div>

      <el-dialog
        v-model="addChildVisible"
        title="添加子女"
        width="420px"
        append-to-body
        :close-on-click-modal="false"
      >
        <el-form label-width="72px" @submit.prevent="submitAddChild">
          <el-form-item label="姓名" required>
            <el-input
              v-model="addChildForm.full_name"
              placeholder="请输入子女姓名"
              maxlength="50"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="性别" required>
            <el-radio-group v-model="addChildForm.gender">
              <el-radio-button value="male">男</el-radio-button>
              <el-radio-button value="female">女</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="关系" required>
            <el-select v-model="addChildForm.child_type" style="width: 100%">
              <el-option
                v-for="option in CHILD_TYPE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="addChildVisible = false">取消</el-button>
          <el-button type="primary" :loading="addChildSubmitting" @click="submitAddChild">确定</el-button>
        </template>
      </el-dialog>
    </template>
  </el-drawer>
</template>

<style scoped>
.person-edit-drawer :deep(.el-drawer__body) {
  padding: 20px;
}

.detail-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.sk-block,
.sk-line {
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f1ee 25%, #e7e2db 37%, #f3f1ee 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.2s ease infinite;
}

.sk-block { height: 72px; }
.sk-line { height: 14px; }
.sk-line.short { width: 62%; }

@keyframes sk-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
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

.header-card .info {
  flex: 1;
  min-width: 0;
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}

.avatar-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}

.avatar-cam {
  position: absolute;
  inset: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.avatar-wrap:hover .avatar-cam,
.avatar-cam:focus-visible {
  opacity: 1;
}

.detail-facts {
  margin: 16px 0 0;
}

.detail-facts > div {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.detail-facts dt {
  margin: 0;
  color: #8c7344;
  font-size: 13px;
  line-height: 1.6;
}

.detail-facts dd {
  margin: 0;
  color: #2c3e50;
  font-size: 14px;
  line-height: 1.6;
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

.header-card .avatar.photo {
  object-fit: cover;
  background: #f3efe8;
}
.story-bio {
  margin: 0 0 12px;
  line-height: 1.7;
  font-size: 14px;
  color: #3e342c;
}
.story-events {
  list-style: none;
  padding: 0;
  margin: 0;
}
.story-events li {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  line-height: 1.6;
  font-size: 14px;
}
.story-events strong {
  flex: 0 0 64px;
  color: #8c7344;
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

.union-select {
  width: 108px;
  flex-shrink: 0;
}

.event-edit {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.event-year {
  width: 88px;
  flex-shrink: 0;
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

.living-hint {
  flex-basis: 100%;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #8d6e63;
}

.living-hint.warn {
  color: #b86e00;
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