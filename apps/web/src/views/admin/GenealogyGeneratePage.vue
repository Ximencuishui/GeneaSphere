<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import axios from 'axios'

const route = useRoute()
const clanId = computed(() => String(route.query.clanId ?? '1'))

const form = reactive({
  version_name: '族谱·2026版',
  style: 'traditional' as 'traditional' | 'modern' | 'simple',
  branch: '',
  generation_start: undefined as number | undefined,
  generation_end: undefined as number | undefined,
  cover_image_url: '',
  include_options: {
    basic_info: true,
    spouse_info: true,
    children_list: true,
    bio_text: false,
    photo: false,
    migration: false,
  },
})

const generating = ref(false)
const lastResult = ref<any>(null)

const styleOptions = [
  {
    value: 'traditional',
    label: '传统悬挂式',
    subLabel: '世系图 / 挂轴',
    desc: '适合大幅挂轴，显示父子、夫妻关系。古朴典雅、中轴对称。',
  },
  {
    value: 'modern',
    label: '现代图文混排',
    subLabel: 'A4 册子',
    desc: '照片+文字的现代纪念册格式，适合作为家族纪念品。',
  },
  {
    value: 'simple',
    label: '简约列表式',
    subLabel: '表格清单',
    desc: '快速查看所有成员的表格清单，信息密集、便于检索。',
  },
] as const

const branchOptions = ref<string[]>([])
async function loadBranches() {
  try {
    const res = await axios.get(`/api/migration/${clanId.value}/branches`)
    branchOptions.value = (res.data?.data ?? []).map((b: any) => b.branch || b)
  } catch {
    branchOptions.value = []
  }
}

async function handleGenerate() {
  if (!form.version_name.trim()) {
    ElMessage.warning('请输入版本名称')
    return
  }
  try {
    await ElMessageBox.confirm(
      '生成族谱文档将消耗一定时间（取决于人数）。确认开始生成？',
      '确认',
      { confirmButtonText: '开始生成', cancelButtonText: '取消', type: 'info' },
    )
  } catch {
    return
  }

  generating.value = true
  try {
    const res = await axios.post(`/api/genealogy-documents/${clanId.value}`, {
      ...form,
      generation_start: form.generation_start || undefined,
      generation_end: form.generation_end || undefined,
    })
    lastResult.value = res.data
    ElMessage.success('族谱文档已生成并保存为新版本')
  } catch (err: any) {
    ElMessage.error(`生成失败：${err?.response?.data?.message ?? err.message}`)
  } finally {
    generating.value = false
  }
}

function handleDownload() {
  if (!lastResult.value?.file_url) return
  const link = document.createElement('a')
  link.href = lastResult.value.file_url
  link.download = `${form.version_name}.pdf`
  link.click()
}

function handleOrderPrint() {
  ElMessage.info('跳转到印刷下单（复用现有印刷流程）')
}

onMounted(() => {
  loadBranches()
})
</script>

