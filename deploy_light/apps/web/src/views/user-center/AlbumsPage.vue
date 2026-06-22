<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import personalSpaceApi from '@/api/personalSpace'
import type { UserAlbum, UserPhoto, UserStorageInfo, SpacePrivacyLevel } from '@/types'

const router = useRouter()

// ==================== 状态 ====================
const loading = ref(false)
const albums = ref<UserAlbum[]>([])
const storage = ref<UserStorageInfo | null>(null)
const currentAlbum = ref<UserAlbum | null>(null)
const photos = ref<UserPhoto[]>([])
const photosPagination = ref({ page: 1, total: 0, total_pages: 0 })
const sortBy = ref('updated_at')
const previewVisible = ref(false)
const previewUrl = ref('')

// 相册弹窗
const albumDialogVisible = ref(false)
const albumDialogMode = ref<'create' | 'edit'>('create')
const albumForm = ref({
  name: '',
  description: '',
  default_privacy: 'clan' as SpacePrivacyLevel,
})
const editingAlbumId = ref<string | null>(null)

// 照片上传弹窗
const uploadDialogVisible = ref(false)
const uploadForm = ref({
  album_id: '',
  location_name: '',
  taken_year: new Date().getFullYear(),
  taken_date: '',
  description: '',
  privacy: 'clan' as SpacePrivacyLevel,
})
const uploadFiles = ref<File[]>([])
const uploading = ref(false)

// 照片编辑弹窗
const editPhotoDialogVisible = ref(false)
const editPhotoForm = ref({
  id: '',
  location_name: '',
  taken_year: 0,
  taken_date: '',
  description: '',
  privacy: 'clan' as SpacePrivacyLevel,
})

// 移动弹窗
const moveDialogVisible = ref(false)
const moveTargetAlbumId = ref('')
const movePhotoId = ref('')

const privacyOptions = [
  { value: 'self', label: '仅自己可见' },
  { value: 'clan', label: '全族公开' },
  { value: 'lineage', label: '上下几代公开' },
  { value: 'public', label: '平台公开' },
  { value: 'same_location', label: '同地点用户公开' },
]

const storagePercent = computed(() => {
  if (!storage.value) return 0
  return Math.min(100, (storage.value.used_mb / storage.value.quota_mb) * 100)
})

const storageText = computed(() => {
  if (!storage.value) return '加载中...'
  return `${storage.value.used_mb.toFixed(1)}MB / ${storage.value.quota_mb}MB`
})

const currentYear = new Date().getFullYear()

// ==================== 数据加载 ====================

async function fetchStorage() {
  try {
    const res = (await personalSpaceApi.storage.get()) as unknown as UserStorageInfo
    storage.value = res
  } catch (err) {
    console.error('获取存储用量失败', err)
  }
}

async function fetchAlbums() {
  loading.value = true
  try {
    const res = (await personalSpaceApi.albums.list(sortBy.value)) as unknown as UserAlbum[]
    albums.value = res
  } catch (err) {
    console.error('获取相册列表失败', err)
  } finally {
    loading.value = false
  }
}

async function fetchPhotos(albumId: string, page = 1) {
  loading.value = true
  try {
    const res = (await personalSpaceApi.photos.list({
      album_id: albumId,
      page,
      pageSize: 20,
    })) as unknown as { data: UserPhoto[]; pagination: any }
    photos.value = res.data
    photosPagination.value = res.pagination
  } catch (err) {
    console.error('获取照片列表失败', err)
  } finally {
    loading.value = false
  }
}

// ==================== 相册操作 ====================

function openCreateAlbumDialog() {
  albumDialogMode.value = 'create'
  albumForm.value = { name: '', description: '', default_privacy: 'clan' }
  editingAlbumId.value = null
  albumDialogVisible.value = true
}

