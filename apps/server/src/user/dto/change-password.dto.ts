import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  old_password: string;

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @Matches(/[A-Za-z]/, { message: '新密码需包含字母' })
  @Matches(/\d/, { message: '新密码需包含数字' })
  new_password: string;

  @IsString()
  confirm_password: string;
}