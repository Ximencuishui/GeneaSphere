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
        title: '系统设置',
        children: [
          { title: '隐私配置', path: '/admin/settings/privacy' },
          { title: '字辈管理', path: '/admin/settings/xipai' },
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
        title: '日志审计',
        children: [
          { title: '操作日志', path: '/admin/logs' },
        ],
      },
    ];

    return { menu };
  }
}
