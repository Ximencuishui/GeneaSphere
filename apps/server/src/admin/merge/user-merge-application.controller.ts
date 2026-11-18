import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@ApiTags('merge-applications')
@Controller('api/merge-applications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserMergeApplicationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List my kinship applications' })
  async listMine(@Request() req) {
    const userId = this.requireUser(req);
    const rows = await this.prisma.mergeApplication.findMany({
      where: { applicant_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        clan_id: true,
        applicant_id: true,
        applicant_clan_id: true,
        branch_root_person_id: true,
        origin_place: true,
        xipai_info: true,
        ancestor_name: true,
        migration_history: true,
        status: true,
        created_at: true,
      },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        id: row.id.toString(),
        clan_id: row.clan_id.toString(),
        applicant_clan_id: row.applicant_clan_id?.toString() ?? null,
        branch_root_person_id: row.branch_root_person_id?.toString() ?? null,
      })),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a kinship application' })
  async create(
    @Request() req,
    @Body() body: {
      clan_id?: string;
      origin_place?: string;
      xipai_info?: string[];
      ancestor_name?: string;
      migration_history?: string;
      applicant_clan_id?: string;
      branch_root_person_id?: string;
    },
  ) {
    const userId = this.requireUser(req);
    if (!body.clan_id) {
      throw new BadRequestException('clan_id 必填');
    }
    const originPlace = body.origin_place?.trim();
    if (!originPlace) {
      throw new BadRequestException('origin_place 必填');
    }
    if (body.xipai_info != null && !Array.isArray(body.xipai_info)) {
      throw new BadRequestException('xipai_info 必须是数组');
    }

    const clanId = BigInt(body.clan_id);
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) {
      throw new NotFoundException('受理家族不存在');
    }

    let applicantClanId: bigint | null = null;
    if (body.applicant_clan_id) {
      applicantClanId = BigInt(body.applicant_clan_id);
      if (applicantClanId === clanId) {
        throw new BadRequestException('申请方家族不能与受理方相同');
      }
      const applicantClan = await this.prisma.clan.findUnique({ where: { id: applicantClanId } });
      if (!applicantClan) {
        throw new NotFoundException('申请方家族不存在');
      }
    }

    let branchRootPersonId: bigint | null = null;
    if (body.branch_root_person_id) {
      if (!applicantClanId) {
        throw new BadRequestException('指定支系根时必须同时指定申请方家族');
      }
      const person = await this.prisma.person.findUnique({
        where: { id: BigInt(body.branch_root_person_id) },
      });
      if (!person || person.clan_id !== applicantClanId) {
        throw new BadRequestException('支系根不属于申请方家族');
      }
      branchRootPersonId = person.id;
    }

    const created = await this.prisma.mergeApplication.create({
      data: {
        clan_id: clanId,
        applicant_id: userId,
        origin_place: originPlace,
        xipai_info: body.xipai_info ?? [],
        ancestor_name: body.ancestor_name ?? null,
        migration_history: body.migration_history ?? null,
        applicant_clan_id: applicantClanId,
        branch_root_person_id: branchRootPersonId,
        status: ApplicationStatus.PENDING,
      },
    });

    return {
      id: created.id.toString(),
      status: created.status,
      applicant_id: created.applicant_id,
    };
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw a pending kinship application' })
  async withdraw(@Request() req, @Param('id') id: string) {
    const userId = this.requireUser(req);
    const updated = await this.prisma.mergeApplication.updateMany({
      where: {
        id: BigInt(id),
        applicant_id: userId,
        status: ApplicationStatus.PENDING,
      },
      data: { status: ApplicationStatus.WITHDRAWN },
    });
    if (updated.count !== 1) {
      throw new ConflictException('申请当前状态不允许撤回');
    }
    return { status: ApplicationStatus.WITHDRAWN };
  }

  private requireUser(req: { user?: { userId?: string } }): string {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }
    return userId;
  }
}
