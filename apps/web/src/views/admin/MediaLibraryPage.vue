<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import LocationPicker from '@/components/media/LocationPicker.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const clanSlug = computed(() => route.params.slug || '1')
const role = computed(() => auth.user?.role || '')
const currentUserId = computed(() => auth.user?.sub || '')
const isAdminRole = computed(() => role.value === 'OWNER' || role.value === 'ADMIN')
const isViewer = computed(() => role.value === 'VIEWER')
const canManage = (row?: { uploader_id?: string }) => {
  if (isAdminRole.value) return true
  return role.value === 'EDITOR' && !!row?.uploader_id && row.uploader_id === currentUserId.value
}

const PRIVACY_OPTIONS = [
  { value: 'self', label: '仅自己可见' },
  { value: 'clan', label: '全族公开' },
  { value: 'lineage', label: '上下几代公开' },
  { value: 'public', label: '平台公开' },
  { value: 'same_location', label: '同地点用户公开' },
]
const privacyLabel = (value?: string) => PRIVACY_OPTIONS.find((item) => item.value === value)?.label || value || '-'
const formatSize = (value?: string | number) => {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
const formatTime = (value?: string) => (value ? new Date(value).toLocaleString() : '-')
const takenOnText = (value?: string | null) => {
  if (value == null || value === '') return ''
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || ''
}
const formatTakenOn = (value?: string | null) => takenOnText(value) || '-'
const resolutionText = (row?: { width?: number | null; height?: number | null }) => {
  const width = Number(row?.width)
  const height = Number(row?.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return '-'
  return `${width} × ${height}`
}
const fileTail = (value?: string | null) => {
  if (!value) return ''
  const clean = String(value).split('?')[0].split('#')[0]
  const parts = clean.split(/[/\\]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}
const originalNameText = (row?: { original_filename?: string | null; original_key?: string | null; file_url?: string | null }) => {
  const named = String(row?.original_filename || '').trim()
  if (named) return named
  const key = String(row?.original_key || '').trim()
  if (key) return fileTail(key) || key
  return fileTail(row?.file_url) || '-'
}
const mediaPreview = (row?: { thumb_url?: string; file_url?: string; display_url?: string }) =>
  row?.thumb_url || row?.file_url || row?.display_url || ''
const canBeCover = (category?: string) => category === '村寨风貌' || category === '祭祀活动'

// 数据列表
const mediaList = ref<any[]>([])
const loading = ref(false)
const pagination = ref({
  page: 1,
  pageSize: 30,
  total: 0,
})

// 筛选条件
const filters = ref({
  keyword: '',
  category: '',
  year: '',
  uploaderId: '',
  type: '',
  startYear: '',
  endYear: '',
  location: '',
  personId: '',
  reviewStatus: '',
  uploadedFrom: '',
  uploadedTo: '',
  sort: 'created_at:desc',
})
const albums = ref<{ id: string; name: string }[]>([])
const uploaders = ref<{ id: string; name: string }[]>([])
const filterPersons = ref<{ id: string; full_name: string }[]>([])

const albumId = computed(() => (route.query.albumId as string) || '')

const CATEGORY_LABEL: Record<string, string> = {
  family_portrait: '家庭合影',
  portrait: '个人照片',
  landscape: '风景',
  artifact: '文物',
  other: '其他',
  村寨风貌: '村寨风貌',
  祭祀活动: '祭祀活动',
}
const categoryLabel = (value?: string) => (value && CATEGORY_LABEL[value]) || value || '其他'

// 批量选择
const selectedItems = ref<string[]>([])
const batchDialogVisible = ref(false)
const batchAction = ref<'update' | 'delete'>('update')
const viewMode = ref<'list' | 'grid'>('list')
const mediaTableRef = ref<any>(null)

// 详情编辑
const detailVisible = ref(false)
const currentMedia = ref<any>(null)
const emptyEdit = () => ({
  description: '',
  taken_year: '',
  taken_on: '',
  taken_location: '',
  latitude: '',
  longitude: '',
  category: '',
  privacy_level: '',
  album_id: '',
})
const editForm = ref(emptyEdit())
const batchPersonId = ref('')
const batchPersons = ref<{ id: string; full_name: string }[]>([])

const linkedPersons = ref<{ id: string; name: string }[]>([])
const personOptions = ref<{ id: string; full_name: string }[]>([])
const personSearchLoading = ref(false)
const personPick = ref('')
let personSearchSeq = 0

const addablePersons = computed(() =>
  personOptions.value.filter((person) => !linkedPersons.value.some((linked) => linked.id === person.id)),
)

const readError = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message
  if (Array.isArray(msg)) return msg.join('；')
  return msg || e?.message || fallback
}

const uploadVisible = ref(false)
const uploading = ref(false)
const uploadFiles = ref<File[]>([])
const uploadResults = ref<{ name: string; ok: boolean; message: string }[]>([])
const uploadPersonId = ref('')
const clanId = ref('')
const IMAGE_MAX = 50 * 1024 * 1024
const VIDEO_MAX = 200 * 1024 * 1024

// 加载数据
const fetchData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/media/list', {
      params: {
        clanSlug: clanSlug.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
        keyword: filters.value.keyword || undefined,
        category: filters.value.category || undefined,
        year: filters.value.year || undefined,
        uploaderId: filters.value.uploaderId || undefined,
        albumId: albumId.value || undefined,
        type: filters.value.type || undefined,
        startYear: filters.value.startYear || undefined,
        endYear: filters.value.endYear || undefined,
        location: filters.value.location || undefined,
        personId: filters.value.personId || undefined,
        reviewStatus: filters.value.reviewStatus || undefined,
        uploadedFrom: filters.value.uploadedFrom || undefined,
        uploadedTo: filters.value.uploadedTo || undefined,
        sortBy: filters.value.sort.split(':')[0],
        sortOrder: filters.value.sort.split(':')[1],
      },
    })
    mediaList.value = res.data.data
    pagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  pagination.value.page = 1
  fetchData()
}

