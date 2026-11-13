import { BadRequestException } from '@nestjs/common';

/**
 * 密码保护和可捕获的内存分配失败不能按普通坏页跳过。
 * V8 的致命 OOM 会直接终止进程，进不了这些函数。
 */
export function isUnrecoverablePdfError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  return /password|encrypted|needpassword|allocation failed|out of memory|heap out of memory|array buffer allocation/i.test(
    `${name} ${message}`,
  );
}

/**
 * 把 PDF 库和 OCR 引擎抛出的原始异常收成给用户看的提示。
 */
export function toImportFileError(error: unknown): BadRequestException {
  if (error instanceof BadRequestException) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  const blob = `${name} ${message}`;
  if (/password|encrypted|needpassword/i.test(blob)) {
    return new BadRequestException('该 PDF 受密码保护，请解除密码后重新上传');
  }
  if (/allocation failed|out of memory|heap out of memory|array buffer allocation/i.test(blob)) {
    return new BadRequestException('文件过大，解析时内存不足。请拆成较小的 PDF 后重新上传');
  }
  return new BadRequestException(
    message
      ? `PDF文件已损坏或无法读取：${message}`
      : 'PDF文件已损坏或无法读取，请确认文件完整后重新上传',
  );
}
