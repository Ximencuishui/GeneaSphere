import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ClanModule,
    TreeModule,
    ImportModule,
    MediaModule,
    SearchModule,
    PrintModule,
    AdminModule,
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
