import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PublicPlatform } from './public.decorator';
import { PlatformLoginDto } from './dto/login.dto';

@ApiTags('platform/auth')
@Controller('api/platform/auth')
export class PlatformAuthController {
  constructor(private readonly authService: PlatformAuthService) {}

  @PublicPlatform()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '平台管理员登录' })
  async login(@Body() dto: PlatformLoginDto, @Request() req: any) {
    return this.authService.login(dto, req);
  }

  @UseGuards(PlatformAuthGuard)
  @ApiBearerAuth('platform')
  @Get('profile')
  @ApiOperation({ summary: '获取当前管理员信息' })
  async profile(@Request() req: any) {
    return this.authService.getProfile(req.user.adminId);
  }

  @UseGuards(PlatformAuthGuard)
  @ApiBearerAuth('platform')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '平台管理员退出登录' })
  async logout(@Request() req: any) {
    return this.authService.logout(req.user.adminId, req);
  }
}