// 重置筛选
const handleReset = () => {
  filters.value = {
    keyword: '',
    category: '',
    year: '',
    uploaderId: '',
    type: '',
    startYear: '',
    endYear: '',
    location: '',
    personId: '',
    reviewStatus: '',
    uploadedFrom: '',
    uploadedTo: '',
    sort: 'created_at:desc',
  }
  handleSearch()
}

const loadAlbums = async () => {
  try {
    const res = await axios.get('/api/admin/albums', { params: { clanSlug: clanSlug.value } })
    albums.value = res.data?.data || []
  } catch {
    albums.value = []
  }
}

const loadUploaders = async () => {
  try {
    const res = await axios.get(`/api/admin/media/${clanSlug.value}/uploaders`)
    uploaders.value = res.data?.data || []
  } catch {
    uploaders.value = []
  }
}

const searchFilterPersons = async (keyword: string) => {
  try {
    const res = await axios.get(`/api/admin/media/${clanSlug.value}/persons`, {
      params: { keyword: keyword?.trim() || undefined },
    })
    filterPersons.value = res.data?.data || []
  } catch {
    filterPersons.value = []
  }
}

const syncLinkedPersons = () => {
  if (!currentMedia.value) return
  currentMedia.value.tagged_persons = linkedPersons.value.map((person) => ({
    id: person.id,
    name: person.name,
  }))
}

const searchClanPersons = async (keyword: string) => {
  const seq = ++personSearchSeq
  personSearchLoading.value = true
  try {
    const res = await axios.get(`/api/admin/media/${clanSlug.value}/persons`, {
      params: { keyword: keyword?.trim() || undefined },
    })
    if (seq !== personSearchSeq) return
    personOptions.value = res.data?.data || []
  } catch (e: any) {
    if (seq !== personSearchSeq) return
    personOptions.value = []
    ElMessage.error(readError(e, '搜索人物失败'))
  } finally {
    if (seq === personSearchSeq) personSearchLoading.value = false
  }
}

const handleLinkPerson = async (personId: string) => {
  if (!personId || !currentMedia.value) return
  const name = personOptions.value.find((person) => person.id === personId)?.full_name || '未命名'
  try {
    await axios.post(`/api/admin/media/${clanSlug.value}/${currentMedia.value.id}/persons`, { personId })
    if (!linkedPersons.value.some((person) => person.id === personId)) {
      linkedPersons.value = [...linkedPersons.value, { id: personId, name }]
      syncLinkedPersons()
    }
    ElMessage.success('已关联人物')
  } catch (e: any) {
    ElMessage.error(readError(e, '关联失败'))
  } finally {
    personPick.value = ''
  }
}

const handleUnlinkPerson = async (person: { id: string; name: string }) => {
  if (!currentMedia.value) return
  try {
    await axios.delete(`/api/admin/media/${clanSlug.value}/${currentMedia.value.id}/persons/${person.id}`)
    linkedPersons.value = linkedPersons.value.filter((item) => item.id !== person.id)
    syncLinkedPersons()
    ElMessage.success('已取消关联')
  } catch (e: any) {
    ElMessage.error(readError(e, '取消关联失败'))
  }
}

const isSelected = (id: string) => selectedItems.value.includes(id)

const toggleGridSelect = (row: any, checked: boolean | string | number) => {
  const on = Boolean(checked)
  if (on) {
    if (!selectedItems.value.includes(row.id)) selectedItems.value = [...selectedItems.value, row.id]
  } else {
    selectedItems.value = selectedItems.value.filter((id) => id !== row.id)
  }
}

const handleSelectionChange = (selection: any[]) => {
  if (viewMode.value !== 'list') return
  selectedItems.value = selection.map((item) => item.id)
}

watch(viewMode, (mode) => {
  if (mode !== 'list') return
  const ids = [...selectedItems.value]
  nextTick(() => {
    const table = mediaTableRef.value
    if (!table) return
    for (const row of mediaList.value) {
      table.toggleRowSelection(row, ids.includes(row.id))
    }
    selectedItems.value = mediaList.value.filter((row) => ids.includes(row.id)).map((row) => row.id)
  })
})

// 打开详情
const handleViewDetail = (row: any) => {
  currentMedia.value = row
  editForm.value = {
    description: row.description || '',
    taken_year: row.taken_year || '',
    taken_on: takenOnText(row.taken_on),
    taken_location: row.taken_location || '',
    latitude: row.latitude == null || row.latitude === '' ? '' : String(row.latitude),
    longitude: row.longitude == null || row.longitude === '' ? '' : String(row.longitude),
    category: row.category || '',
    privacy_level: row.privacy_level || 'clan',
    album_id: row.album_id || '',
  }
  linkedPersons.value = (row.tagged_persons || []).map((person: any) => ({
    id: String(person.id),
    name: person.name || person.full_name || '',
  }))
  personPick.value = ''
  personOptions.value = []
  detailVisible.value = true
  searchClanPersons('')
}

