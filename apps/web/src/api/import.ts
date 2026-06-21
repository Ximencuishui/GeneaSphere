import request from '@/utils/request';
import type { ImportResult, ColumnMapping } from '@/types';

/**
 * 导入 Excel 文件
 * @param file Excel 文件
 * @param clanId 家族 ID
 * @param columnMapping 列映射配置（可选，后端会自动推断）
 */
export function importExcel(
  file: File,
  clanId: string | number,
  columnMapping?: ColumnMapping
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('clan_id', String(clanId));
  
  if (columnMapping) {
    formData.append('column_mapping', JSON.stringify(columnMapping));
  }

  return request.post('/api/import/excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 300000, // 5 分钟超时，大文件需要更长时间
  });
}

/**
 * 获取导入模板
 */
export function getImportTemplate() {
  return request.get('/api/import/template', {
    responseType: 'blob',
  });
}

/**
 * 获取导入历史记录
 * @param clanId 家族 ID
 */
export function getImportHistory(clanId: string | number) {
  return request.get('/api/import/history', {
    params: { clan_id: clanId },
  });
}
