import { Controller, Post, Body, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { RegisterDto, LoginDto, SendSmsCodeDto } from './dto/auth.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private smsService: SmsService,
  ) {}

  @Public()
  @Post('send-sms-code')
  async sendSmsCode(@Body() dto: SendSmsCodeDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.smsService.sendVerifyCode(dto.phone, dto.purpose, ip);
  }

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('demo-login')
  async demoLogin() {
    return this.authService.demoLogin();
  }

  @Public()
  @Post('demo-member-login')
  async demoMemberLogin() {
    return this.authService.demoMemberLogin();
  }
}