<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const clanId = computed(() => route.query.clanId || '1')

// 家族信息
const clanInfo = ref<any>({
  name: '',
  description: '',
  slogan: '',
  origin_place: '',
  cover_url: '',
  logo_url: '',
})

// 扩展信息
const extraInfo = ref<any>({
  contact_email: '',
  contact_phone: '',
  website: '',
  established_year: '',
  cultural_heritage: '',
  notable_figures: '',
})

const loading = ref(false)
const saving = ref(false)

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/settings/clan-info', {
      params: { clanId: clanId.value },
    })
    const data = res.data
    clanInfo.value = {
      name: data.name || '',
      description: data.description || '',
      slogan: data.slogan || '',
      origin_place: data.origin_place || '',
      cover_url: data.cover_url || '',
      logo_url: data.logo_url || '',
    }
    // 从 settings_json 中提取扩展信息
    const settings = data.settings_json || {}
    extraInfo.value = {
      contact_email: settings.contact_email || '',
      contact_phone: settings.contact_phone || '',
      website: settings.website || '',
      established_year: settings.established_year || '',
      cultural_heritage: settings.cultural_heritage || '',
      notable_figures: settings.notable_figures || '',
    }
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 保存
const handleSave = async () => {
  if (!clanInfo.value.name.trim()) {
    ElMessage.warning('请输入家族名称')
    return
  }

  saving.value = true
  try {
    await axios.put('/api/admin/settings/clan-info', {
      name: clanInfo.value.name,
      description: clanInfo.value.description,
      slogan: clanInfo.value.slogan,
      origin_place: clanInfo.value.origin_place,
      cover_url: clanInfo.value.cover_url,
      logo_url: clanInfo.value.logo_url,
      settings_json: extraInfo.value,
    }, {
      params: { clanId: clanId.value },
    })
    ElMessage.success('保存成功')
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 上传封面预览
const handleCoverUpload = (url: string) => {
  clanInfo.value.cover_url = url
}

// 上传Logo预览
const handleLogoUpload = (url: string) => {
  clanInfo.value.logo_url = url
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="clan-info-page">
    <div class="page-header">
      <h2>家族信息编辑</h2>
      <el-button type="primary" :loading="saving" @click="handleSave">保存修改</el-button>
    </div>

    <el-form v-loading="loading" :model="clanInfo" label-width="120px" class="clan-form">
      <!-- 基础信息 -->
      <el-card class="form-section">
        <template #header>
          <span>基础信息</span>
        </template>
        <el-form-item label="家族名称" required>
          <el-input v-model="clanInfo.name" placeholder="请输入家族名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="家族简介">
          <el-input v-model="clanInfo.description" type="textarea" :rows="4" placeholder="请输入家族简介" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="家族口号">
          <el-input v-model="clanInfo.slogan" placeholder="如：传承家族文化，弘扬优良家风" maxlength="100" />
        </el-form-item>
        <el-form-item label="家族祖籍">
          <el-input v-model="clanInfo.origin_place" placeholder="如：浙江省绍兴市" />
        </el-form-item>
      </el-card>

      <!-- 视觉元素 -->
      <el-card class="form-section" style="margin-top: 16px;">
        <template #header>
          <span>视觉元素</span>
        </template>
        <el-form-item label="家族封面">
          <div class="cover-preview">
            <el-image
              v-if="clanInfo.cover_url"
              :src="clanInfo.cover_url"
              fit="cover"
              class="preview-image"
            />
            <div v-else class="preview-placeholder">
              <el-icon><Picture /></el-icon>
              <span>暂无封面</span>
            </div>
          </div>
          <el-input v-model="clanInfo.cover_url" placeholder="请输入封面图片URL" style="margin-top: 8px;">
            <template #append>
              <el-button @click="clanInfo.cover_url = ''">清除</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="家族Logo">
          <div class="logo-preview">
            <el-image
              v-if="clanInfo.logo_url"
              :src="clanInfo.logo_url"
              fit="contain"
              class="preview-logo"
            />
            <div v-else class="preview-placeholder small">
              <el-icon><Picture /></el-icon>
              <span>暂无Logo</span>
            </div>
          </div>
          <el-input v-model="clanInfo.logo_url" placeholder="请输入Logo图片URL" style="margin-top: 8px;">
            <template #append>
              <el-button @click="clanInfo.logo_url = ''">清除</el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-card>

      <!-- 扩展信息 -->
      <el-card class="form-section" style="margin-top: 16px;">
        <template #header>
          <span>扩展信息</span>
        </template>
        <el-form-item label="联系邮箱">
          <el-input v-model="extraInfo.contact_email" placeholder="如：clan@example.com" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="extraInfo.contact_phone" placeholder="如：13800138000" />
        </el-form-item>
        <el-form-item label="官方网站">
          <el-input v-model="extraInfo.website" placeholder="如：https://www.example.com" />
        </el-form-item>
        <el-form-item label="家族成立年份">
          <el-input v-model="extraInfo.established_year" placeholder="如：1900" />
        </el-form-item>
        <el-form-item label="文化遗产">
          <el-input v-model="extraInfo.cultural_heritage" type="textarea" :rows="2" placeholder="描述家族的文化遗产、传统技艺等" />
        </el-form-item>
        <el-form-item label="家族名人">
          <el-input v-model="extraInfo.notable_figures" type="textarea" :rows="2" placeholder="列出家族中有突出贡献的人物" />
        </el-form-item>
      </el-card>
    </el-form>
  </div>
</template>

<style scoped>
.clan-info-page {
  padding: 20px;
  max-width: 900px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.form-section {
  margin-bottom: 0;
}

.cover-preview,
.logo-preview {
  width: 100%;
}

.preview-image {
  width: 100%;
  height: 200px;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
}

.preview-logo {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
}

.preview-placeholder {
  width: 100%;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
  color: #909399;
  border: 1px dashed #dcdfe6;
}

.preview-placeholder.small {
  width: 120px;
  height: 120px;
}

.preview-placeholder .el-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.preview-placeholder.small .el-icon {
  font-size: 24px;
}
</style>
