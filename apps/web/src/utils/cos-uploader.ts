import COS from 'cos-js-sdk-v5';
import { getStsCredentials } from '@/api/cos';
import type { StsCredentials } from '@/api/cos';

let cosInstance: COS | null = null;
let currentCredentials: StsCredentials | null = null;
let credentialExpireTime = 0;

/**
 * 获取或刷新 COS 实例
 */
async function getCosInstance(): Promise<COS> {
  // 检查凭证是否过期（提前5分钟刷新）
  if (!cosInstance || Date.now() > credentialExpireTime - 300000) {
    currentCredentials = await getStsCredentials();
    credentialExpireTime = currentCredentials.credentials.expiredTime * 1000;

    cosInstance = new COS({
      getAuthorization: (
        _options: COS.GetAuthorizationOptions,
        callback: (data: COS.Credentials) => void
      ) => {
        callback({
          TmpSecretId: currentCredentials!.credentials.tmpSecretId,
          TmpSecretKey: currentCredentials!.credentials.tmpSecretKey,
          SecurityToken: currentCredentials!.credentials.sessionToken,
          StartTime: currentCredentials!.credentials.startTime,
          ExpiredTime: currentCredentials!.credentials.expiredTime,
        });
      },
    });
  }

  return cosInstance;
}

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * 通过前端直传 COS（大文件适用）
 * @param file 文件对象
 * @param key COS 文件路径
 * @param bucketType 目标 Bucket（hot | cold）
 * @returns 上传结果
 */
export async function cosUpload(
  file: File | Buffer,
  key: string,
  _bucketType: 'hot' | 'cold' = 'hot',
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const cos = await getCosInstance();
  const bucketName = currentCredentials!.bucket;

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucketName,
        Region: currentCredentials!.region,
        Key: key,
        Body: file,
        onProgress: (progressData: { percent: number }) => {
          if (onProgress) {
            onProgress(progressData.percent);
          }
        },
      },
      (err: any) => {
        if (err) {
          reject(new Error(`COS 上传失败: ${err.message || err}`));
        } else {
          const cdnDomain = `https://${import.meta.env.VITE_CDN_DOMAIN || 'cdn.xungenlu.cn'}`;
          resolve({
            url: `${cdnDomain}/${key}`,
            key,
          });
        }
      }
    );
  });
}

/**
 * 清除缓存的 COS 实例（用于登出/切换用户）
 */
export function clearCosInstance(): void {
  cosInstance = null;
  currentCredentials = null;
  credentialExpireTime = 0;
}
