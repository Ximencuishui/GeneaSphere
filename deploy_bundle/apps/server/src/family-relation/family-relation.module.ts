import { Module } from '@nestjs/common';
import { FamilyRelationController } from './family-relation.controller';
import { FamilyRelationService } from './family-relation.service';
import { RelationValidator } from './utils/relation-validator';
import { PrivacyFilter } from './utils/privacy-filter';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [FamilyRelationController],
  providers: [FamilyRelationService, RelationValidator, PrivacyFilter],
  exports: [FamilyRelationService],
})
export class FamilyRelationModule {}
