<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getChildhoodPlaces,
  createChildhoodPlace,
  updateChildhoodPlace,
  deleteChildhoodPlace,
} from '@/api/buddy'

const loading = ref(false)
const places = ref<any[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)

const form = ref({
  location_name: '',
  lat: undefined as number | undefined,
  lng: undefined as number | undefined,
  start_age: 5,
  end_age: 15,
  period_description: '',
})

const rules = {
  location_name: [{ required: true, message: '请输入地点名称', trigger: 'blur' }],
  start_age: [{ required: true, message: '请输入起始年龄', trigger: 'blur' }],
  end_age: [{ required: true, message: '请输入结束年龄', trigger: 'blur' }],
}

// 加载童年地点
async function loadPlaces() {
  loading.value = true
  try {
    const res = await getChildhoodPlaces()
    places.value = res.data
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

// 打开新增对话框
function handleAdd() {
  isEdit.value = false
  editId.value = null
  form.value = {
    location_name: '',
    lat: undefined,
    lng: undefined,
    start_age: 5,
    end_age: 15,
    period_description: '',
  }
  dialogVisible.value = true
}

// 打开编辑对话框
function handleEdit(place: any) {
  isEdit.value = true
  editId.value = place.id
  form.value = {
    location_name: place.location_name,
    lat: place.lat,
    lng: place.lng,
    start_age: place.start_age,
    end_age: place.end_age,
    period_description: place.period_description,
  }
  dialogVisible.value = true
}

// 保存
async function handleSave() {
  try {
    if (isEdit.value && editId.value) {
      await updateChildhoodPlace(editId.value, form.value)
      ElMessage.success('更新成功')
    } else {
      await createChildhoodPlace(form.value)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
    await loadPlaces()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '保存失败')
  }
}

// 删除
async function handleDelete(place: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除"${place.location_name}"吗？`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await deleteChildhoodPlace(place.id)
    ElMessage.success('删除成功')
    await loadPlaces()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

onMounted(() => {
  loadPlaces()
})
</script>

<template>
  <div class="childhood-places-page">
    <div class="page-header">
      <h2>我的童年地点</h2>
      <ElButton type="primary" @click="handleAdd">
        <ElIcon><Plus /></ElIcon>
        添加地点
      </ElButton>
    </div>

    <ElAlert
      title="提示"
      description="添加您童年生活过的地点，系统将基于这些信息为您寻找儿时伙伴。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 24px"
    />

    <!-- 地点列表 -->
    <ElRow :gutter="20" v-loading="loading">
      <ElCol
        v-for="place in places"
        :key="place.id"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
        style="margin-bottom: 20px"
      >
        <ElCard shadow="hover" class="place-card">
          <div class="place-content">
            <div class="place-name">{{ place.location_name }}</div>
            <div class="place-period">
              {{ place.start_age }}岁 - {{ place.end_age }}岁
            </div>
            <div v-if="place.period_description" class="place-description">
              {{ place.period_description }}
            </div>
            <div v-if="place.lat && place.lng" class="place-coords">
              坐标: {{ place.lat.toFixed(4) }}, {{ place.lng.toFixed(4) }}
            </div>
          </div>
          <div class="place-actions">
            <ElButton size="small" type="primary" text @click="handleEdit(place)">
              <ElIcon><Edit /></ElIcon>
              编辑
            </ElButton>
            <ElButton size="small" type="danger" text @click="handleDelete(place)">
              <ElIcon><Delete /></ElIcon>
              删除
            </ElButton>
          </div>
        </ElCard>
      </ElCol>
    </ElRow>

    <!-- 空状态 -->
    <ElEmpty v-if="!loading && places.length === 0" description="还没有添加童年地点">
      <ElButton type="primary" @click="handleAdd">立即添加</ElButton>
    </ElEmpty>

    <!-- 添加/编辑对话框 -->
    <ElDialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑童年地点' : '添加童年地点'"
      width="500px"
    >
      <ElForm :model="form" :rules="rules" label-width="100px">
        <ElFormItem label="地点名称" prop="location_name">
          <ElInput v-model="form.location_name" placeholder="例如：王家村、红旗小学" />
        </ElFormItem>
        <ElFormItem label="起始年龄" prop="start_age">
          <ElInputNumber v-model="form.start_age" :min="0" :max="18" />
        </ElFormItem>
        <ElFormItem label="结束年龄" prop="end_age">
          <ElInputNumber v-model="form.end_age" :min="0" :max="18" />
        </ElFormItem>
        <ElFormItem label="时期描述">
          <ElInput
            v-model="form.period_description"
            type="textarea"
            :rows="3"
            placeholder="例如：小学时期、初中时期"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleSave">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.childhood-places-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.place-card {
  height: 100%;
  transition: all 0.3s;
}

.place-card:hover {
  transform: translateY(-4px);
}

.place-content {
  margin-bottom: 16px;
}

.place-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.place-period {
  font-size: 14px;
  color: #409eff;
  margin-bottom: 8px;
}

.place-description {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin-bottom: 8px;
}

.place-coords {
  font-size: 12px;
  color: #909399;
}

.place-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .page-header h2 {
    font-size: 20px;
  }
}
</style>
