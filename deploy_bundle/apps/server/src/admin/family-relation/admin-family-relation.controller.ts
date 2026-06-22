import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminFamilyRelationService } from './admin-family-relation.service';

@ApiTags('admin-family-relation')
@Controller('api/admin/family-relation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminFamilyRelationController {
  constructor(private readonly service: AdminFamilyRelationService) {}

  @Get('changes')
  @ApiOperation({ summary: '审核队列列表' })
  async listChanges(
    @Request() req,
    @Query('clanId') clanId: string,
    @Query('status') status?: string,
    @Query('change_type') changeType?: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.service.listChanges(req.user.userId, {
      clanId,
      status,
      changeType,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @Get('changes/:id')
  @ApiOperation({ summary: '变更详情' })
  async getChange(@Request() req, @Param('id') id: string) {
    return this.service.getChange(req.user.userId, id);
  }

  @Post('changes/:id/approve')
  @ApiOperation({ summary: '通过变更' })
  async approveChange(@Request() req, @Param('id') id: string) {
    return this.service.approveChange(req.user.userId, id);
  }

  @Post('changes/:id/reject')
  @ApiOperation({ summary: '驳回变更' })
  async rejectChange(
    @Request() req,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.service.rejectChange(req.user.userId, id, reason);
  }

  @Post('changes/:id/manual')
  @ApiOperation({ summary: '标记为需线下确认' })
  async markManual(@Request() req, @Param('id') id: string) {
    return this.service.markManual(req.user.userId, id);
  }

  @Get('disputes')
  @ApiOperation({ summary: '争议列表' })
  async listDisputes(@Request() req, @Query('clanId') clanId: string) {
    return this.service.listDisputes(req.user.userId, clanId);
  }

  @Post('disputes/:id/resolve')
  @ApiOperation({ summary: '解决争议' })
  async resolveDispute(
    @Request() req,
    @Param('id') id: string,
    @Body('custody_status') custodyStatus: string,
  ) {
    return this.service.resolveDispute(req.user.userId, id, custodyStatus);
  }
}
