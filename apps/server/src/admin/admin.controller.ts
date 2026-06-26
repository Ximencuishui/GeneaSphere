import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('admin')
@Controller('api/admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  /**
   * 获取管理员后台导航菜单
   */
  @Get('menu')
  @ApiOperation({ summary: 'Get admin menu' })
  getMenu(@Request() req) {
    const menu = [
      {
        title: '概况',
        children: [
          { title: '控制面板', path: '/zupu/:slug/dashboard' },
        ],
      },
      {
        title: '人员管理',
        children: [
          { title: '成员列表', path: '/zupu/:slug/members' },
          { title: '权限分配', path: '/zupu/:slug/members?tab=roles' },
        ],
      },
      {
        title: '内容审核',
        children: [
          { title: '影像审核', path: '/zupu/:slug/reviews/media' },
          { title: '生平审核', path: '/zupu/:slug/reviews/bio' },
          { title: '举报管理', path: '/zupu/:slug/reports' },
        ],
      },
      {
        title: '寻亲管理',
        children: [
          { title: '认亲申请', path: '/zupu/:slug/merge/applications' },
          { title: '寻亲帖管理', path: '/zupu/:slug/merge/posts' },
        ],
      },
      {
        title: '迁徙管理',
        children: [
          { title: '迁徙事件', path: '/zupu/:slug/migration' },
        ],
      },
      {
        title: '系统设置',
        children: [
          { title: '隐私配置', path: '/zupu/:slug/settings/privacy' },
          { title: '字辈管理', path: '/zupu/:slug/settings/xipai' },
          { title: '家族信息', path: '/zupu/:slug/settings/clan-info' },
          { title: '云存储', path: '/zupu/:slug/settings/storage' },
        ],
      },
      {
        title: '印刷服务',
        children: [
          { title: '订单管理', path: '/zupu/:slug/orders' },
        ],
      },
      {
        title: '短信通知',
        children: [
          { title: '发送短信', path: '/zupu/:slug/sms/send' },
          { title: '余额管理', path: '/zupu/:slug/sms/balance' },
        ],
      },
      {
        title: '家族公告',
        children: [
          { title: '公告管理', path: '/zupu/:slug/announcements' },
        ],
      },
      {
        title: '数据管理',
        children: [
          { title: '数据统计', path: '/zupu/:slug/statistics' },
          { title: '回收站', path: '/zupu/:slug/trash' },
          { title: '数据导出', path: '/zupu/:slug/settings/export' },
        ],
      },
      {
        title: '影像管理',
        children: [
          { title: '影像库', path: '/zupu/:slug/media/library' },
          { title: '相册管理', path: '/zupu/:slug/media/albums' },
        ],
      },
      {
        title: '工具记录',
        children: [
          { title: 'AI工具使用记录', path: '/zupu/:slug/toolbox-usage' },
          { title: '家庭图册', path: '/zupu/:slug/family-albums' },
          { title: 'PDF导入管理', path: '/zupu/:slug/import' },
        ],
      },
      {
        title: '日志审计',
        children: [
          { title: '操作日志', path: '/zupu/:slug/logs' },
        ],
      },
    ];

    return { menu };
  }
}
