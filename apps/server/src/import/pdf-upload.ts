import { BadRequestException } from '@nestjs/common';

const PDF_HEADER = Buffer.from('%PDF-');

/**
 * 扩展名和文件头都要像 PDF。只改文件名不能把图片或可执行文件送进解析器。
 */
export function assertPdfUpload(file: { originalname?: string; buffer?: Buffer } | undefined): void {
  if (!file?.buffer?.length) {
    throw new BadRequestException('请上传PDF文件');
  }
  if (!/\.pdf$/i.test(file.originalname || '')) {
    throw new BadRequestException('只允许上传 .pdf 文件');
  }
  const header = file.buffer.subarray(0, PDF_HEADER.length);
  if (!header.equals(PDF_HEADER)) {
    throw new BadRequestException('文件内容不是 PDF，仅修改扩展名无法通过校验');
  }
}
