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
import { NotificationService } from '../common/notification.service';
import { ClanResolverService } from '../common/clan-resolver.service';

// v2.0 新增 Controller
import { AdminAnnouncementController } from './announcement/admin-announcement.controller';
import { AdminTrashController } from './trash/admin-trash.controller';
import { AdminReportController } from './report/admin-report.controller';
import { AdminMediaController } from './media/admin-media.controller';
import { AdminAlbumController } from './media/admin-album.controller';
import { AdminStatisticsController } from './statistics/admin-statistics.controller';
import { AdminToolboxUsageController } from './toolbox-usage/admin-toolbox-usage.controller';
import { AdminFamilyAlbumController } from './family-album/admin-family-album.controller';
import { AdminAlertController } from './alert/admin-alert.controller';
import { AdminBackupController } from './backup/admin-backup.controller';
import { AlertService } from '../common/alert.service';
import { CosModule } from '../cos/cos.module';

@Module({
  imports: [CosModule],
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
    AdminAlbumController,
    AdminStatisticsController,
    AdminToolboxUsageController,
    AdminFamilyAlbumController,
    AdminAlertController,
    AdminBackupController,
  ],
  providers: [AdminService, MergeService, SmsService, AdminFamilyRelationService, NotificationService, ClanResolverService, AlertService],
  exports: [AdminService, MergeService, NotificationService, ClanResolverService, AlertService],
})
export class AdminModule {}
