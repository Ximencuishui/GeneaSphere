import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilityService } from './capability.service';

@ApiTags('capabilities')
@ApiBearerAuth()
@Controller('api/capabilities')
export class CapabilityController {
  constructor(private readonly capabilities: CapabilityService) {}

  @Get()
  @ApiOperation({ summary: '获取需要外部服务的功能可用状态' })
  list() {
    return { data: this.capabilities.listStatuses() };
  }
}
