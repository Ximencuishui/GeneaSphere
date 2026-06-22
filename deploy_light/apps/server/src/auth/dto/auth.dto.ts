import { IsString, IsPhoneNumber, MinLength } from 'class-validator';

export class RegisterDto {
  @IsPhoneNumber('CN')
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class LoginDto {
  @IsPhoneNumber('CN')
  phone: string;

  @IsString()
  password: string;
}