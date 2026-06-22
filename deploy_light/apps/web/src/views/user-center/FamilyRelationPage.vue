<template>
  <div class="family-relation-page">
    <div class="page-header">
      <h2>家庭关系维护</h2>
      <p class="desc">您可以在这里更新您的婚姻状态、配偶信息、子女情况以及抚养关系。</p>
    </div>

    <!-- 步骤一：选择更新类型 -->
    <ElCard class="step-card">
      <template #header><span class="step-title">请选择您要更新的内容</span></template>
      <div class="option-grid">
        <ElCard
          shadow="hover"
          class="option-card"
          @click="selectedType = 'marriage'; step = 2"
        >
          <ElIcon :size="32"><User /></ElIcon>
          <span>我的婚姻状况有变化</span>
        </ElCard>
        <ElCard
          shadow="hover"
          class="option-card"
          @click="selectedType = 'child'; step = 2"
        >
          <ElIcon :size="32"><Baby /></ElIcon>
          <span>我的子女情况有变化</span>
        </ElCard>
        <ElCard
          shadow="hover"
          class="option-card"
          @click="selectedType = 'spouse'; step = 2"
        >
          <ElIcon :size="32"><Connection /></ElIcon>
          <span>我的配偶信息需要更新</span>
        </ElCard>
      </div>
    </ElCard>

    <!-- 步骤二：婚姻状态表单 -->
    <ElCard v-if="step >= 2 && selectedType === 'marriage'" class="step-card">
      <template #header><span class="step-title">更新家庭状况 · 婚姻</span></template>
      <ElForm label-position="top">
        <ElFormItem label="请告诉我您目前的情况：">
          <ElRadioGroup v-model="marriageForm.current_status">
            <ElRadio value="married">我已婚，配偶是 <ElInput v-model="marriageForm.spouse_name" placeholder="配偶姓名" style="width:200px" /></ElRadio>
            <ElRadio value="not_in_marriage">我目前未在婚姻关系中</ElRadio>
            <ElRadio value="widowed">我丧偶</ElRadio>
            <ElRadio value="remarried">我再婚了，现在的配偶是 <ElInput v-model="marriageForm.spouse_name" placeholder="配偶姓名" style="width:200px" /></ElRadio>
          </ElRadioGroup>
        </ElFormItem>

        <ElFormItem v-if="marriageForm.current_status === 'not_in_marriage' || marriageForm.current_status === 'widowed'" label="是否需要保留前任配偶的信息？">
          <ElRadioGroup v-model="marriageForm.keep_previous_spouse">
            <ElRadio :value="true">保留在族谱中（作为历史记录，仅管理员和您可见）</ElRadio>
            <ElRadio :value="false">从族谱中移除（仅移除配偶关系，不影响子女信息）</ElRadio>
          </ElRadioGroup>
        </ElFormItem>

        <ElFormItem label="变更原因（可选）">
          <ElInput v-model="marriageForm.change_reason" type="textarea" :maxlength="200" show-word-limit />
        </ElFormItem>
      </ElForm>
      <div class="form-actions">
        <ElButton @click="step = 1">上一步</ElButton>
        <ElButton type="primary" @click="submitMarriage">提交更新</ElButton>
      </div>
    </ElCard>

    <!-- 步骤二：配偶表单 -->
    <ElCard v-if="step >= 2 && selectedType === 'spouse'" class="step-card">
      <template #header><span class="step-title">更新配偶信息</span></template>
      <ElForm label-position="top">
        <ElFormItem label="操作类型：">
          <ElRadioGroup v-model="spouseForm.action">
            <ElRadio value="add">新增配偶</ElRadio>
            <ElRadio value="remove">解除配偶关系</ElRadio>
            <ElRadio value="replace">更换配偶</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem v-if="spouseForm.action !== 'remove'" label="配偶姓名：">
          <ElInput v-model="spouseForm.spouse_name" placeholder="输入配偶姓名" />
        </ElFormItem>
        <ElFormItem v-if="spouseForm.action !== 'remove'" label="配偶性别：">
          <ElRadioGroup v-model="spouseForm.gender">
            <ElRadio value="male">男</ElRadio>
            <ElRadio value="female">女</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
      </ElForm>
      <div class="form-actions">
        <ElButton @click="step = 1">上一步</ElButton>
        <ElButton type="primary" @click="submitSpouse">提交更新</ElButton>
      </div>
    </ElCard>

    <!-- 步骤二：子女表单 -->
    <ElCard v-if="step >= 2 && selectedType === 'child'" class="step-card">
      <template #header><span class="step-title">子女信息登记</span></template>
      <ElForm label-position="top">
        <ElFormItem label="子女姓名：">
          <ElInput v-model="childForm.child_name" placeholder="输入子女姓名" />
        </ElFormItem>
        <ElFormItem label="性别：">
          <ElRadioGroup v-model="childForm.gender">
            <ElRadio value="male">男</ElRadio>
            <ElRadio value="female">女</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem label="抚养情况：">
          <ElRadioGroup v-model="childForm.custody">
            <ElRadio value="living_with">孩子跟随我生活</ElRadio>
            <ElRadio value="not_living_with">孩子不跟随我生活，但仍是家族成员</ElRadio>
            <ElRadio value="joint">我们共同抚养孩子</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="childForm.parent_missing">父亲/母亲信息暂未录入</ElCheckbox>
        </ElFormItem>
      </ElForm>
      <div class="form-actions">
        <ElButton @click="step = 1">上一步</ElButton>
        <ElButton type="primary" @click="submitChild">提交更新</ElButton>
      </div>
    </ElCard>

    <!-- 成功提示 -->
    <ElCard v-if="submitted" class="step-card">
      <ElResult
        icon="success"
        title="信息已更新"
        sub-title="感谢您帮助我们完善家族记录。"
      >
        <template #extra>
          <ElButton type="primary" @click="resetForm">继续更新</ElButton>
          <ElButton @click="$router.push('/user-center/family-relation/history')">查看变更历史</ElButton>
        </template>
      </ElResult>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserCenterStore } from '@/stores/userCenter'

