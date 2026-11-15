import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminWechatService } from './admin-wechat.service';

@ApiTags('admin/wechat')
@Controller('api/admin/wechat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminWechatController {
  constructor(private readonly wechat: AdminWechatService) {}

  @Get('config')
  @ApiOperation({ summary: '读取家族公众号配置' })
  getConfig(@Request() req, @Query('clanSlug') clanSlug: string) {
    return this.wechat.getConfig(clanSlug, req.user.userId);
  }

  @Put('config')
  @ApiOperation({ summary: '保存家族公众号配置草稿' })
  saveConfig(@Request() req, @Body() body: { clanSlug: string; config?: Record<string, unknown> }) {
    return this.wechat.saveConfig(req.user.userId, body);
  }

  @Get('status')
  @ApiOperation({ summary: '家族公众号状态' })
  getStatus(@Request() req, @Query('clanSlug') clanSlug: string) {
    return this.wechat.getStatus(clanSlug, req.user.userId);
  }

  @Post('verify')
  @ApiOperation({ summary: '校验公众号连通性' })
  verify(@Request() req, @Body() body: { clanSlug: string }) {
    return this.wechat.verify(req.user.userId, body.clanSlug);
  }

  @Patch('config/enabled')
  @ApiOperation({ summary: '启用或停用公众号' })
  setEnabled(@Request() req, @Body() body: { clanSlug: string; enabled: boolean }) {
    return this.wechat.setEnabled(req.user.userId, body);
  }

  @Get('articles')
  @ApiOperation({ summary: '公众号内容列表' })
  listArticles(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.wechat.listArticles(clanSlug, req.user.userId, { status, page, pageSize });
  }

  @Post('articles')
  @ApiOperation({ summary: '新建公众号内容' })
  createArticle(@Request() req, @Body() body: any) {
    return this.wechat.createArticle(req.user.userId, body);
  }

  @Put('articles/:id')
  @ApiOperation({ summary: '更新公众号内容' })
  updateArticle(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.wechat.updateArticle(req.user.userId, id, body);
  }

  @Post('articles/:id/publish')
  @ApiOperation({ summary: '推送公众号内容' })
  publish(@Request() req, @Param('id') id: string, @Body() body: { clanSlug: string }) {
    return this.wechat.publishArticle(req.user.userId, id, body.clanSlug);
  }

  @Post('articles/:id/duplicate')
  @ApiOperation({ summary: '复制公众号内容为草稿' })
  duplicate(@Request() req, @Param('id') id: string, @Body() body: { clanSlug: string }) {
    return this.wechat.duplicateArticle(req.user.userId, id, body.clanSlug);
  }

  @Delete('articles/:id')
  @ApiOperation({ summary: '删除公众号内容' })
  remove(@Request() req, @Param('id') id: string, @Query('clanSlug') clanSlug: string) {
    return this.wechat.deleteArticle(req.user.userId, id, clanSlug);
  }
}
