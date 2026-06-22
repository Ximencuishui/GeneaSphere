import request from '@/utils/request';
import type { OcrFeeDetail, OcrPrecheckResult } from './ocr';

export interface PdfImportTask {
  taskId: string;
  status: 'pending' | 'parsing' | 'preview' | 'correcting' | 'importing' | 'completed' | 'failed';
  fileName: string;
  fileSize: number;
  parseMode: 'text' | 'ocr';
  totalPages: number;
  recordCount: number;
  metadata: Record<string, any>;
  errorMessage?: string;
  // ========== OCR 计费信息（v1.0 限免策略）==========
  ocrProvider?: string;
  ocrEstimatedFee?: number;
  ocrPrecheck?: OcrPrecheckResult;
  ocrFeeDetail?: OcrFeeDetail;
  ocrCharsCount?: number;
}

export interface PdfPersonRecord {
  rowNumber: number;
  fullName: string;
  gender?: 'M' | 'F' | 'UNKNOWN';
  generation?: number;
  birthDate?: string;
  deathDate?: string;
  isLiving?: boolean;
  parentName?: string;
  spouseName?: string;
  biography?: string;
  burialPlace?: string;
  notes?: string;
  confidenceScore: number;
  originalText?: string;
}

/**
 * 上传PDF文件
 */
export function uploadPdf(
  file: File,
  clanId: string | number,
  userId: string,
  forceOcr = false,
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('clan_id', String(clanId));
  formData.append('user_id', userId);
  if (forceOcr) {
    formData.append('force_ocr', 'true');
  }

  return request.post('/api/import/pdf/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 300000, // 5分钟超时
  });
}

/**
 * 查询任务状态
 */
export function getTaskStatus(taskId: string): Promise<{ data: PdfImportTask }> {
  return request.get(`/api/import/pdf/task/${taskId}/status`);
}

/**
 * 获取任务预览数据
 */
export function getTaskPreview(taskId: string): Promise<{
  data: {
    taskId: string;
    totalRecords: number;
    records: PdfPersonRecord[];
  };
}> {
  return request.get(`/api/import/pdf/task/${taskId}/preview`);
}

/**
 * 提交校对数据
 */
export function submitCorrection(taskId: string, records: PdfPersonRecord[]) {
  return request.put(`/api/import/pdf/task/${taskId}/correct`, {
    records,
  });
}

/**
 * 执行导入
 */
export function executeImport(taskId: string, userId: string, clanId: string | number) {
  return request.post(`/api/import/pdf/task/${taskId}/execute`, {
    user_id: userId,
    clan_id: String(clanId),
  });
}
