import { BadRequestException } from '@nestjs/common';
import { PdfImportController } from './pdf-import.controller';
import { assertPdfUpload } from './pdf-upload';

jest.mock('../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../auth/jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('../admin/admin.service', () => ({ AdminService: class AdminService {} }));

describe('PDF 上传类型校验', () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');

  it('拒绝非 .pdf 扩展名', () => {
    expect(() => assertPdfUpload({ originalname: 'scan.png', buffer: pdf })).toThrow(
      '只允许上传 .pdf 文件',
    );
  });

  it('拒绝只改了扩展名的非 PDF', () => {
    expect(() =>
      assertPdfUpload({ originalname: 'photo.pdf', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
    ).toThrow('文件内容不是 PDF');
  });

  it('控制器在建任务前拦住伪造扩展名，且不调用创建任务', async () => {
    const createImportTask = jest.fn();
    const controller = new PdfImportController(
      { createImportTask } as never,
      {} as never,
      { requireAdminBySlug: jest.fn() } as never,
    );

    await expect(
      controller.uploadPdf(
        { user: { userId: 'user-1' } },
        { originalname: 'photo.pdf', buffer: Buffer.from('not-a-pdf') } as never,
        'zhuxi-demo',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createImportTask).not.toHaveBeenCalled();
  });

  it('合法文件头可以通过校验', () => {
    expect(() => assertPdfUpload({ originalname: 'clan.PDF', buffer: pdf })).not.toThrow();
  });
});
