import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ClanModule } from './clan/clan.module';
import { TreeModule } from './tree/tree.module';
import { ImportModule } from './import/import.module';
import { MediaModule } from './media/media.module';
import { SearchModule } from './search/search.module';
import { PrintModule } from './print/print.module';
import { AdminModule } from './admin/admin.module';
import { PlatformModule } from './platform/platform.module';
import { UserModule } from './user/user.module';
import { ToolboxModule } from './toolbox/toolbox.module';
import { DiscussionModule } from './discussion/discussion.module';
import { BuddyModule } from './buddy/buddy.module';
import { VideoModule } from './video/video.module';
import { MigrationModule } from './migration/migration.module';
import { PersonalSpaceModule } from './personal-space/personal-space.module';
import { LineageVideoModule } from './lineage-video/lineage-video.module';
import { InviteModule } from './invite/invite.module';
import { FamilyBookModule } from './family-book/family-book.module';
import { FamilyRelationModule } from './family-relation/family-relation.module';
import { CosModule } from './cos/cos.module';

@Module({
  imports: [
    CosModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    ClanModule,
    TreeModule,
    ImportModule,
    MediaModule,
    SearchModule,
    PrintModule,
    AdminModule,
    PlatformModule,
    UserModule,
    ToolboxModule,
    DiscussionModule,
    BuddyModule,
    VideoModule,
    MigrationModule,
    PersonalSpaceModule,
    LineageVideoModule,
    InviteModule,
    FamilyBookModule,
    FamilyRelationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
