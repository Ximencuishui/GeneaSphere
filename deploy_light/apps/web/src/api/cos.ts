import request from '@/utils/request';

export interface StsCredentials {
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

export interface PresignedUrlResult {
  url: string;
  expires_in: number;
}

export interface FileKeyResult {
  key: string;
  url: string;
}

/**
 * 获取 STS 临时密钥（前端直传 COS）
 */
export async function getStsCredentials(): Promise<StsCredentials> {
  return request.post('/api/cos/sts-credentials');
}

/**
 * 获取冷 Bucket 文件预签名 URL
 */
export async function getPresignedUrl(
  key: string,
  bucketType: 'hot' | 'cold' = 'cold',
  expiresIn: number = 300
): Promise<PresignedUrlResult> {
  return request.get('/api/cos/presigned-url', {
    params: { key, bucketType, expiresIn },
  });
}

/**
 * 生成合规的文件存储路径
 */
export async function generateFileKey(
  category: string,
  clanId: string,
  ext: string,
  userId?: string
): Promise<FileKeyResult> {
  return request.post('/api/cos/generate-key', {
    category,
    clanId,
    ext,
    userId,
  });
}
