import { Module } from '@nestjs/common';
import { FamilyRelationController } from './family-relation.controller';
import { FamilyRelationService } from './family-relation.service';
import { RelationValidator } from './utils/relation-validator';
import { PrivacyFilter } from './utils/privacy-filter';
import { AdminModule } from '../admin/admin.module';
import { PedigreeModule } from '../pedigree/pedigree.module';

@Module({
  imports: [AdminModule, PedigreeModule], // PedigreeModule 双写亲子关系（PersonAncestry + FamilyChild）
  controllers: [FamilyRelationController],
  providers: [FamilyRelationService, RelationValidator, PrivacyFilter],
  exports: [FamilyRelationService],
})
export class FamilyRelationModule {}
