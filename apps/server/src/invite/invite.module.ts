import { Module } from '@nestjs/common';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { InviteCleanupService } from './invite-cleanup.service';
import { MockWechatService } from './mock-wechat.service';
import { WechatService } from './wechat.service';
import { NotificationService } from '../common/notification.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [InviteController],
  providers: [
    InviteService,
    InviteCleanupService,
    MockWechatService,
    {
      provide: WechatService,
      useExisting: MockWechatService,
    },
    NotificationService,
  ],
  exports: [InviteService, WechatService],
})
export class InviteModule {}
