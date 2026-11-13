import { BadRequestException } from '@nestjs/common';
import { PdfTextParserService } from './pdf-text-parser.service';
import { isUnrecoverablePdfError, toImportFileError } from './pdf-file-error';

jest.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() {
      throw new Error('PasswordException: needpassword');
    }
  },
}));

describe('PDF 异常文件提示', () => {
  it('加密 PDF 返回解除密码的提示', () => {
    const error = toImportFileError(new Error('PasswordException: needpassword'));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('该 PDF 受密码保护，请解除密码后重新上传');
    expect(isUnrecoverablePdfError(new Error('PDF is encrypted'))).toBe(true);
  });

  it('损坏的 PDF 返回无法读取的提示', () => {
    const error = toImportFileError(new Error('Invalid PDF structure'));
    expect(error.message).toBe('PDF文件已损坏或无法读取：Invalid PDF structure');
  });
  it('可捕获的内存分配失败返回拆分文件的提示，而不是引擎原文', () => {
    const error = toImportFileError(new Error('Array buffer allocation failed'));
    expect(error.message).toBe('文件过大，解析时内存不足。请拆成较小的 PDF 后重新上传');
  });

  it('预检遇到加密 PDF 时转成解除密码的提示', async () => {
    const parser = new PdfTextParserService({} as never);
    await expect(parser.assessPdf(Buffer.from('%PDF-1.7'))).rejects.toThrow(
      '该 PDF 受密码保护，请解除密码后重新上传',
    );
  });
});
