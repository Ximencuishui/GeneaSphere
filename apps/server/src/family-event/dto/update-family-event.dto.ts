import { PartialType } from '@nestjs/mapped-types';
import { CreateFamilyEventDto } from './create-family-event.dto';

export class UpdateFamilyEventDto extends PartialType(CreateFamilyEventDto) {}
