import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { importExcel as importExcelApi } from '@/api/import';
import type { ImportResult, ColumnMapping } from '@/types';

export const useImportStore = defineStore('import', () => {
  // 状态
  const currentStep = ref(1); // 1: 上传, 2: 列映射, 3: 确认, 4: 完成
  const uploading = ref(false);
  const importResult = ref<ImportResult | null>(null);
  const error = ref<string | null>(null);

  // 上传的文件
  const uploadedFile = ref<File | null>(null);
  const fileColumns = ref<string[]>([]); // Excel 解析出的列名
  const previewData = ref<Record<string, any>[]>([]); // 预览数据（前 5 行）

  // 列映射配置
  const columnMapping = ref<ColumnMapping>({
    full_name: '', // 姓名
    gender: '', // 性别
    birth_date: '', // 出生日期
    death_date: '', // 死亡日期
    is_living: '', // 是否在世
    parent_name: '', // 父/母姓名（用于建立父子关系）
    spouse_name: '', // 配偶姓名
    generation: '', // 辈分/字辈
    description: '', // 简介
  });

  // 计算属性
  const isUploadStep = computed(() => currentStep.value === 1);
  const isMappingStep = computed(() => currentStep.value === 2);
  const isConfirmStep = computed(() => currentStep.value === 3);
  const isCompleteStep = computed(() => currentStep.value === 4);

  const canProceedToMapping = computed(() => uploadedFile.value !== null);
  
  const canProceedToConfirm = computed(() => {
    // 至少需要映射姓名和性别
    return columnMapping.value.full_name !== '' && columnMapping.value.gender !== '';
  });

  // 动作
  function setFile(file: File) {
    uploadedFile.value = file;
    error.value = null;
  }

  function setFileColumns(columns: string[], preview: Record<string, any>[]) {
    fileColumns.value = columns;
    previewData.value = preview;
    
    // 尝试自动映射列名
    autoMapColumns(columns);
  }

  /**
   * 自动映射列名（基于常见别名）
   */
  function autoMapColumns(columns: string[]) {
    const mappingRules: Record<string, string[]> = {
      full_name: ['姓名', '名字', '名称', 'full_name', 'name'],
      gender: ['性别', '男/女', 'gender', 'sex'],
      birth_date: ['出生日期', '出生', '生日', 'birth', 'birth_date'],
      death_date: ['死亡日期', '去世', '卒', 'death', 'death_date'],
      is_living: ['在世', '是否在世', 'living', 'is_living'],
      parent_name: ['父/母', '父母', '父亲', '母亲', 'parent', 'parent_name'],
      spouse_name: ['配偶', '妻子', '丈夫', 'spouse', 'spouse_name'],
      generation: ['辈分', '字辈', '代', 'generation', 'zi_bei'],
      description: ['简介', '描述', '说明', 'description', 'remark'],
    };

    for (const [field, aliases] of Object.entries(mappingRules)) {
      for (const col of columns) {
        const normalizedCol = col.trim().toLowerCase();
        if (aliases.some(alias => alias.toLowerCase() === normalizedCol)) {
          (columnMapping.value as any)[field] = col;
          break;
        }
      }
    }
  }

  function updateMapping(field: keyof ColumnMapping, value: string) {
    columnMapping.value[field] = value;
  }

  async function submitImport(clanId: string | number) {
    if (!uploadedFile.value) {
      error.value = '请先上传文件';
      return;
    }

    uploading.value = true;
    error.value = null;
    importResult.value = null;

    try {
      const result = await importExcelApi(
        uploadedFile.value,
        clanId,
        columnMapping.value
      );
      importResult.value = result.data || result;
      currentStep.value = 4; // 跳转到完成步骤
    } catch (err: any) {
      error.value = err.message || '导入失败，请重试';
    } finally {
      uploading.value = false;
    }
  }

  function nextStep() {
    if (currentStep.value < 4) {
      currentStep.value++;
    }
  }

  function prevStep() {
    if (currentStep.value > 1) {
      currentStep.value--;
    }
  }

  function reset() {
    currentStep.value = 1;
    uploadedFile.value = null;
    fileColumns.value = [];
    previewData.value = [];
    importResult.value = null;
    error.value = null;
    columnMapping.value = {
      full_name: '',
      gender: '',
      birth_date: '',
      death_date: '',
      is_living: '',
      parent_name: '',
      spouse_name: '',
      generation: '',
      description: '',
    };
  }

  return {
    // 状态
    currentStep,
    uploading,
    importResult,
    error,
    uploadedFile,
    fileColumns,
    previewData,
    columnMapping,
    
    // 计算属性
    isUploadStep,
    isMappingStep,
    isConfirmStep,
    isCompleteStep,
    canProceedToMapping,
    canProceedToConfirm,
    
    // 动作
    setFile,
    setFileColumns,
    updateMapping,
    submitImport,
    nextStep,
    prevStep,
    reset,
  };
});
