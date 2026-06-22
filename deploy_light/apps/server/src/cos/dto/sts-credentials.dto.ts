import { IsOptional, IsString } from 'class-validator';

export class GetPresignedUrlDto {
  @IsString()
  key: string;

  @IsOptional()
  @IsString()
  bucketType?: 'hot' | 'cold';

  @IsOptional()
  expiresIn?: number;
}

export class GenerateFileKeyDto {
  @IsString()
  category: string; // 'media/original', 'media/display', 'media/thumb', 'toolbox/raw', 'print/pdf', 'video/mp4', 'scan/pdf', 'media/qrcodes'

  @IsString()
  clanId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  ext?: string;
}

export class StsCredentialsResponse {
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
    startTime: number;
    expiredTime: number;
  };
  bucket: string;
  region: string;
  pathPrefix: string;
}
