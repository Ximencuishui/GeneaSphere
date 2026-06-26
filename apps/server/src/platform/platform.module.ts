import { Module, forwardRef } from '@nestjs/common';
import { PlatformAuthModule } from './auth/platform-auth.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { FamiliesController } from './families/families.controller';
import { UsersController } from './users/users.controller';
import { ContentReviewsController } from './reviews/reviews.controller';
import { OrdersController } from './orders/orders.controller';
import { SettingsController } from './settings/settings.controller';
import { StatisticsController } from './statistics/statistics.controller';
import { PlatformLogsController } from './logs/logs.controller';
import { SettingsService } from './settings/settings.service';
import { PdfReportService } from './statistics/pdf-report.service';
import { ClanResolverService } from '../common/clan-resolver.service';

@Module({
  imports: [forwardRef(() => PlatformAuthModule)],
  controllers: [
    DashboardController,
    FamiliesController,
    UsersController,
    ContentReviewsController,
    OrdersController,
    SettingsController,
    StatisticsController,
    PlatformLogsController,
  ],
  providers: [SettingsService, PdfReportService, ClanResolverService],
  exports: [SettingsService, PdfReportService, ClanResolverService],
})
export class PlatformModule {}