<template>
  <div class="page-container">
    <h2 class="page-title">生成族谱文档</h2>
    <p class="page-desc">将家族的族谱数据生成可视化的 PDF 文档，支持多种排版风格与历史版本管理</p>

    <div class="form-grid">
      <ElCard class="form-card">
        <template #header>基础信息</template>
        <ElForm :model="form" label-position="top">
          <ElFormItem label="版本名称" required>
            <ElInput v-model="form.version_name" placeholder="如：族谱·2026版" maxlength="200" show-word-limit />
          </ElFormItem>
          <ElFormItem label="范围">
            <ElRadioGroup v-model="form.branch">
              <ElRadioButton value="">全族</ElRadioButton>
              <ElRadioButton v-for="b in branchOptions" :key="b" :value="b">{{ b }}</ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="世代范围（可选）">
            <div class="generation-range">
              <ElInputNumber v-model="form.generation_start" :min="1" :max="50" placeholder="起始" />
              <span class="separator">至</span>
              <ElInputNumber v-model="form.generation_end" :min="1" :max="50" placeholder="结束" />
              <span class="hint">留空则包含所有世代</span>
            </div>
          </ElFormItem>
          <ElFormItem label="封面图片 URL（可选）">
            <ElInput v-model="form.cover_image_url" placeholder="可填写 COS 图片地址" />
          </ElFormItem>
        </ElForm>
      </ElCard>

      <ElCard class="form-card">
        <template #header>
          <div class="card-header">
            <span>排版风格</span>
            <span class="card-tip">点击下方卡片选择风格</span>
          </div>
        </template>
        <div class="style-grid">
          <div
            v-for="opt in styleOptions"
            :key="opt.value"
            class="style-tile"
            :class="{ active: form.style === opt.value }"
            @click="form.style = opt.value"
          >
            <!-- 选中状态标记 -->
            <div class="style-tile__check">
              <ElIcon :size="14"><CircleCheckFilled /></ElIcon>
            </div>

            <!-- 预览图区域 -->
            <div class="style-preview">
              <!-- 传统悬挂式：树状世系图 -->
              <svg v-if="opt.value === 'traditional'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <!-- 顶部双线边框 -->
                <rect x="2" y="2" width="196" height="196" fill="#FBF6EC" stroke="#8D6E63" stroke-width="2" />
                <rect x="6" y="6" width="188" height="188" fill="none" stroke="#8D6E63" stroke-width="0.5" />
                <!-- 根节点 -->
                <rect x="80" y="20" width="40" height="22" fill="#FFF" stroke="#5D4037" stroke-width="1.5" rx="2" />
                <text x="100" y="34" text-anchor="middle" font-size="9" fill="#5D4037" font-weight="bold">始祖</text>
                <!-- 连线 -->
                <line x1="100" y1="42" x2="100" y2="52" stroke="#5D4037" stroke-width="1" />
                <line x1="50" y1="52" x2="150" y2="52" stroke="#5D4037" stroke-width="1" />
                <line x1="50" y1="52" x2="50" y2="62" stroke="#5D4037" stroke-width="1" />
                <line x1="150" y1="52" x2="150" y2="62" stroke="#5D4037" stroke-width="1" />
                <!-- 二代 -->
                <rect x="30" y="62" width="40" height="22" fill="#FFF" stroke="#5D4037" stroke-width="1.2" rx="2" />
                <text x="50" y="76" text-anchor="middle" font-size="9" fill="#5D4037">二世</text>
                <rect x="130" y="62" width="40" height="22" fill="#FFF" stroke="#5D4037" stroke-width="1.2" rx="2" />
                <text x="150" y="76" text-anchor="middle" font-size="9" fill="#5D4037">二世</text>
                <!-- 连线 -->
                <line x1="50" y1="84" x2="50" y2="94" stroke="#5D4037" stroke-width="1" />
                <line x1="150" y1="84" x2="150" y2="94" stroke="#5D4037" stroke-width="1" />
                <line x1="20" y1="94" x2="80" y2="94" stroke="#5D4037" stroke-width="1" />
                <line x1="120" y1="94" x2="180" y2="94" stroke="#5D4037" stroke-width="1" />
                <!-- 三代 -->
                <rect x="10" y="94" width="30" height="20" fill="#FFF" stroke="#5D4037" stroke-width="1" rx="2" />
                <text x="25" y="107" text-anchor="middle" font-size="8" fill="#5D4037">三</text>
                <rect x="45" y="94" width="30" height="20" fill="#FFF" stroke="#5D4037" stroke-width="1" rx="2" />
                <text x="60" y="107" text-anchor="middle" font-size="8" fill="#5D4037">三</text>
                <rect x="120" y="94" width="30" height="20" fill="#FFF" stroke="#5D4037" stroke-width="1" rx="2" />
                <text x="135" y="107" text-anchor="middle" font-size="8" fill="#5D4037">三</text>
                <rect x="155" y="94" width="30" height="20" fill="#FFF" stroke="#5D4037" stroke-width="1" rx="2" />
                <text x="170" y="107" text-anchor="middle" font-size="8" fill="#5D4037">三</text>
                <!-- 底部装饰 -->
                <line x1="20" y1="130" x2="180" y2="130" stroke="#C9A96E" stroke-width="0.5" />
                <text x="100" y="150" text-anchor="middle" font-size="10" fill="#8D6E63" font-weight="bold" letter-spacing="4">朱氏世系</text>
                <text x="100" y="170" text-anchor="middle" font-size="7" fill="#A1887F">传承有序·源远流长</text>
                <text x="100" y="185" text-anchor="middle" font-size="6" fill="#A1887F">—  二〇二六年  —</text>
              </svg>

              <!-- 现代图文混排：网格相册 -->
              <svg v-else-if="opt.value === 'modern'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <!-- 页面边框 -->
                <rect x="6" y="6" width="188" height="188" fill="#FFFFFF" stroke="#E4E7ED" stroke-width="1" />
                <!-- 顶部封面区 -->
                <rect x="6" y="6" width="188" height="36" fill="#409EFF" />
                <text x="100" y="22" text-anchor="middle" font-size="10" fill="#FFFFFF" font-weight="bold" letter-spacing="2">家族纪念册</text>
                <text x="100" y="34" text-anchor="middle" font-size="6" fill="#C0D8F5">Family Album · 2026</text>
                <!-- 2列网格 -->
                <!-- 卡片1 -->
                <rect x="14" y="50" width="84" height="60" fill="#F5F7FA" stroke="#E4E7ED" stroke-width="0.5" rx="2" />
                <circle cx="34" cy="72" r="11" fill="#409EFF" opacity="0.85" />
                <text x="34" y="76" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold">张</text>
                <text x="50" y="70" font-size="6" fill="#303133" font-weight="bold">张三</text>
                <text x="50" y="78" font-size="4" fill="#909399">1892-1965</text>
                <line x1="18" y1="86" x2="94" y2="86" stroke="#E4E7ED" stroke-width="0.5" />
                <text x="18" y="95" font-size="4" fill="#606266">字辈：明德</text>
                <text x="18" y="103" font-size="4" fill="#909399">配李氏·子二</text>
                <!-- 卡片2 -->
                <rect x="104" y="50" width="84" height="60" fill="#F5F7FA" stroke="#E4E7ED" stroke-width="0.5" rx="2" />
                <circle cx="124" cy="72" r="11" fill="#67C23A" opacity="0.85" />
                <text x="124" y="76" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold">李</text>
                <text x="140" y="70" font-size="6" fill="#303133" font-weight="bold">李四</text>
                <text x="140" y="78" font-size="4" fill="#909399">1895-1972</text>
                <line x1="108" y1="86" x2="184" y2="86" stroke="#E4E7ED" stroke-width="0.5" />
                <text x="108" y="95" font-size="4" fill="#606266">字辈：明德</text>
                <text x="108" y="103" font-size="4" fill="#909399">配王氏·子一</text>
                <!-- 卡片3 -->
                <rect x="14" y="118" width="84" height="60" fill="#F5F7FA" stroke="#E4E7ED" stroke-width="0.5" rx="2" />
                <circle cx="34" cy="140" r="11" fill="#E6A23C" opacity="0.85" />
                <text x="34" y="144" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold">王</text>
                <text x="50" y="138" font-size="6" fill="#303133" font-weight="bold">王五</text>
                <text x="50" y="146" font-size="4" fill="#909399">1920-1998</text>
                <line x1="18" y1="154" x2="94" y2="154" stroke="#E4E7ED" stroke-width="0.5" />
                <text x="18" y="163" font-size="4" fill="#606266">字辈：世昌</text>
                <text x="18" y="171" font-size="4" fill="#909399">配赵氏·子三</text>
                <!-- 卡片4 -->
                <rect x="104" y="118" width="84" height="60" fill="#F5F7FA" stroke="#E4E7ED" stroke-width="0.5" rx="2" />
                <circle cx="124" cy="140" r="11" fill="#F56C6C" opacity="0.85" />
                <text x="124" y="144" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold">赵</text>
                <text x="140" y="138" font-size="6" fill="#303133" font-weight="bold">赵六</text>
                <text x="140" y="146" font-size="4" fill="#909399">1923-2010</text>
                <line x1="108" y1="154" x2="184" y2="154" stroke="#E4E7ED" stroke-width="0.5" />
                <text x="108" y="163" font-size="4" fill="#606266">字辈：世昌</text>
                <text x="108" y="171" font-size="4" fill="#909399">配孙氏·子二</text>
                <!-- 页脚 -->
                <text x="100" y="190" text-anchor="middle" font-size="5" fill="#909399">— 第 1 页 —</text>
              </svg>

              <!-- 简约列表式：表格 -->
              <svg v-else viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <!-- 页面边框 -->
                <rect x="10" y="10" width="180" height="180" fill="#FFFFFF" stroke="#303133" stroke-width="0.8" />
                <!-- 标题栏 -->
                <rect x="10" y="10" width="180" height="22" fill="#303133" />
                <text x="100" y="25" text-anchor="middle" font-size="9" fill="#FFFFFF" font-weight="bold" letter-spacing="2">成员清单</text>
                <!-- 表头 -->
                <rect x="10" y="32" width="180" height="14" fill="#F0F2F5" />
                <line x1="10" y1="32" x2="190" y2="32" stroke="#303133" stroke-width="0.5" />
                <line x1="10" y1="46" x2="190" y2="46" stroke="#303133" stroke-width="0.5" />
                <text x="24" y="42" font-size="6" fill="#303133" font-weight="bold">序号</text>
                <text x="60" y="42" font-size="6" fill="#303133" font-weight="bold">姓名</text>
                <text x="100" y="42" font-size="6" fill="#303133" font-weight="bold">世代</text>
                <text x="135" y="42" font-size="6" fill="#303133" font-weight="bold">生年</text>
                <text x="170" y="42" font-size="6" fill="#303133" font-weight="bold">卒年</text>
                <!-- 列分隔线 -->
                <line x1="40" y1="32" x2="40" y2="186" stroke="#E4E7ED" stroke-width="0.3" />
                <line x1="80" y1="32" x2="80" y2="186" stroke="#E4E7ED" stroke-width="0.3" />
                <line x1="120" y1="32" x2="120" y2="186" stroke="#E4E7ED" stroke-width="0.3" />
                <line x1="150" y1="32" x2="150" y2="186" stroke="#E4E7ED" stroke-width="0.3" />
                <!-- 数据行 -->
                <g v-for="(row, i) in [
                  ['1', '始祖公', '一', '1860', '1928'],
                  ['2', '张大', '二', '1882', '1955'],
                  ['3', '张二', '二', '1885', '1960'],
                  ['4', '张明', '三', '1908', '1982'],
                  ['5', '张德', '三', '1912', '1990'],
                  ['6', '张昌', '四', '1935', '2008'],
                  ['7', '张盛', '四', '1938', '2015'],
                  ['8', '张华', '五', '1965', '—'],
                  ['9', '张辉', '五', '1968', '—'],
                  ['10', '张小', '五', '1972', '—'],
                ]" :key="i">
                  <rect
                    v-if="i % 2 === 1"
                    :x="10"
                    :y="46 + i * 14"
                    width="180"
                    height="14"
                    fill="#FAFBFC"
                  />
                  <line x1="10" :y1="46 + (i + 1) * 14" x2="190" :y2="46 + (i + 1) * 14" stroke="#E4E7ED" stroke-width="0.3" />
                  <text x="24" :y="56 + i * 14" font-size="5.5" fill="#606266">{{ row[0] }}</text>
                  <text x="48" :y="56 + i * 14" font-size="5.5" fill="#303133">{{ row[1] }}</text>
                  <text x="100" :y="56 + i * 14" font-size="5.5" fill="#606266" text-anchor="middle">{{ row[2] }}</text>
                  <text x="135" :y="56 + i * 14" font-size="5.5" fill="#606266" text-anchor="middle">{{ row[3] }}</text>
                  <text x="170" :y="56 + i * 14" font-size="5.5" fill="#606266" text-anchor="middle">{{ row[4] }}</text>
                </g>
              </svg>
            </div>

            <!-- 标题与描述 -->
            <div class="style-info">
              <div class="style-info__title">
                <span class="style-info__label">{{ opt.label }}</span>
                <span class="style-info__sub">{{ opt.subLabel }}</span>
              </div>
              <div class="style-info__desc">{{ opt.desc }}</div>
            </div>

            <!-- 单选控件 -->
            <ElRadio v-model="form.style" :value="opt.value" class="style-radio">
              选中此风格
            </ElRadio>
          </div>
        </div>
      </ElCard>

      <ElCard class="form-card">
        <template #header>内容包含</template>
        <ElCheckboxGroup v-model="form.include_options">
          <ElCheckbox :label="true" :value="true">人物基本信息（姓名、生卒、字辈）</ElCheckbox>
          <ElCheckbox :value="false" label="spouse_info">配偶信息</ElCheckbox>
          <ElCheckbox :value="false" label="children_list">子女列表</ElCheckbox>
          <ElCheckbox label="bio_text">生平简介</ElCheckbox>
          <ElCheckbox label="photo">照片（优先使用正式肖像）</ElCheckbox>
          <ElCheckbox label="migration">迁徙记录</ElCheckbox>
        </ElCheckboxGroup>
      </ElCard>

      <ElCard class="action-card">
        <ElButton
          type="primary"
          size="large"
          :loading="generating"
          @click="handleGenerate"
        >
          生成预览
        </ElButton>
        <ElButton
          v-if="lastResult"
          size="large"
          @click="handleDownload"
        >
          下载 PDF
        </ElButton>
        <ElButton
          v-if="lastResult"
          type="success"
          size="large"
          @click="handleOrderPrint"
        >
          下单印刷
        </ElButton>
      </ElCard>

      <ElCard v-if="lastResult" class="result-card">
        <template #header>生成结果</template>
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="版本号">v{{ lastResult.version_number }}</ElDescriptionsItem>
          <ElDescriptionsItem label="页数">{{ lastResult.page_count }}</ElDescriptionsItem>
          <ElDescriptionsItem label="文件大小">
            {{ ((lastResult.file_size ?? 0) / 1024 / 1024).toFixed(2) }} MB
          </ElDescriptionsItem>
          <ElDescriptionsItem label="风格">{{ lastResult.style }}</ElDescriptionsItem>
          <ElDescriptionsItem label="生成时间" :span="2">
            {{ new Date(lastResult.created_at).toLocaleString('zh-CN') }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <div v-if="lastResult.file_url" class="preview-frame">
          <iframe :src="lastResult.file_url" frameborder="0" class="pdf-preview" />
        </div>
      </ElCard>
    </div>
  </div>
</template>

<style scoped>
.page-container { max-width: 1200px; margin: 0 auto; }
.page-title { margin: 0 0 8px; font-size: 22px; color: #303133; }
.page-desc { margin: 0 0 24px; color: #909399; font-size: 14px; }
.form-grid { display: flex; flex-direction: column; gap: 16px; }
.generation-range { display: flex; align-items: center; gap: 12px; }
.separator { color: #909399; }
.hint { font-size: 12px; color: #909399; }
.style-options { display: flex; flex-direction: row; gap: 16px; width: 100%; }
.style-option { margin-right: 0 !important; }
.style-card { padding: 4px 0; text-align: left; }
.style-label { font-weight: 600; }
.style-desc { font-size: 12px; color: #909399; margin-top: 4px; }
.action-card { display: flex; gap: 12px; justify-content: center; }
.preview-frame { margin-top: 16px; }
.pdf-preview { width: 100%; height: 600px; border: 1px solid #ebeef5; border-radius: 4px; }

/* 排版风格选择器：三列横排 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.card-tip {
  font-size: 12px;
  font-weight: normal;
  color: #909399;
}
.style-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 4px;
}
.style-tile {
  position: relative;
  border: 2px solid #E4E7ED;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #FAFBFC;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.style-tile:hover {
  border-color: #C0C4CC;
  background-color: #F5F7FA;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.style-tile.active {
  border-color: #5D4037;
  background-color: #FBF6EC;
  box-shadow: 0 4px 16px rgba(93, 64, 55, 0.18);
}
.style-tile__check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: #FFF;
  border: 1.5px solid #DCDFE6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFF;
  transition: all 0.2s ease;
  z-index: 2;
}
.style-tile.active .style-tile__check {
  background-color: #67C23A;
  border-color: #67C23A;
}
.style-preview {
  background-color: #FFF;
  border-radius: 4px;
  border: 1px solid #E4E7ED;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.style-preview svg {
  width: 100%;
  height: 100%;
  display: block;
}
.style-info {
  margin-top: 12px;
}
.style-info__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.style-info__label {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.style-info__sub {
  font-size: 12px;
  color: #909399;
  background-color: #F0F2F5;
  padding: 1px 8px;
  border-radius: 10px;
}
.style-info__desc {
  font-size: 12px;
  color: #606266;
  margin-top: 6px;
  line-height: 1.6;
}
.style-radio {
  margin-top: 12px;
  margin-right: 0;
  justify-content: center;
  width: 100%;
  display: flex;
}
@media (max-width: 992px) {
  .style-grid { grid-template-columns: 1fr; }
}
</style>
