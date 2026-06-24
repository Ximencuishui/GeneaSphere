import { IsString, IsPhoneNumber, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsPhoneNumber('CN')
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  smsCode?: string;
}

export class LoginDto {
  @IsPhoneNumber('CN')
  phone: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  smsCode?: string;
}

export class SendSmsCodeDto {
  @IsPhoneNumber('CN')
  phone: string;

  @IsString()
  purpose: 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD' | 'BIND_PHONE';
}