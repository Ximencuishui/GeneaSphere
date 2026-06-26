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
import { AdminImportController } from './import/admin-import.controller';
import { PrismaService } from '@geneasphere/db';
import { NotificationService } from '../common/notification.service';
import { ClanResolverService } from '../common/clan-resolver.service';

// v2.0 新增 Controller
import { AdminAnnouncementController } from './announcement/admin-announcement.controller';
import { AdminTrashController } from './trash/admin-trash.controller';
import { AdminReportController } from './report/admin-report.controller';
import { AdminMediaController } from './media/admin-media.controller';
import { AdminStatisticsController } from './statistics/admin-statistics.controller';
import { AdminToolboxUsageController } from './toolbox-usage/admin-toolbox-usage.controller';
import { AdminFamilyAlbumController } from './family-album/admin-family-album.controller';

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
    AdminImportController,
    // v2.0 新增 Controller
    AdminAnnouncementController,
    AdminTrashController,
    AdminReportController,
    AdminMediaController,
    AdminStatisticsController,
    AdminToolboxUsageController,
    AdminFamilyAlbumController,
  ],
  providers: [AdminService, MergeService, SmsService, AdminFamilyRelationService, PrismaService, NotificationService, ClanResolverService],
  exports: [AdminService, MergeService, NotificationService, ClanResolverService],
})
export class AdminModule {}
