import request from '@/utils/request';

export interface OcrQuota {
  free_pages_total: number;
  free_pages_used: number;
  free_pages_remaining: number;
  free_chars_total: number;
  free_chars_used: number;
  free_chars_remaining: number;
  paid_balance: number;
  price_per_page: number;
  price_per_100_chars: number;
  ocr_reset_date: string;
  provider: string;
}

export interface OcrFeeDetail {
  pages_total: number;
  chars_total: number;
  free_pages_used: number;
  free_chars_used: number;
  charged_pages: number;
  charged_chars: number;
  fee_amount: number;
  fee_source: 'free' | 'paid' | 'mixed';
  paid_balance_after?: number;
}

export interface OcrPrecheckResult {
  estimated_fee: number;
  estimated_chargeable_pages: number;
  estimated_free_pages_used: number;
  current_paid_balance: number;
  sufficient: boolean;
  message?: string;
}

export interface OcrUsageItem {
  id: string;
  task_id: string | null;
  pages_total: number;
  chars_total: number;
  free_pages_used: number;
  free_chars_used: number;
  charged_pages: number;
  charged_chars: number;
  fee_amount: number;
  fee_source: string;
  status: string;
  created_at: string;
}

/**
 * OCR 相关 API
 */
export const ocrApi = {
  /** 查询当前用户 OCR 免费额度与已用量 */
  getQuota: () => request.get<OcrQuota, OcrQuota>('/user/ocr/quota'),

  /** OCR 使用历史（分页） */
  getUsage: (page = 1, pageSize = 20) =>
    request.get<any, { data: OcrUsageItem[]; total: number }>(
      '/user/ocr/usage',
      { params: { page, pageSize } },
    ),

  /** 预检费用（PDF 导入前） */
  getPdfQuota: () => request.get<OcrQuota, OcrQuota>('/import/pdf/quota'),
};

export default ocrApi;