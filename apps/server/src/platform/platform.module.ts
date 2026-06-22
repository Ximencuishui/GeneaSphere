import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@geneasphere/db';
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

@Module({
  imports: [PrismaModule, forwardRef(() => PlatformAuthModule)],
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
  providers: [SettingsService],
  exports: [SettingsService],
})
export class PlatformModule {}
