import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FamilyRelationService } from './family-relation.service';
import { UpdateMarriageDto } from './dto/update-marriage.dto';
import { UpdateSpouseDto } from './dto/update-spouse.dto';
import { AddChildDto } from './dto/add-child.dto';
import { UpdateCustodyDto } from './dto/update-custody.dto';
import { UpdatePrivacyPreferenceDto } from './dto/privacy-preference.dto';
import { QueryHistoryDto } from './dto/query-history.dto';

@ApiTags('family-relation')
@Controller('api/family-relation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FamilyRelationController {
  constructor(private readonly service: FamilyRelationService) {}

  @Get('my-person')
  @ApiOperation({ summary: '获取当前用户关联的本人 Person' })
  async getMyPerson(@Request() req) {
    return this.service.resolveOwnPerson(req.user.userId);
  }

  @Get('persons/:personId/current')
  @ApiOperation({ summary: '获取指定 person 的当前家庭关系' })
  async getCurrent(@Request() req, @Param('personId') personId: string) {
    return this.service.getCurrentRelationship(BigInt(personId), req.user.userId);
  }

  @Get('history')
  @ApiOperation({ summary: '获取我的家庭关系变更历史' })
  async getHistory(@Request() req, @Query() query: QueryHistoryDto) {
    return this.service.getHistory(req.user.userId, query);
  }

  @Post('marriage')
  @ApiOperation({ summary: '更新婚姻状态' })
  async updateMarriage(@Request() req, @Body() dto: UpdateMarriageDto) {
    return this.service.updateMarriageStatus(req.user.userId, dto);
  }

  @Post('spouse')
  @ApiOperation({ summary: '新增/解除/更换配偶' })
  async updateSpouse(@Request() req, @Body() dto: UpdateSpouseDto) {
    return this.service.updateSpouse(req.user.userId, dto);
  }

  @Post('child')
  @ApiOperation({ summary: '新增子女' })
  async addChild(@Request() req, @Body() dto: AddChildDto) {
    return this.service.addChild(req.user.userId, dto);
  }

  @Put('children/:childId/custody')
  @ApiOperation({ summary: '更新子女抚养关系' })
  async updateCustody(
    @Request() req,
    @Param('childId') childId: string,
    @Body() dto: UpdateCustodyDto,
  ) {
    return this.service.updateCustody(req.user.userId, childId, dto);
  }

  @Get('privacy')
  @ApiOperation({ summary: '获取隐私偏好设置' })
  async getPrivacy(@Request() req) {
    return this.service.getPrivacyPreference(req.user.userId);
  }

  @Put('privacy')
  @ApiOperation({ summary: '更新隐私偏好设置' })
  async updatePrivacy(@Request() req, @Body() dto: UpdatePrivacyPreferenceDto) {
    return this.service.updatePrivacyPreference(req.user.userId, dto);
  }
}
