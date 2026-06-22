import { PartialType } from '@nestjs/swagger';
import { CreateMigrationEventDto } from './create-migration-event.dto';

export class UpdateMigrationEventDto extends PartialType(CreateMigrationEventDto) {}