function openEditAlbumDialog(album: UserAlbum) {
  albumDialogMode.value = 'edit'
  albumForm.value = {
    name: album.name,
    description: album.description || '',
    default_privacy: album.default_privacy,
  }
  editingAlbumId.value = album.id
  albumDialogVisible.value = true
}

async function saveAlbum() {
  if (!albumForm.value.name.trim()) {
    ElMessage.warning('请输入相册名称')
    return
  }
  try {
    if (albumDialogMode.value === 'create') {
      await personalSpaceApi.albums.create(albumForm.value)
      ElMessage.success('相册已创建')
    } else if (editingAlbumId.value) {
      await personalSpaceApi.albums.update(editingAlbumId.value, albumForm.value)
      ElMessage.success('相册已更新')
    }
    albumDialogVisible.value = false
    await fetchAlbums()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

async function deleteAlbum(album: UserAlbum) {
  try {
    await ElMessageBox.confirm(
      `确定删除相册"${album.name}"吗？照片将移至"未分类"相册。`,
      '确认删除',
      { type: 'warning' },
    )
    await personalSpaceApi.albums.delete(album.id)
    ElMessage.success('相册已删除')
    if (currentAlbum.value?.id === album.id) {
      currentAlbum.value = null
      photos.value = []
    }
    await fetchAlbums()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function enterAlbum(album: UserAlbum) {
  currentAlbum.value = album
  fetchPhotos(album.id)
}

function backToAlbums() {
  currentAlbum.value = null
  photos.value = []
  fetchAlbums()
}

// ==================== 照片操作 ====================

function openUploadDialog() {
  if (!currentAlbum.value) return
  uploadForm.value = {
    album_id: currentAlbum.value.id,
    location_name: '',
    taken_year: currentYear,
    taken_date: '',
    description: '',
    privacy: currentAlbum.value.default_privacy,
  }
  uploadFiles.value = []
  uploadDialogVisible.value = true
}

function handleFileChange(files: File[]) {
  uploadFiles.value = files.slice(0, 9)
}

async function uploadPhotos() {
  if (uploadFiles.value.length === 0) {
    ElMessage.warning('请选择照片')
    return
  }
  if (!uploadForm.value.location_name.trim()) {
    ElMessage.warning('请填写地点')
    return
  }
  uploading.value = true
  let successCount = 0
  let failCount = 0
  try {
    for (const file of uploadFiles.value) {
      try {
        await personalSpaceApi.photos.upload({
          file,
          album_id: uploadForm.value.album_id,
          location_name: uploadForm.value.location_name,
          taken_year: uploadForm.value.taken_year,
          taken_date: uploadForm.value.taken_date || undefined,
          description: uploadForm.value.description || undefined,
          privacy: uploadForm.value.privacy,
        })
        successCount++
      } catch {
        failCount++
      }
    }
    ElMessage.success(`上传完成：成功 ${successCount} 张${failCount > 0 ? `，失败 ${failCount} 张` : ''}`)
    uploadDialogVisible.value = false
    if (currentAlbum.value) {
      await fetchPhotos(currentAlbum.value.id)
    }
    await Promise.all([fetchAlbums(), fetchStorage()])
  } finally {
    uploading.value = false
  }
}

function previewPhoto(photo: UserPhoto) {
  previewUrl.value = photo.file_url
  previewVisible.value = true
}

function openEditPhotoDialog(photo: UserPhoto) {
  editPhotoForm.value = {
    id: photo.id,
    location_name: photo.location_name,
    taken_year: photo.taken_year || new Date().getFullYear(),
    taken_date: photo.taken_date?.split('T')[0] || '',
    description: photo.description || '',
    privacy: photo.privacy,
  }
  editPhotoDialogVisible.value = true
}

async function savePhoto() {
  try {
    await personalSpaceApi.photos.update(editPhotoForm.value.id, {
      location_name: editPhotoForm.value.location_name,
      taken_year: editPhotoForm.value.taken_year,
      taken_date: editPhotoForm.value.taken_date || undefined,
      description: editPhotoForm.value.description || undefined,
      privacy: editPhotoForm.value.privacy,
    })
    ElMessage.success('照片已更新')
    editPhotoDialogVisible.value = false
    if (currentAlbum.value) {
      await fetchPhotos(currentAlbum.value.id)
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '更新失败')
  }
}

async function deletePhoto(photo: UserPhoto) {
  try {
    await ElMessageBox.confirm('确定删除此照片吗？删除后不可恢复。', '确认删除', {
      type: 'warning',
    })
    await personalSpaceApi.photos.delete(photo.id)
    ElMessage.success('照片已删除')
    if (currentAlbum.value) {
      await fetchPhotos(currentAlbum.value.id)
    }
    await Promise.all([fetchAlbums(), fetchStorage()])
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}

function openMoveDialog(photo: UserPhoto) {
  movePhotoId.value = photo.id
  moveTargetAlbumId.value = ''
  moveDialogVisible.value = true
}

async function movePhoto() {
  if (!moveTargetAlbumId.value) {
    ElMessage.warning('请选择目标相册')
    return
  }
  try {
    await personalSpaceApi.photos.move(movePhotoId.value, moveTargetAlbumId.value)
    ElMessage.success('照片已移动')
    moveDialogVisible.value = false
    if (currentAlbum.value) {
      await fetchPhotos(currentAlbum.value.id)
    }
    await fetchAlbums()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '移动失败')
  }
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await Promise.all([fetchAlbums(), fetchStorage()])
})
</script>

<template>
  <div class="albums-page">
    <!-- 个人空间 Tab 导航 -->
    <div class="space-tabs">
      <ElButton type="primary" text class="tab-btn active">相册</ElButton>
      <ElButton text class="tab-btn" @click="router.push('/user-center/personal-space/messages')">留言板</ElButton>
    </div>

    <!-- 顶部标题与存储用量 -->
    <div class="page-header">
      <div class="header-left">
        <ElButton
          v-if="currentAlbum"
          icon="ArrowLeft"
          text
          @click="backToAlbums"
        >
          返回相册列表
        </ElButton>
        <h3 v-if="currentAlbum" class="album-title">{{ currentAlbum.name }}</h3>
        <h3 v-else>我的相册</h3>
      </div>
      <div class="header-right">
        <span class="storage-text">{{ storageText }}</span>
        <ElProgress
          :percentage="storagePercent"
          :width="120"
          :stroke-width="8"
          :color="storagePercent > 90 ? '#f56c6c' : '#409eff'"
        />
      </div>
    </div>

    <!-- 相册列表视图 -->
    <template v-if="!currentAlbum">
      <div class="toolbar">
        <ElButton type="primary" icon="Plus" @click="openCreateAlbumDialog">
          创建相册
        </ElButton>
        <ElSelect v-model="sortBy" style="width: 140px" @change="fetchAlbums">
          <ElOption label="更新时间" value="updated_at" />
          <ElOption label="创建时间" value="created_at" />
        </ElSelect>
      </div>

      <div v-if="loading && albums.length === 0" class="loading-area">
        <ElSkeleton :rows="3" animated />
      </div>

      <ElEmpty v-else-if="albums.length === 0" description="暂无相册，点击上方按钮创建" />

      <div v-else class="album-grid">
        <div
          v-for="album in albums"
          :key="album.id"
          class="album-card"
          @click="enterAlbum(album)"
        >
          <div class="album-cover">
            <img
              v-if="album.cover_photo_url"
              :src="album.cover_photo_url"
              :alt="album.name"
            />
            <ElIcon v-else :size="48" color="#c0c4cc"><PictureFilled /></ElIcon>
          </div>
          <div class="album-info">
            <div class="album-name">{{ album.name }}</div>
            <div class="album-meta">
              <span>{{ album.photo_count }} 张</span>
              <span>{{ new Date(album.updated_at).toLocaleDateString() }}</span>
            </div>
          </div>
          <div class="album-actions" @click.stop>
            <ElDropdown trigger="click">
              <ElButton icon="MoreFilled" text size="small" />
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem @click="openEditAlbumDialog(album)">
                    编辑
                  </ElDropdownItem>
                  <ElDropdownItem @click="deleteAlbum(album)" divided>
                    删除
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
        </div>
      </div>
    </template>

    <!-- 相册详情视图（照片列表） -->
    <template v-else>
      <div class="toolbar">
        <ElButton type="primary" icon="Upload" @click="openUploadDialog">
          上传照片
        </ElButton>
      </div>

      <div v-if="loading && photos.length === 0" class="loading-area">
        <ElSkeleton :rows="3" animated />
      </div>

      <ElEmpty v-else-if="photos.length === 0" description="暂无照片，点击上方上传" />

      <div v-else class="photo-grid">
        <div
          v-for="photo in photos"
          :key="photo.id"
          class="photo-card"
        >
          <div class="photo-img" @click="previewPhoto(photo)">
            <img :src="photo.file_url" :alt="photo.location_name" />
          </div>
          <div class="photo-meta">
            <div class="photo-location">{{ photo.location_name }}</div>
            <div class="photo-year">{{ photo.taken_year }}年</div>
            <div class="photo-privacy">
              <ElTag size="small" effect="plain">
                {{ privacyOptions.find(p => p.value === photo.privacy)?.label || photo.privacy }}
              </ElTag>
            </div>
          </div>
          <div class="photo-actions">
            <ElButton icon="Edit" text size="small" @click="openEditPhotoDialog(photo)" />
            <ElButton icon="Rank" text size="small" @click="openMoveDialog(photo)" />
            <ElButton icon="Delete" text size="small" type="danger" @click="deletePhoto(photo)" />
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="photosPagination.total_pages > 1" class="pagination">
        <ElPagination
          :current-page="photosPagination.page"
          :page-size="20"
          :total="photosPagination.total"
          layout="prev, pager, next"
          @current-change="(p: number) => fetchPhotos(currentAlbum!.id, p)"
        />
      </div>
    </template>

    <!-- 创建/编辑相册弹窗 -->
    <ElDialog
      v-model="albumDialogVisible"
      :title="albumDialogMode === 'create' ? '创建相册' : '编辑相册'"
      width="420px"
    >
      <ElForm label-width="90px">
        <ElFormItem label="相册名称" required>
          <ElInput
            v-model="albumForm.name"
            maxlength="20"
            show-word-limit
            placeholder="最多20字"
          />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput
            v-model="albumForm.description"
            type="textarea"
            maxlength="100"
            show-word-limit
            :rows="3"
          />
        </ElFormItem>
        <ElFormItem label="默认隐私">
          <ElSelect v-model="albumForm.default_privacy" style="width: 100%">
            <ElOption
              v-for="opt in privacyOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="albumDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="saveAlbum">保存</ElButton>
      </template>
    </ElDialog>

    <!-- 照片上传弹窗 -->
    <ElDialog v-model="uploadDialogVisible" title="上传照片" width="520px">
      <ElForm label-width="90px">
        <ElFormItem label="选择照片" required>
          <div class="upload-area">
            <ElUpload
              :auto-upload="false"
              :file-list="[]"
              accept="image/*"
              multiple
              :limit="9"
              :on-change="(f: any) => handleFileChange([...uploadFiles, f.raw])"
            >
              <ElButton icon="Plus">选择文件（最多9张）</ElButton>
            </ElUpload>
            <div v-if="uploadFiles.length > 0" class="file-list">
              <span v-for="(f, i) in uploadFiles" :key="i" class="file-tag">
                <ElTag closable @close="uploadFiles.splice(i, 1)" size="small">
                  {{ f.name }}
                </ElTag>
              </span>
            </div>
          </div>
        </ElFormItem>
        <ElFormItem label="地点" required>
          <ElInput v-model="uploadForm.location_name" placeholder="拍摄地点" />
        </ElFormItem>
        <ElFormItem label="年份" required>
          <ElInputNumber
            v-model="uploadForm.taken_year"
            :min="1900"
            :max="currentYear"
            controls-position="right"
          />
        </ElFormItem>
        <ElFormItem label="日期">
          <ElDatePicker
            v-model="uploadForm.taken_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="可选，精确到日"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput
            v-model="uploadForm.description"
            type="textarea"
            maxlength="100"
            show-word-limit
            :rows="2"
          />
        </ElFormItem>
        <ElFormItem label="隐私设置">
          <ElSelect v-model="uploadForm.privacy" style="width: 100%">
            <ElOption
              v-for="opt in privacyOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="uploadDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="uploading" @click="uploadPhotos">
          上传
        </ElButton>
      </template>
    </ElDialog>

    <!-- 照片编辑弹窗 -->
    <ElDialog v-model="editPhotoDialogVisible" title="编辑照片" width="420px">
      <ElForm label-width="90px">
        <ElFormItem label="地点">
          <ElInput v-model="editPhotoForm.location_name" />
        </ElFormItem>
        <ElFormItem label="年份">
          <ElInputNumber
            v-model="editPhotoForm.taken_year"
            :min="1900"
            :max="currentYear"
            controls-position="right"
          />
        </ElFormItem>
        <ElFormItem label="日期">
          <ElDatePicker
            v-model="editPhotoForm.taken_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput
            v-model="editPhotoForm.description"
            type="textarea"
            maxlength="100"
            show-word-limit
            :rows="2"
          />
        </ElFormItem>
        <ElFormItem label="隐私设置">
          <ElSelect v-model="editPhotoForm.privacy" style="width: 100%">
            <ElOption
              v-for="opt in privacyOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editPhotoDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="savePhoto">保存</ElButton>
      </template>
    </ElDialog>

    <!-- 移动照片弹窗 -->
    <ElDialog v-model="moveDialogVisible" title="移动照片" width="380px">
      <ElForm label-width="90px">
        <ElFormItem label="目标相册">
          <ElSelect v-model="moveTargetAlbumId" style="width: 100%" placeholder="选择相册">
            <ElOption
              v-for="album in albums.filter(a => a.id !== currentAlbum?.id)"
              :key="album.id"
              :label="album.name"
              :value="album.id"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="moveDialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="movePhoto">移动</ElButton>
      </template>
    </ElDialog>

    <!-- 图片预览 -->
    <ElDialog v-model="previewVisible" title="预览" width="80%" top="5vh">
      <img :src="previewUrl" class="preview-image" />
    </ElDialog>
  </div>
</template>

<style scoped>
.albums-page {
  max-width: 1200px;
  margin: 0 auto;
}

.space-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
  padding-bottom: 8px;
}

.tab-btn {
  font-size: 15px;
  padding: 8px 16px;
}

.tab-btn.active {
  font-weight: 600;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.storage-text {
  font-size: 13px;
  color: #606266;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.album-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.album-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: box-shadow 0.2s;
  position: relative;
}

.album-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.album-cover {
  width: 100%;
  height: 160px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-info {
  padding: 12px;
}

.album-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.album-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.album-actions {
  position: absolute;
  top: 8px;
  right: 8px;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.photo-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.photo-img {
  width: 100%;
  height: 140px;
  cursor: pointer;
  overflow: hidden;
}

.photo-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}

.photo-img:hover img {
  transform: scale(1.05);
}

.photo-meta {
  padding: 8px 10px;
}

.photo-location {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.photo-year {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.photo-privacy {
  margin-top: 4px;
}

.photo-actions {
  display: flex;
  padding: 4px 8px 8px;
  gap: 4px;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.upload-area {
  width: 100%;
}

.file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.preview-image {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.loading-area {
  padding: 20px;
}
</style>