// 保存编辑
const onTakenOnChange = (value: string | null) => {
  const text = takenOnText(value)
  if (text) editForm.value.taken_year = text.slice(0, 4)
}

const applyCoordinates = (point: { latitude: number; longitude: number }) => {
  editForm.value.latitude = String(point.latitude)
  editForm.value.longitude = String(point.longitude)
}

const readCoordinates = () => {
  const latText = String(editForm.value.latitude ?? '').trim()
  const lngText = String(editForm.value.longitude ?? '').trim()
  if ((latText && !lngText) || (!latText && lngText)) {
    ElMessage.warning('经纬度需要同时填写')
    return null
  }
  if (!latText && !lngText) return { latitude: null, longitude: null }
  const latitude = Number(latText)
  const longitude = Number(lngText)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    ElMessage.warning('纬度需在 -90 到 90，经度需在 -180 到 180')
    return null
  }
  return { latitude, longitude }
}

const formCoordText = computed(() => {
  const latText = String(editForm.value.latitude ?? '').trim()
  const lngText = String(editForm.value.longitude ?? '').trim()
  if (!latText && !lngText) return '-'
  if (!latText || !lngText) return '请同时填写纬度和经度'
  return `${latText}, ${lngText}`
})

const handleSaveEdit = async () => {
  try {
    const yearText = String(editForm.value.taken_year || '').trim()
    const dateText = takenOnText(editForm.value.taken_on)
    const coords = readCoordinates()
    if (!coords) return
    const originalDate = takenOnText(currentMedia.value?.taken_on)
    const originalYear = currentMedia.value?.taken_year == null || currentMedia.value?.taken_year === ''
      ? ''
      : String(currentMedia.value.taken_year)
    const body: Record<string, unknown> = {
      description: editForm.value.description,
      taken_location: editForm.value.taken_location,
      category: editForm.value.category,
      privacy_level: editForm.value.privacy_level || undefined,
      album_id: editForm.value.album_id || null,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }
    if (dateText && yearText && dateText.slice(0, 4) !== yearText) {
      body.taken_year = Number(yearText)
      body.taken_on = `${yearText}-${dateText.slice(5)}`
    } else if (dateText !== originalDate) {
      body.taken_on = dateText || null
      if (dateText) body.taken_year = Number(dateText.slice(0, 4))
      else if (yearText !== originalYear) body.taken_year = yearText ? Number(yearText) : null
    } else if (yearText !== originalYear) {
      body.taken_year = yearText ? Number(yearText) : null
    }
    await axios.put(`/api/admin/media/${clanSlug.value}/${currentMedia.value.id}`, body)
    ElMessage.success('保存成功')
    detailVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '保存失败'))
  }
}

// 删除单个
const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该影像吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/media/${id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('删除成功')
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

// 设为封面
const handleSetCover = async (id: string) => {
  try {
    await axios.post(`/api/admin/media/${id}/set-cover`, {}, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('已设为封面')
    fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '设置失败'))
  }
}

// 批量更新
const handleBatchUpdate = async () => {
  try {
    const payload: Record<string, unknown> = { ids: selectedItems.value }
    const yearText = String(editForm.value.taken_year || '').trim()
    const dateText = takenOnText(editForm.value.taken_on)
    const latText = String(editForm.value.latitude ?? '').trim()
    const lngText = String(editForm.value.longitude ?? '').trim()
    if ((latText && !lngText) || (!latText && lngText)) {
      ElMessage.warning('经纬度需要同时填写')
      return
    }
    if (latText && lngText) {
      const latitude = Number(latText)
      const longitude = Number(lngText)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        ElMessage.warning('纬度需在 -90 到 90，经度需在 -180 到 180')
        return
      }
      payload.latitude = latitude
      payload.longitude = longitude
    }
    if (dateText && yearText && dateText.slice(0, 4) !== yearText) {
      payload.taken_year = Number(yearText)
      payload.taken_on = `${yearText}-${dateText.slice(5)}`
    } else {
      if (dateText) payload.taken_on = dateText
      if (yearText) payload.taken_year = Number(yearText)
    }
    if (editForm.value.taken_location.trim()) payload.taken_location = editForm.value.taken_location.trim()
    if (editForm.value.description.trim()) payload.description = editForm.value.description.trim()
    if (editForm.value.category) payload.category = editForm.value.category
    if (editForm.value.privacy_level) payload.privacy_level = editForm.value.privacy_level
    if (editForm.value.album_id === '__clear__') payload.album_id = null
    else if (editForm.value.album_id) payload.album_id = editForm.value.album_id
    if (Object.keys(payload).length === 1) {
      ElMessage.warning('请至少填写一项要更新的内容')
      return
    }
    await axios.post(`/api/admin/media/${clanSlug.value}/batch-update`, payload)
    ElMessage.success('批量更新成功')
    batchDialogVisible.value = false
    selectedItems.value = []
    fetchData()
  } catch (e: any) {
    ElMessage.error(e.message || '批量更新失败')
  }
}

