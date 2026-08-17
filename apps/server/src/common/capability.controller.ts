import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityService } from './capability.service';
import { Public } from '../auth/public.decorator';

@ApiTags('capabilities')
@ApiBearerAuth()
@Controller('api/capabilities')
export class CapabilityController {
  constructor(private readonly capabilities: CapabilityService) {}

  @Get()
  @Public() // 功能开关属公开配置，家族端与平台端均可无鉴权读取（否则平台端无 family token 会 401）
  @ApiOperation({ summary: '获取需要外部服务的功能可用状态' })
  list() {
    return { data: this.capabilities.listStatuses() };
  }
}
