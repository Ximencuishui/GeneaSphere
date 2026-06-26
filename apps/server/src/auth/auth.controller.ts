import { Controller, Post, Get, Body, Req, UseGuards, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { RegisterDto, LoginDto, SendSmsCodeDto } from './dto/auth.dto';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClanResolverService } from '../common/clan-resolver.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private smsService: SmsService,
    private clanResolver: ClanResolverService,
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

  /**
   * 多家族 SaaS：返回当前用户作为 OWNER/ADMIN 的所有家族（slug + name），
   * 前端据此跳转到家族选择器 / 直接进入某家族后台。
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/admin-clans')
  async myAdminClans(@Req() req: any) {
    const userId = req.user.userId;
    const clans = await this.authService.getAdminClans(userId);
    return { clans };
  }

  /**
   * 多家族 SaaS：把家族 slug 解析为元数据（id / name），
   * 前端路由守卫用来在进入 /zupu/:slug/* 前校验家族存在且可用。
   * 公开端点：避免先登录才能看到正确的家族信息。
   */
  @Public()
  @Get('clans/resolve')
  async resolveClan(@Query('slug') slug: string) {
    return await this.clanResolver.resolveOrThrow(slug);
  }
}