const userStore = useUserCenterStore()

const step = ref(1)
const selectedType = ref<'marriage' | 'spouse' | 'child' | null>(null)
const submitted = ref(false)

const marriageForm = reactive({
  current_status: '',
  spouse_name: '',
  keep_previous_spouse: true,
  change_reason: '',
})

const spouseForm = reactive({
  action: 'add' as 'add' | 'remove' | 'replace',
  spouse_name: '',
  gender: 'male' as 'male' | 'female',
})

const childForm = reactive({
  child_name: '',
  gender: 'male' as 'male' | 'female',
  custody: 'joint' as 'living_with' | 'not_living_with' | 'joint',
  parent_missing: false,
})

async function submitMarriage() {
  if (!marriageForm.current_status) {
    ElMessage.warning('请选择婚姻状态')
    return
  }
  const persons = await userStore.fetchMyPerson()
  const personId = userStore.linkedPersons[0]?.person_id
  if (!personId) {
    ElMessage.error('未找到关联的人物信息，请先完成身份验证')
    return
  }
  try {
    await userStore.updateMarriage({
      person_id: personId,
      current_status: marriageForm.current_status as any,
      keep_previous_spouse: marriageForm.keep_previous_spouse,
      change_reason: marriageForm.change_reason || undefined,
    })
    ElMessage.success('婚姻状态已更新')
    submitted.value = true
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '提交失败')
  }
}

async function submitSpouse() {
  const persons = await userStore.fetchMyPerson()
  const personId = userStore.linkedPersons[0]?.person_id
  if (!personId) {
    ElMessage.error('未找到关联的人物信息，请先完成身份验证')
    return
  }
  try {
    await userStore.updateSpouse({
      person_id: personId,
      action: spouseForm.action,
      new_spouse: spouseForm.action !== 'remove' ? {
        full_name: spouseForm.spouse_name,
        gender: spouseForm.gender,
        is_external: true,
      } : undefined,
    })
    ElMessage.success('配偶信息已更新')
    submitted.value = true
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '提交失败')
  }
}

async function submitChild() {
  if (!childForm.child_name) {
    ElMessage.warning('请输入子女姓名')
    return
  }
  const persons = await userStore.fetchMyPerson()
  const personId = userStore.linkedPersons[0]?.person_id
  if (!personId) {
    ElMessage.error('未找到关联的人物信息，请先完成身份验证')
    return
  }
  try {
    await userStore.addChild({
      parent_person_id: personId,
      child: {
        full_name: childForm.child_name,
        gender: childForm.gender,
        father_info_missing: childForm.parent_missing,
        mother_info_missing: childForm.parent_missing,
      },
      custody: childForm.custody,
    })
    ElMessage.success('子女信息已登记')
    submitted.value = true
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '提交失败')
  }
}

function resetForm() {
  step.value = 1
  selectedType.value = null
  submitted.value = false
  marriageForm.current_status = ''
  marriageForm.spouse_name = ''
  marriageForm.change_reason = ''
  spouseForm.action = 'add'
  spouseForm.spouse_name = ''
  childForm.child_name = ''
  childForm.gender = 'male'
  childForm.custody = 'joint'
  childForm.parent_missing = false
}
</script>

<style scoped>
.family-relation-page {
  max-width: 800px;
  margin: 0 auto;
}
.page-header { margin-bottom: 24px; }
.page-header h2 { margin: 0 0 8px; color: #303133; }
.page-header .desc { color: #909399; font-size: 14px; margin: 0; }
.step-card { margin-bottom: 20px; }
.step-title { font-size: 16px; font-weight: 600; }
.option-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.option-card {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 32px 16px; cursor: pointer; text-align: center;
}
.form-actions { display: flex; justify-content: space-between; margin-top: 20px; }
</style>
