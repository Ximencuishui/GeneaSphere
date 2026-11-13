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
  ocrProvider?: string;
  ocrEstimatedFee?: number;
  ocrPrecheck?: OcrPrecheckResult;
  ocrFeeDetail?: OcrFeeDetail;
  ocrCharsCount?: number;
  importResult?: {
    successCount: number;
    failureCount: number;
    errors: string[];
    anchorPersonId?: string;
    skippedCount?: number;
  };
  progress?: PdfParseProgress | null;
}

export interface PdfPersonRecord {
  rowNumber: number;
  localId?: string;
  fullName: string;
  gender?: 'M' | 'F' | 'UNKNOWN';
  generation?: number;
  birthDate?: string;
  deathDate?: string;
  isLiving?: boolean;
  parentName?: string;
  parentLocalId?: string;
  motherName?: string;
  motherLocalId?: string;
  spouseName?: string;
  spouseLocalId?: string;
  biography?: string;
  burialPlace?: string;
  notes?: string;
  confidenceScore: number;
  originalText?: string;
  pageNumber?: number;
  parseWarning?: string;
}

export interface PdfUploadResult {
  success: boolean;
  taskId: string;
  message: string;
  queued?: boolean;
  queuePosition?: number;
}

export interface PdfPreviewResult {
  taskId: string;
  totalRecords: number;
  records: PdfPersonRecord[];
}

export interface PdfExecuteResult {
  success: boolean;
  message: string;
  successCount: number;
  failureCount: number;
  skippedCount?: number;
  mergedCount?: number;
  errors: string[];
  needsDuplicateChoice?: boolean;
  duplicates?: Array<{ fullName: string; count: number; rowNumbers: number[] }>;
  anchorPersonId?: string;
  ocrFeeDetail?: OcrFeeDetail;
  ocrEstimatedFee?: number;
}

/**
 * 上传 PDF。request 拦截器已解包响应体。
 */
export function uploadPdf(file: File, clanSlug: string, forceOcr = false) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('clan_slug', clanSlug);
  if (forceOcr) {
    formData.append('force_ocr', 'true');
  }

  return request.post<PdfUploadResult, PdfUploadResult>('/api/import/pdf/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 300000,
  });
}

export interface PdfParseProgress {
  phase: 'reading' | 'ocr' | 'extracting' | 'done';
  currentPage: number;
  totalPages: number;
  message: string;
}

export function getTaskProgress(taskId: string) {
  return request.get<{ taskId: string; status: string; parseMode: string; progress: PdfParseProgress }>(
    `/api/import/pdf/task/${taskId}/progress`,
  );
}

export function getTaskPageImage(taskId: string, page: number) {
  return request.get<{ page: number; totalPages: number; contentType: string; dataUrl: string }>(
    `/api/import/pdf/task/${taskId}/page/${page}`,
  );
}

export function getTaskStatus(taskId: string) {
  return request.get<PdfImportTask, PdfImportTask>(`/api/import/pdf/task/${taskId}/status`);
}

export function getTaskPreview(taskId: string) {
  return request.get<PdfPreviewResult, PdfPreviewResult>(`/api/import/pdf/task/${taskId}/preview`);
}

export function submitCorrection(taskId: string, records: PdfPersonRecord[]) {
  return request.put(`/api/import/pdf/task/${taskId}/correct`, {
    records,
  });
}

export function executeImport(
  taskId: string,
  clanSlug: string,
  records: PdfPersonRecord[],
  duplicateStrategy?: 'skip' | 'merge' | 'create',
) {
  return request.post<PdfExecuteResult, PdfExecuteResult>(`/api/import/pdf/task/${taskId}/execute`, {
    clan_slug: clanSlug,
    records,
    duplicate_strategy: duplicateStrategy,
  }, {
    timeout: 120000,
  });
}
