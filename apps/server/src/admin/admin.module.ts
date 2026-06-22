import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { MembersController } from './members/members.controller';
import { ReviewsController } from './reviews/reviews.controller';
import { MergeController } from './merge/merge.controller';
import { MergeWizardController } from './merge/merge-wizard.controller';
import { MergeService } from './merge/merge.service';
import { SettingsController } from './settings/settings.controller';
import { LogsController } from './logs/logs.controller';
import { OrdersController } from './orders/orders.controller';
import { SmsController } from './sms/sms.controller';
import { SmsService } from './sms/sms.service';
import { AdminFamilyRelationController } from './family-relation/admin-family-relation.controller';
import { AdminFamilyRelationService } from './family-relation/admin-family-relation.service';
import { PrismaService } from '@geneasphere/db';
import { NotificationService } from '../common/notification.service';

@Module({
  imports: [],
  controllers: [
    AdminController,
    DashboardController,
    MembersController,
    ReviewsController,
    MergeController,
    MergeWizardController,
    SettingsController,
    LogsController,
    OrdersController,
    SmsController,
    AdminFamilyRelationController,
  ],
  providers: [AdminService, MergeService, SmsService, AdminFamilyRelationService, PrismaService, NotificationService],
  exports: [AdminService, MergeService, NotificationService],
})
export class AdminModule {}
