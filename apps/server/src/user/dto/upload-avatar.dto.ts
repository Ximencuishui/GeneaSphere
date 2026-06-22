import { IsString, IsIn } from 'class-validator';

export class UploadAvatarDto {
  @IsString()
  @IsIn(['data-url', 'file-path'])
  mode: 'data-url' | 'file-path';

  /** data-url 模式：base64 字符串（含前缀 data:image/...;base64,） */
  @IsString()
  data_url?: string;

  /** file-path 模式：已上传到服务器的临时文件路径 */
  @IsString()
  file_path?: string;
}