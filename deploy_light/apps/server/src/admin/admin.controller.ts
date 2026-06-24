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
          { title: '控制面板', path: '/admin/dashboard' },
        ],
      },
      {
        title: '人员管理',
        children: [
          { title: '成员列表', path: '/admin/members' },
          { title: '权限分配', path: '/admin/members?tab=roles' },
        ],
      },
      {
        title: '内容审核',
        children: [
          { title: '影像审核', path: '/admin/reviews/media' },
          { title: '生平审核', path: '/admin/reviews/bio' },
          { title: '举报管理', path: '/admin/reports' },
        ],
      },
      {
        title: '寻亲管理',
        children: [
          { title: '认亲申请', path: '/admin/merge/applications' },
          { title: '寻亲帖管理', path: '/admin/merge/posts' },
        ],
      },
      {
        title: '迁徙管理',
        children: [
          { title: '迁徙事件', path: '/admin/migration' },
        ],
      },
      {
        title: '系统设置',
        children: [
          { title: '隐私配置', path: '/admin/settings/privacy' },
          { title: '字辈管理', path: '/admin/settings/xipai' },
          { title: '家族信息', path: '/admin/settings/clan-info' },
          { title: '云存储', path: '/admin/settings/storage' },
        ],
      },
      {
        title: '印刷服务',
        children: [
          { title: '订单管理', path: '/admin/orders' },
        ],
      },
      {
        title: '短信通知',
        children: [
          { title: '发送短信', path: '/admin/sms/send' },
          { title: '余额管理', path: '/admin/sms/balance' },
        ],
      },
      {
        title: '家族公告',
        children: [
          { title: '公告管理', path: '/admin/announcements' },
        ],
      },
      {
        title: '数据管理',
        children: [
          { title: '数据统计', path: '/admin/statistics' },
          { title: '回收站', path: '/admin/trash' },
          { title: '数据导出', path: '/admin/settings/export' },
        ],
      },
      {
        title: '影像管理',
        children: [
          { title: '影像库', path: '/admin/media/library' },
          { title: '相册管理', path: '/admin/media/albums' },
        ],
      },
      {
        title: '工具记录',
        children: [
          { title: 'AI工具使用记录', path: '/admin/toolbox-usage' },
          { title: '家庭图册', path: '/admin/family-albums' },
          { title: 'PDF导入管理', path: '/admin/import' },
        ],
      },
      {
        title: '日志审计',
        children: [
          { title: '操作日志', path: '/admin/logs' },
        ],
      },
    ];

    return { menu };
  }
}