// 批量删除
const handleBatchDelete = async () => {
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedItems.value.length} 项影像吗？`, '提示', { type: 'warning' })
    await axios.post(`/api/admin/media/${clanSlug.value}/batch-delete`, {
      ids: selectedItems.value,
    })
    ElMessage.success('批量删除成功')
    batchDialogVisible.value = false
    selectedItems.value = []
    fetchData()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '批量删除失败')
    }
  }
}

// 打开批量操作
const handleBatchLinkPerson = async () => {
  if (!batchPersonId.value) {
    ElMessage.warning('请选择要关联的人物')
    return
  }
  const results: { ok: boolean; message: string }[] = []
  for (const id of selectedItems.value) {
    try {
      await axios.post(`/api/admin/media/${clanSlug.value}/${id}/persons`, { personId: batchPersonId.value })
      results.push({ ok: true, message: '' })
    } catch (e: any) {
      results.push({ ok: false, message: readError(e, '关联失败') })
    }
  }
  const failed = results.filter((item) => !item.ok)
  if (failed.length === 0) ElMessage.success(`已关联 ${results.length} 条影像`)
  else ElMessage.warning(`成功 ${results.length - failed.length} 条，失败 ${failed.length} 条`)
  batchDialogVisible.value = false
  fetchData()
}

const searchBatchPersons = async (keyword: string) => {
  try {
    const res = await axios.get(`/api/admin/media/${clanSlug.value}/persons`, {
      params: { keyword: keyword?.trim() || undefined },
    })
    batchPersons.value = res.data?.data || []
  } catch {
    batchPersons.value = []
  }
}

const zipping = ref(false)
const regenerating = ref(false)

const handleRegenerateThumb = async () => {
  if (!currentMedia.value) return
  regenerating.value = true
  try {
    const res = await axios.post(
      `/api/admin/media/${clanSlug.value}/${currentMedia.value.id}/regenerate-thumb`,
    )
    const thumbUrl = res.data?.thumb_url
    if (thumbUrl) currentMedia.value = { ...currentMedia.value, thumb_url: thumbUrl }
    ElMessage.success('缩略图已重新生成')
    fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '重新生成缩略图失败'))
  } finally {
    regenerating.value = false
  }
}

const handleBatchZip = async () => {
  if (selectedItems.value.length === 0) return
  if (selectedItems.value.length > 50) {
    ElMessage.warning('单次最多打包 50 条')
    return
  }
  zipping.value = true
  try {
    const res = await axios.post(`/api/admin/media/${clanSlug.value}/batch-zip`, {
      ids: selectedItems.value.map((id) => Number(id)),
    })
    const skipped = res.data?.skipped || []
    if (!res.data?.url) {
      ElMessage.warning(res.data?.message || '没有可打包的文件')
      if (skipped.length) {
        ElMessage.warning(skipped.map((item: { id: string; reason: string }) => `${item.id}：${item.reason}`).slice(0, 3).join('；'))
      }
      return
    }
    const file = await axios.get(res.data.url, { responseType: 'blob' })
    const blob: Blob = file.data
    if (blob.type.includes('application/json') || blob.type.includes('text/')) {
      throw new Error(await blob.text())
    }
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = res.data.filename || '影像打包.zip'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    ElMessage.success(skipped.length ? `已打包 ${res.data.count} 个，跳过 ${skipped.length} 个` : '打包完成，开始下载')
  } catch (e: any) {
    ElMessage.error(readError(e, '打包下载失败'))
  } finally {
    zipping.value = false
  }
}

const openSettlementCovers = async () => {
  try {
    const id = await ensureClanId()
    router.push(`/clans/${id}#settlement-covers`)
  } catch (e: any) {
    ElMessage.error(readError(e, '打不开聚落封面'))
  }
}

const handleBatchAction = (action: 'update' | 'delete') => {
  batchAction.value = action
  editForm.value = emptyEdit()
  batchPersonId.value = ''
  batchDialogVisible.value = true
  if (action === 'update') searchBatchPersons('')
}

const openOriginal = async () => {
  if (!currentMedia.value) return
  try {
    const res = await axios.get(`/api/admin/media/${clanSlug.value}/${currentMedia.value.id}/original`)
    const url = res.data?.url || currentMedia.value.display_url || currentMedia.value.file_url
    if (!url) {
      ElMessage.warning('没有可打开的文件')
      return
    }
    window.open(url, '_blank')
  } catch (e: any) {
    ElMessage.error(readError(e, '打开原图失败'))
  }
}

const ensureClanId = async () => {
  if (clanId.value) return clanId.value
  const res = await axios.get(`/api/clans/${clanSlug.value}`)
  clanId.value = String(res.data?.id || '')
  if (!clanId.value) throw new Error('找不到当前家族')
  return clanId.value
}

const fileTooLarge = (file: File) => {
  if (file.type.startsWith('image/') && file.size > IMAGE_MAX) return '图片不能超过 50MB'
  if (file.type.startsWith('video/') && file.size > VIDEO_MAX) return '视频不能超过 200MB'
  return ''
}

