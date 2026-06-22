import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';
import { SettingsService, SETTING_KEYS } from './settings.service';

@ApiTags('platform/settings')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  @Get('pricing')
  @ApiOperation({ summary: '获取定价配置' })
  async getPricing() {
    return this.settings.get(SETTING_KEYS.PRICING);
  }

  @Put('pricing')
  @ApiOperation({ summary: '更新定价配置' })
  async updatePricing(@Body() body: any, @Request() req: any) {
    if (typeof body?.sms_unit_price !== 'number' || body.sms_unit_price < 0) {
      throw new BadRequestException('sms_unit_price 必须为非负数');
    }
    await this.settings.set(SETTING_KEYS.PRICING, body);
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UPDATE_PRICING',
      targetType: 'GlobalSetting',
      targetId: SETTING_KEYS.PRICING,
      detail: body,
      ipAddress: getClientIp(req),
    });
    return { message: '已更新' };
  }

  @Get('clan-defaults')
  @ApiOperation({ summary: '获取家族默认配置' })
  async getClanDefaults() {
    return this.settings.get(SETTING_KEYS.CLAN_DEFAULTS);
  }

  @Put('clan-defaults')
  @ApiOperation({ summary: '更新家族默认配置' })
  async updateClanDefaults(@Body() body: any, @Request() req: any) {
    await this.settings.set(SETTING_KEYS.CLAN_DEFAULTS, body);
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UPDATE_CLAN_DEFAULTS',
      targetType: 'GlobalSetting',
      targetId: SETTING_KEYS.CLAN_DEFAULTS,
      detail: body,
      ipAddress: getClientIp(req),
    });
    return { message: '已更新' };
  }

  @Get('switches')
  @ApiOperation({ summary: '获取全局开关' })
  async getSwitches() {
    return this.settings.get(SETTING_KEYS.FEATURE_SWITCHES);
  }

  @Put('switches')
  @ApiOperation({ summary: '更新全局开关' })
  async updateSwitches(@Body() body: any, @Request() req: any) {
    await this.settings.set(SETTING_KEYS.FEATURE_SWITCHES, body);
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UPDATE_FEATURE_SWITCHES',
      targetType: 'GlobalSetting',
      targetId: SETTING_KEYS.FEATURE_SWITCHES,
      detail: body,
      ipAddress: getClientIp(req),
    });
    return { message: '已更新' };
  }
}
