import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

// ==================== 驱动接口 ====================
export interface CosDriver {
  /** 上传文件 */
  uploadFile(key: string, body: Buffer | string, options?: {
    contentType?: string;
    bucketType?: 'hot' | 'cold';
  }): Promise<{ url: string; key: string }>;

  /** 删除文件 */
  deleteFile(key: string, bucketType?: 'hot' | 'cold'): Promise<void>;

  /** 生成预签名URL */
  getPresignedUrl(key: string, bucketType?: 'hot' | 'cold', expiresIn?: number): Promise<string>;

  /** 检查文件是否存在 */
  doesFileExist(key: string, bucketType?: 'hot' | 'cold'): Promise<boolean>;

  /** 获取 CDN URL（仅热Bucket） */
  getCdnUrl(key: string): string;
}

// ==================== 本地文件系统驱动 ====================
@Injectable()
export class LocalCosDriver implements CosDriver {
  private readonly logger = new Logger(LocalCosDriver.name);
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    return path.join(this.storageRoot, key.replace(/\//g, '_'));
  }

  async uploadFile(key: string, body: Buffer | string, options?: {
    contentType?: string;
    bucketType?: 'hot' | 'cold';
  }): Promise<{ url: string; key: string }> {
    const filePath = this.resolvePath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, body);
    return {
      url: `/media/${key.replace(/\//g, '_')}`,
      key,
    };
  }

  async deleteFile(key: string, _bucketType?: 'hot' | 'cold'): Promise<void> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async getPresignedUrl(key: string, _bucketType?: 'hot' | 'cold', _expiresIn?: number): Promise<string> {
    return `/media/${key.replace(/\//g, '_')}`;
  }

  async doesFileExist(key: string, _bucketType?: 'hot' | 'cold'): Promise<boolean> {
    return fs.existsSync(this.resolvePath(key));
  }

  getCdnUrl(key: string): string {
    return `/media/${key.replace(/\//g, '_')}`;
  }
}

// ==================== 腾讯云 COS 驱动 ====================
@Injectable()
export class TencentCosDriver implements CosDriver {
  private readonly logger = new Logger(TencentCosDriver.name);
  private cos: any = null;
  private hotBucket: string;
  private coldBucket: string;
  private region: string;
  private cdnDomain: string;
  private isReady = false;

  constructor(private configService: ConfigService) {
    this.hotBucket = this.configService.get<string>('COS_HOT_BUCKET') || 'xungenlu-hot';
    this.coldBucket = this.configService.get<string>('COS_COLD_BUCKET') || 'xungenlu-cold';
    this.region = this.configService.get<string>('TENCENT_CLOUD_REGION') || 'ap-guangzhou';
    this.cdnDomain = this.configService.get<string>('CDN_DOMAIN') || 'cdn.xungenlu.cn';
  }

  onModuleInit() {
    const secretId = this.configService.get<string>('TENCENT_CLOUD_SECRET_ID');
    const secretKey = this.configService.get<string>('TENCENT_CLOUD_SECRET_KEY');
    if (secretId && secretKey) {
      try {
        const COS = require('cos-nodejs-sdk-v5');
        this.cos = new COS({
          SecretId: secretId,
          SecretKey: secretKey,
        });
        this.isReady = true;
        this.logger.log(`腾讯云 COS 驱动初始化完成 region=${this.region}`);
      } catch (err: any) {
        this.logger.warn(`COS SDK 加载失败，将降级：${err.message}`);
      }
    } else {
      this.logger.warn('未配置腾讯云 COS 密钥（TENCENT_CLOUD_SECRET_ID/KEY），COS 驱动不可用');
    }
  }

  private getBucket(bucketType?: 'hot' | 'cold'): string {
    const appId = this.configService.get<string>('TENCENT_CLOUD_APPID') || '';
    const bucket = bucketType === 'cold' ? this.coldBucket : this.hotBucket;
    return appId ? `${bucket}-${appId}` : bucket;
  }