const handleUpload = async () => {
  if (uploadFiles.value.length === 0) {
    ElMessage.warning('请选择图片或视频')
    return
  }
  if (uploadFiles.value.length > 20) {
    ElMessage.warning('单次最多 20 个文件')
    return
  }
  uploading.value = true
  uploadResults.value = []
  try {
    const id = await ensureClanId()
    for (const file of uploadFiles.value) {
      const tooLarge = fileTooLarge(file)
      if (tooLarge) {
        uploadResults.value.push({ name: file.name, ok: false, message: tooLarge })
        continue
      }
      try {
        const body = new FormData()
        body.append('file', file)
        body.append('clan_id', id)
        if (editForm.value.taken_year) body.append('taken_year', String(editForm.value.taken_year))
        if (editForm.value.taken_on) body.append('taken_on', takenOnText(editForm.value.taken_on))
        if (editForm.value.taken_location) body.append('taken_location', editForm.value.taken_location)
        if (editForm.value.latitude && editForm.value.longitude) {
          body.append('latitude', String(editForm.value.latitude).trim())
          body.append('longitude', String(editForm.value.longitude).trim())
        }
        if (editForm.value.description) body.append('description', editForm.value.description)
        if (editForm.value.category) body.append('category', editForm.value.category)
        if (editForm.value.privacy_level) body.append('privacy_level', editForm.value.privacy_level)
        const chosenAlbum = editForm.value.album_id || albumId.value
        if (chosenAlbum) body.append('album_id', chosenAlbum)
        const res = await axios.post('/api/media/upload', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const mediaId = res.data?.id
        if (uploadPersonId.value && mediaId) {
          await axios.post(`/api/admin/media/${clanSlug.value}/${mediaId}/persons`, { personId: uploadPersonId.value })
        }
        uploadResults.value.push({ name: file.name, ok: true, message: '已提交审核' })
      } catch (e: any) {
        uploadResults.value.push({ name: file.name, ok: false, message: readError(e, '上传失败') })
      }
    }
    const failed = uploadResults.value.filter((item) => !item.ok).length
    if (failed === 0) ElMessage.success('全部提交成功，等待影像审核')
    else ElMessage.warning(`成功 ${uploadResults.value.length - failed} 个，失败 ${failed} 个`)
    fetchData()
  } catch (e: any) {
    ElMessage.error(readError(e, '上传失败'))
  } finally {
    uploading.value = false
  }
}

const onPickFile = (_file: any, fileList: any[]) => {
  uploadFiles.value = fileList.slice(0, 20).map((item) => item.raw).filter(Boolean)
}

const onExceed = () => {
  ElMessage.warning('单次最多 20 个文件')
}

const openUpload = () => {
  uploadFiles.value = []
  uploadResults.value = []
  uploadPersonId.value = ''
  editForm.value = emptyEdit()
  if (albumId.value) editForm.value.album_id = albumId.value
  uploadVisible.value = true
  searchBatchPersons('')
}

// 分页
const handlePageChange = (page: number) => {
  pagination.value.page = page
  fetchData()
}

watch(albumId, () => {
  pagination.value.page = 1
  fetchData()
})

onMounted(() => {
  fetchData()
  loadAlbums()
  loadUploaders()
  searchFilterPersons('')
})
</script>

<template>
  <div class="media-library-page">
    <div class="page-header">
      <h2>影像库</h2>
      <div class="header-actions">
        <el-radio-group v-model="viewMode">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="grid">网格</el-radio-button>
        </el-radio-group>
        <el-button v-if="!isViewer" type="primary" @click="openUpload">上传影像</el-button>
        <el-button @click="openSettlementCovers">查看聚落封面</el-button>
        <el-button
          :disabled="selectedItems.length === 0"
          :loading="zipping"
          @click="handleBatchZip"
        >
          打包下载
        </el-button>
        <el-button
          v-if="!isViewer"
          :disabled="selectedItems.length === 0"
          @click="handleBatchAction('update')"
        >
          批量更新
        </el-button>
        <el-button
          v-if="!isViewer"
          :disabled="selectedItems.length === 0"
          type="danger"
          @click="handleBatchAction('delete')"
        >
          批量删除
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="文件名 / 描述 / 地点" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部" clearable style="width: 110px;">
            <el-option label="图片" value="image" />
            <el-option label="视频" value="video" />
          </el-select>
        </el-form-item>
        <el-form-item label="上传者">
          <el-select v-model="filters.uploaderId" placeholder="全部" clearable filterable style="width: 140px;">
            <el-option v-for="item in uploaders" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filters.category" placeholder="全部" clearable>
            <el-option label="家庭合影" value="family_portrait" />
            <el-option label="个人照片" value="portrait" />
            <el-option label="风景" value="landscape" />
            <el-option label="文物" value="artifact" />
            <el-option label="其他" value="other" />
            <el-option label="村寨风貌" value="村寨风貌" />
            <el-option label="祭祀活动" value="祭祀活动" />
          </el-select>
        </el-form-item>
        <el-form-item label="年份">
          <el-input v-model="filters.year" placeholder="如 1980" clearable style="width: 100px;" />
        </el-form-item>
        <el-form-item label="年份范围">
          <el-input v-model="filters.startYear" placeholder="起" clearable style="width: 80px;" />
          <span style="margin: 0 6px;">-</span>
          <el-input v-model="filters.endYear" placeholder="止" clearable style="width: 80px;" />
        </el-form-item>
        <el-form-item label="上传日期">
          <el-date-picker
            v-model="filters.uploadedFrom"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="起"
            clearable
            style="width: 140px;"
          />
          <span style="margin: 0 6px;">-</span>
          <el-date-picker
            v-model="filters.uploadedTo"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="止"
            clearable
            style="width: 140px;"
          />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="filters.location" placeholder="地点关键词" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="关联人物">
          <el-select
            v-model="filters.personId"
            filterable
            remote
            clearable
            placeholder="全部"
            :remote-method="searchFilterPersons"
            style="width: 160px;"
          >
            <el-option v-for="person in filterPersons" :key="person.id" :label="person.full_name" :value="person.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核状态">
          <el-select v-model="filters.reviewStatus" placeholder="全部" clearable style="width: 120px;">
            <el-option label="待审核" value="PENDING" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已驳回" value="REJECTED" />
            <el-option label="无审核" value="none" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-select v-model="filters.sort" style="width: 180px;" @change="handleSearch">
            <el-option label="上传时间从新到旧" value="created_at:desc" />
            <el-option label="上传时间从旧到新" value="created_at:asc" />
            <el-option label="拍摄年份从高到低" value="taken_year:desc" />
            <el-option label="拍摄年份从低到高" value="taken_year:asc" />
            <el-option label="文件从大到小" value="file_size:desc" />
            <el-option label="文件从小到大" value="file_size:asc" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-table
      v-show="viewMode === 'list'"
      ref="mediaTableRef"
      :data="mediaList"
      v-loading="loading"
      row-key="id"
      @selection-change="handleSelectionChange"
      stripe
      style="margin-top: 16px;"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column label="缩略图" width="100">
        <template #default="{ row }">
          <el-image
            v-if="mediaPreview(row)"
            :src="mediaPreview(row)"
            fit="cover"
            style="width: 60px; height: 60px; cursor: pointer;"
            @click="handleViewDetail(row)"
          />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="110">
        <template #default="{ row }">
          {{ categoryLabel(row.category) }}
        </template>
      </el-table-column>
      <el-table-column label="年份" width="120">
        <template #default="{ row }">
          <div>{{ row.taken_year || '-' }}</div>
          <div v-if="takenOnText(row.taken_on)" class="year-date">{{ takenOnText(row.taken_on) }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="taken_location" label="拍摄地点" width="120" />
      <el-table-column prop="uploader_name" label="上传者" width="100" />
      <el-table-column prop="created_at" label="上传时间" width="160">
        <template #default="{ row }">
          {{ row.created_at ? new Date(row.created_at).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleViewDetail(row)">{{ canManage(row) ? '编辑' : '查看' }}</el-button>
          <el-button v-if="isAdminRole && canBeCover(row.category)" link type="success" @click="handleSetCover(row.id)">设为封面</el-button>
          <el-button v-if="canManage(row)" link type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-show="viewMode === 'grid'" v-loading="loading" class="media-grid">
      <div
        v-for="item in mediaList"
        :key="item.id"
        class="media-card"
        :class="{ 'is-selected': isSelected(item.id) }"
        @click="handleViewDetail(item)"
      >
        <div class="media-card-check" @click.stop>
          <el-checkbox
            :model-value="isSelected(item.id)"
            @change="(val: boolean | string | number) => toggleGridSelect(item, val)"
          />
        </div>
        <el-image
          v-if="mediaPreview(item)"
          :src="mediaPreview(item)"
          fit="cover"
          class="media-thumb"
        />
        <div v-else class="media-thumb media-thumb-empty">无预览</div>
        <div class="media-card-desc">{{ item.description || '-' }}</div>
        <div class="media-card-meta">
          <span>{{ item.taken_year || '-' }}<template v-if="takenOnText(item.taken_on)"> {{ takenOnText(item.taken_on) }}</template></span>
          <span>{{ categoryLabel(item.category) }}</span>
        </div>
      </div>
      <el-empty v-if="!loading && mediaList.length === 0" description="暂无影像" class="media-grid-empty" />
    </div>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="pagination.page"
      :total="pagination.total"
      :page-size="pagination.pageSize"
      @current-change="handlePageChange"
      layout="total, prev, pager, next"
      class="pagination"
    />

    <!-- 详情编辑弹窗 -->
    <el-dialog v-model="detailVisible" title="影像详情" width="720px" destroy-on-close>
      <div v-if="currentMedia" class="media-meta">
        <video
          v-if="currentMedia.media_type === 'video'"
          class="media-preview"
          :src="currentMedia.display_url || currentMedia.file_url"
          controls
        />
        <el-image
          v-else-if="currentMedia.thumb_url || currentMedia.display_url || currentMedia.file_url"
          class="media-preview"
          :src="currentMedia.thumb_url || currentMedia.display_url || currentMedia.file_url"
          :preview-src-list="[currentMedia.display_url || currentMedia.file_url]"
          fit="contain"
        />
        <p>拍摄日：{{ editForm.taken_on || formatTakenOn(currentMedia.taken_on) }}</p>
        <p>分辨率：{{ resolutionText(currentMedia) }}</p>
        <p>原始文件名：{{ originalNameText(currentMedia) }}</p>
        <p>经纬度：{{ formCoordText }}</p>
        <p>文件：{{ currentMedia.original_key || currentMedia.file_url || '-' }}</p>
        <p>大小：{{ formatSize(currentMedia.file_size) }}</p>
        <p>上传者：{{ currentMedia.uploader_name || '-' }}</p>
        <p>上传时间：{{ formatTime(currentMedia.created_at) }}</p>
        <p>隐私：{{ privacyLabel(currentMedia.privacy_level) }}</p>
        <p>相册：{{ currentMedia.album_name || '未归入相册' }}</p>
        <el-button link type="primary" @click="openOriginal">打开原图</el-button>
      </div>
      <el-form :model="editForm" label-width="100px" :disabled="!canManage(currentMedia)">
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="拍摄年份">
          <el-input v-model="editForm.taken_year" />
        </el-form-item>
        <el-form-item label="拍摄日期">
          <el-date-picker
            v-model="editForm.taken_on"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择拍摄日期"
            style="width: 100%;"
            @change="onTakenOnChange"
          />
        </el-form-item>
        <el-form-item label="分辨率">
          <el-input :model-value="resolutionText(currentMedia)" disabled />
        </el-form-item>
        <el-form-item label="原始文件名">
          <el-input :model-value="originalNameText(currentMedia)" disabled />
        </el-form-item>
        <el-form-item label="拍摄地点">
          <LocationPicker
            v-model="editForm.taken_location"
            :clan-slug="String(clanSlug)"
            :disabled="!canManage(currentMedia)"
            @coordinates="applyCoordinates"
          />
        </el-form-item>
        <el-form-item label="经纬度">
          <div class="coord-row">
            <el-input v-model="editForm.latitude" placeholder="纬度，-90 到 90" />
            <el-input v-model="editForm.longitude" placeholder="经度，-180 到 180" />
          </div>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category" style="width: 100%;">
            <el-option label="家庭合影" value="family_portrait" />
            <el-option label="个人照片" value="portrait" />
            <el-option label="风景" value="landscape" />
            <el-option label="文物" value="artifact" />
            <el-option label="其他" value="other" />
            <el-option label="村寨风貌" value="村寨风貌" />
            <el-option label="祭祀活动" value="祭祀活动" />
          </el-select>
        </el-form-item>
        <el-form-item label="隐私级别">
          <el-select v-model="editForm.privacy_level" style="width: 100%;">
            <el-option v-for="item in PRIVACY_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属相册">
          <el-select v-model="editForm.album_id" clearable placeholder="未归入相册" style="width: 100%;">
            <el-option v-for="album in albums" :key="album.id" :label="album.name" :value="album.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联人物">
          <div class="person-tags">
            <el-tag
              v-for="person in linkedPersons"
              :key="person.id"
              :closable="canManage(currentMedia)"
              @close="handleUnlinkPerson(person)"
            >
              {{ person.name }}
            </el-tag>
            <span v-if="linkedPersons.length === 0">暂无关联人物</span>
          </div>
          <el-select
            v-model="personPick"
            filterable
            remote
            clearable
            reserve-keyword
            placeholder="输入姓名搜索本族人物"
            :remote-method="searchClanPersons"
            :loading="personSearchLoading"
            style="width: 100%; margin-top: 8px;"
            @change="handleLinkPerson"
          >
            <el-option
              v-for="person in addablePersons"
              :key="person.id"
              :label="person.full_name"
              :value="person.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :loading="regenerating" @click="handleRegenerateThumb">重新生成缩略图</el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button v-if="canManage(currentMedia)" type="primary" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量操作弹窗 -->
    <el-dialog
      v-model="batchDialogVisible"
      :title="batchAction === 'update' ? '批量更新' : '批量删除'"
      width="500px"
      destroy-on-close
    >
      <template v-if="batchAction === 'update'">
        <el-form :model="editForm" label-width="100px">
          <el-form-item label="拍摄年份">
            <el-input v-model="editForm.taken_year" placeholder="留空则不更新" />
          </el-form-item>
          <el-form-item label="拍摄日期">
            <el-date-picker
              v-model="editForm.taken_on"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="留空则不更新"
              style="width: 100%;"
            />
          </el-form-item>
          <el-form-item label="纬度">
            <el-input v-model="editForm.latitude" placeholder="留空则不更新，需与经度成对" />
          </el-form-item>
          <el-form-item label="经度">
            <el-input v-model="editForm.longitude" placeholder="留空则不更新，需与纬度成对" />
          </el-form-item>
          <el-form-item label="拍摄地点">
            <el-input v-model="editForm.taken_location" placeholder="留空则不更新" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="editForm.description" type="textarea" :rows="2" placeholder="留空则不更新" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="editForm.category" placeholder="留空则不更新" clearable style="width: 100%;">
              <el-option label="家庭合影" value="family_portrait" />
              <el-option label="个人照片" value="portrait" />
              <el-option label="风景" value="landscape" />
              <el-option label="文物" value="artifact" />
              <el-option label="其他" value="other" />
              <el-option label="村寨风貌" value="村寨风貌" />
              <el-option label="祭祀活动" value="祭祀活动" />
            </el-select>
          </el-form-item>
          <el-form-item label="隐私级别">
            <el-select v-model="editForm.privacy_level" placeholder="留空则不更新" clearable style="width: 100%;">
              <el-option v-for="item in PRIVACY_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属相册">
            <el-select v-model="editForm.album_id" placeholder="留空则不更新" clearable style="width: 100%;">
              <el-option label="移出相册" value="__clear__" />
              <el-option v-for="album in albums" :key="album.id" :label="album.name" :value="album.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联人物">
            <el-select
              v-model="batchPersonId"
              filterable
              remote
              clearable
              placeholder="选择一个本族人物"
              :remote-method="searchBatchPersons"
              style="width: 100%;"
            >
              <el-option v-for="person in batchPersons" :key="person.id" :label="person.full_name" :value="person.id" />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <p>确定要删除选中的 <strong>{{ selectedItems.length }}</strong> 项影像吗？此操作不可逆。</p>
      </template>
      <template #footer>
        <template v-if="batchAction === 'update'">
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button :disabled="!batchPersonId" @click="handleBatchLinkPerson">关联人物</el-button>
          <el-button type="primary" @click="handleBatchUpdate">确认更新</el-button>
        </template>
        <template v-else>
          <el-button @click="batchDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="handleBatchDelete">确认删除</el-button>
        </template>
      </template>
    </el-dialog>

    <el-dialog v-model="uploadVisible" title="上传影像" width="560px" destroy-on-close>
      <p class="upload-limit">单次最多 20 个文件。图片不超过 50MB，视频不超过 200MB。</p>
      <el-upload
        drag
        multiple
        :auto-upload="false"
        :limit="20"
        accept="image/*,video/*"
        :on-change="onPickFile"
        :on-exceed="onExceed"
      >
        <div>将图片或视频拖到此处，或点击选择，最多 20 个</div>
      </el-upload>
      <el-form :model="editForm" label-width="100px" style="margin-top: 16px;">
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="拍摄年份">
          <el-input v-model="editForm.taken_year" placeholder="如 1980" />
        </el-form-item>
        <el-form-item label="拍摄日期">
          <el-date-picker
            v-model="editForm.taken_on"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="可选，精确到日"
            style="width: 100%;"
            @change="onTakenOnChange"
          />
        </el-form-item>
        <el-form-item label="拍摄地点">
          <el-input v-model="editForm.taken_location" placeholder="地点文本" />
        </el-form-item>
        <el-form-item label="纬度">
          <el-input v-model="editForm.latitude" placeholder="可选，需与经度成对" />
        </el-form-item>
        <el-form-item label="经度">
          <el-input v-model="editForm.longitude" placeholder="可选，需与纬度成对" />
        </el-form-item>
        <el-form-item label="隐私级别">
          <el-select v-model="editForm.privacy_level" clearable placeholder="未单独选择" style="width: 100%;">
            <el-option v-for="item in PRIVACY_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <p class="upload-hint">未单独选择时继承所选相册的默认隐私</p>
        </el-form-item>
        <el-form-item label="所属相册">
          <el-select v-model="editForm.album_id" clearable placeholder="可不选" style="width: 100%;">
            <el-option v-for="album in albums" :key="album.id" :label="album.name" :value="album.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联人物">
          <el-select
            v-model="uploadPersonId"
            filterable
            remote
            clearable
            placeholder="上传成功后关联"
            :remote-method="searchBatchPersons"
            style="width: 100%;"
          >
            <el-option v-for="person in batchPersons" :key="person.id" :label="person.full_name" :value="person.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category" clearable placeholder="可选" style="width: 100%;">
            <el-option label="家庭合影" value="family_portrait" />
            <el-option label="个人照片" value="portrait" />
            <el-option label="风景" value="landscape" />
            <el-option label="文物" value="artifact" />
            <el-option label="其他" value="other" />
            <el-option label="村寨风貌" value="村寨风貌" />
            <el-option label="祭祀活动" value="祭祀活动" />
          </el-select>
        </el-form-item>
      </el-form>
      <ul class="upload-results">
        <li v-if="uploadResults.length === 0">提交后在此列出每个文件的成功或失败。</li>
        <li v-for="item in uploadResults" :key="item.name" :class="item.ok ? 'is-ok' : 'is-fail'">
          {{ item.name }}：{{ item.ok ? '成功' : '失败' }}<span v-if="item.message">，{{ item.message }}</span>
        </li>
      </ul>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="handleUpload">提交审核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.media-library-page {
  padding: 20px;
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

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-card {
  margin-bottom: 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.media-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  min-height: 160px;
}

.media-grid-empty {
  grid-column: 1 / -1;
}

.media-card {
  position: relative;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  background: #fff;
}

.media-card.is-selected {
  border: 2px solid #409eff;
}

.media-card-check {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 2px;
  line-height: 1;
}

.media-thumb {
  width: 100%;
  height: 140px;
  display: block;
  background: #f5f7fa;
}

.media-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
}

.media-card-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.4;
  height: 36px;
  overflow: hidden;
}

.media-card-meta {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #909399;
  font-size: 12px;
}

.person-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-height: 24px;
}

.media-meta {
  margin-bottom: 12px;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}

.media-meta p {
  margin: 0;
}

.year-date {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.coord-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.media-preview {
  width: 100%;
  max-height: 240px;
  margin-bottom: 8px;
  background: #f5f7fa;
}

.upload-limit {
  margin: 0 0 8px;
  color: #606266;
  font-size: 13px;
}

.upload-hint {
  margin: 6px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.upload-results {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
}

.upload-results .is-ok {
  color: #67c23a;
}

.upload-results .is-fail {
  color: #f56c6c;
}
</style>
