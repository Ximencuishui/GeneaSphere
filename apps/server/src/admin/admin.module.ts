import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { MembersController } from './members/members.controller';
import { ReviewsController } from './reviews/reviews.controller';
import { MergeController } from './merge/merge.controller';
import { SettingsController } from './settings/settings.controller';
import { LogsController } from './logs/logs.controller';
import { OrdersController } from './orders/orders.controller';
import { PrismaService } from '@geneasphere/db';

@Module({
  imports: [],
  controllers: [
    AdminController,
    DashboardController,
    MembersController,
    ReviewsController,
    MergeController,
    SettingsController,
    LogsController,
    OrdersController,
  ],
  providers: [AdminService, PrismaService],
  exports: [AdminService],
})
export class AdminModule {}