  async uploadFile(key: string, body: Buffer | string, options?: {
    contentType?: string;
    bucketType?: 'hot' | 'cold';
  }): Promise<{ url: string; key: string }> {
    if (!this.isReady || !this.cos) {
      throw new Error('COS 客户端未就绪，请配置 TENCENT_CLOUD_SECRET_ID/KEY');
    }
    const bucket = this.getBucket(options?.bucketType);
    return new Promise((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: bucket,
          Region: this.region,
          Key: key,
          Body: body,
          ContentType: options?.contentType || this.guessContentType(key),
        },
        (err: any, _data: any) => {
          if (err) {
            this.logger.error(`COS upload 失败: ${err.message}`, err.stack);
            reject(new Error(`COS 上传失败: ${err.message}`));
          } else {
            const url = options?.bucketType === 'cold'
              ? key  // 冷数据不返回 URL，用 key 标识
              : this.getCdnUrl(key);
            resolve({ url, key });
          }
        },
      );
    });
  }

  async deleteFile(key: string, bucketType?: 'hot' | 'cold'): Promise<void> {
    if (!this.isReady || !this.cos) return;
    const bucket = this.getBucket(bucketType);
    return new Promise((resolve, reject) => {
      this.cos.deleteObject(
        { Bucket: bucket, Region: this.region, Key: key },
        (err: any) => {
          if (err) {
            this.logger.error(`COS delete 失败: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async getPresignedUrl(key: string, bucketType?: 'hot' | 'cold', expiresIn?: number): Promise<string> {
    if (!this.isReady || !this.cos) {
      // fallback: 如果是热Bucket且开启了CDN，使用 CDN URL
      if (bucketType !== 'cold') return this.getCdnUrl(key);
      throw new Error('COS 客户端未就绪');
    }
    const bucket = this.getBucket(bucketType || 'cold');
    const expires = expiresIn || 300; // 默认 5 分钟

    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: bucket,
          Region: this.region,
          Key: key,
          Sign: true,
          Expires: expires,
        },
        (err: any, url: string) => {
          if (err) {
            reject(new Error(`生成预签名 URL 失败: ${err.message}`));
          } else {
            resolve(url);
          }
        },
      );
    });
  }

  async doesFileExist(key: string, bucketType?: 'hot' | 'cold'): Promise<boolean> {
    if (!this.isReady || !this.cos) return false;
    const bucket = this.getBucket(bucketType);
    return new Promise((resolve) => {
      this.cos.headObject(
        { Bucket: bucket, Region: this.region, Key: key },
        (err: any) => {
          resolve(!err);
        },
      );
    });
  }

  getCdnUrl(key: string): string {
    return `https://${this.cdnDomain}/${key}`;
  }

  private guessContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf',
      '.svg': 'image/svg+xml',
      '.gz': 'application/gzip',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
    };
    return map[ext] || 'application/octet-stream';
  }
}

// ==================== 统一 COS 服务 ====================
@Injectable()
export class CosService {
  private readonly logger = new Logger(CosService.name);
  private driver: CosDriver;
  private storageDriver: 'local' | 'cos';

  constructor(
    private configService: ConfigService,
    private localDriver: LocalCosDriver,
    private tencentDriver: TencentCosDriver,
  ) {
    this.storageDriver = (configService.get<string>('STORAGE_DRIVER') as 'local' | 'cos') || 'local';
    const cosEnabled = configService.get<string>('COS_ENABLED') === 'true';
    if (cosEnabled || this.storageDriver === 'cos') {
      this.driver = tencentDriver;
      this.logger.log('COS 服务驱动: 腾讯云 COS');
    } else {
      this.driver = localDriver;
      this.logger.log('COS 服务驱动: 本地文件系统');
    }

    // 触发 TencentCosDriver 的 onModuleInit
    (tencentDriver as any).onModuleInit?.();
  }

  /** 生成唯一文件路径 */
  generateFileKey(category: string, clanId: string | bigint, ext: string, userId?: string): string {
    const uuid = uuidv4().replace(/-/g, '');
    const clanIdStr = clanId.toString();
    const userPart = userId ? `${userId}/` : '';
    return `${category}/${clanIdStr}/${userPart}${uuid}.${ext}`;
  }

  /** 上传文件 */
  async uploadFile(key: string, body: Buffer | string, options?: {
    contentType?: string;
    bucketType?: 'hot' | 'cold';
  }): Promise<{ url: string; key: string }> {
    return this.driver.uploadFile(key, body, options);
  }

  /** 删除文件 */
  async deleteFile(key: string, bucketType?: 'hot' | 'cold'): Promise<void> {
    return this.driver.deleteFile(key, bucketType);
  }

  /** 生成预签名URL */
  async getPresignedUrl(key: string, bucketType?: 'hot' | 'cold', expiresIn?: number): Promise<string> {
    return this.driver.getPresignedUrl(key, bucketType, expiresIn);
  }

  /** 获取 CDN URL */
  getCdnUrl(key: string): string {
    return this.driver.getCdnUrl(key);
  }

  /** 检查文件是否存在 */
  async doesFileExist(key: string, bucketType?: 'hot' | 'cold'): Promise<boolean> {
    return this.driver.doesFileExist(key, bucketType);
  }

  /** 获取当前驱动类型 */
  getDriverType(): 'local' | 'cos' {
    return this.storageDriver;
  }
}
