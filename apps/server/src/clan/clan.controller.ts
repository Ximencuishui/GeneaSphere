import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClanService } from './clan.service';
import { CreateClanDto, UpdateClanDto } from './dto/create-clan.dto';

@ApiTags('clans')
@Controller('api/clans')
export class ClanController {
  constructor(private readonly clanService: ClanService) {}

  /**
   * Create a new clan
   * The authenticated user becomes the admin of the new clan
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new clan' })
  async create(@Body() createClanDto: CreateClanDto, @Request() req) {
    const userId = req.user.userId;
    return this.clanService.create(createClanDto, userId);
  }

  /**
   * Get all clans
   * If user is authenticated, returns only their clans
   * Otherwise returns all public clans
   */
  @Get()
  @ApiOperation({ summary: 'Get all clans' })
  async findAll(@Request() req) {
    const userId = req.user?.userId;
    return this.clanService.findAll(userId);
  }

  /**
   * Get a specific clan by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a clan by ID' })
  async findOne(@Param('id') id: string) {
    return this.clanService.findOne(BigInt(id));
  }

  /**
   * Update a clan
   * Only the clan admin can update
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a clan' })
  async update(
    @Param('id') id: string,
    @Body() updateClanDto: UpdateClanDto,
    @Request() req,
  ) {
    const userId = req.user.userId;
    return this.clanService.update(BigInt(id), updateClanDto, userId);
  }

  /**
   * Delete a clan
   * Only the clan admin can delete
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a clan' })
  async remove(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return this.clanService.remove(BigInt(id), userId);
  }

  /**
   * Get clan statistics
   */
  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get clan statistics' })
  async getStatistics(@Param('id') id: string) {
    return this.clanService.getStatistics(BigInt(id));
  }
}
