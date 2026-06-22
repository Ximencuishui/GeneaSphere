import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { SpacePrivacyLevel } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const QUOTA_BYTES = BigInt(209715200); // 200MB

@Injectable()
export class PersonalSpaceService {
  private storageRoot: string;

  constructor(private readonly prisma: PrismaService) {
    this.storageRoot =
      process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'personal');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  // ==================== 存储用量 ====================

  async getStorage(userId: string) {
    let storage = await this.prisma.userStorage.findUnique({
      where: { user_id: userId },
    });
    if (!storage) {
      storage = await this.prisma.userStorage.create({
        data: { user_id: userId },
      });
    }
    return {
      used_bytes: storage.used_bytes.toString(),
      quota_bytes: storage.quota_bytes.toString(),
      used_mb: Number(storage.used_bytes) / 1024 / 1024,
      quota_mb: Number(storage.quota_bytes) / 1024 / 1024,
    };
  }

  private async ensureStorage(userId: string, additionalBytes: bigint) {
    let storage = await this.prisma.userStorage.findUnique({
      where: { user_id: userId },
    });
    if (!storage) {
      storage = await this.prisma.userStorage.create({
        data: { user_id: userId },
      });
    }
    if (storage.used_bytes + additionalBytes > storage.quota_bytes) {
      throw new BadRequestException(
        `个人相册容量已满（已用 ${this.formatBytes(storage.used_bytes)} / ${this.formatBytes(storage.quota_bytes)}），请删除旧照片或联系管理员扩容`,
      );
    }
    return storage;
  }

  private async addStorageUsage(userId: string, bytes: bigint) {
    await this.prisma.userStorage.upsert({
      where: { user_id: userId },
      update: { used_bytes: { increment: bytes } },
      create: { user_id: userId, used_bytes: bytes },
    });
  }

  private async subtractStorageUsage(userId: string, bytes: bigint) {
    const storage = await this.prisma.userStorage.findUnique({
      where: { user_id: userId },
    });
    if (storage) {
      const newVal = storage.used_bytes - bytes;
      await this.prisma.userStorage.update({
        where: { user_id: userId },
        data: { used_bytes: newVal > BigInt(0) ? newVal : BigInt(0) },
      });
    }
  }

  private formatBytes(bytes: bigint): string {
    const mb = Number(bytes) / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Number(bytes) / 1024}KB`;
  }

  // ==================== 相册 ====================

  async listAlbums(userId: string, sortBy = 'updated_at') {
    const albums = await this.prisma.userAlbum.findMany({
      where: { user_id: userId },
      orderBy: { [sortBy]: 'desc' },
      include: {
        photos: {
          take: 1,
          orderBy: { created_at: 'desc' },
          select: { file_url: true },
        },
      },
    });
    return albums.map((a) => ({
      id: a.id.toString(),
      name: a.name,
      description: a.description,
      cover_photo_url:
        a.cover_photo_id
          ? undefined // will be resolved below
          : a.photos[0]?.file_url || null,
      default_privacy: a.default_privacy,
      photo_count: a.photo_count,
      created_at: a.created_at,
      updated_at: a.updated_at,
    }));
  }

  async createAlbum(userId: string, data: {
    name: string;
    description?: string;
    default_privacy?: SpacePrivacyLevel;
  }) {
    const album = await this.prisma.userAlbum.create({
      data: {
        user_id: userId,
        name: data.name,
        description: data.description,
        default_privacy: (data.default_privacy as SpacePrivacyLevel) || SpacePrivacyLevel.clan,
      },
    });
    return {
      id: album.id.toString(),
      user_id: album.user_id,
      name: album.name,
      description: album.description,
      cover_photo_id: album.cover_photo_id?.toString() || null,
      default_privacy: album.default_privacy,
      photo_count: album.photo_count,
      created_at: album.created_at,
      updated_at: album.updated_at,
    };
  }

  async updateAlbum(userId: string, albumId: bigint, data: {
    name?: string;
    description?: string;
    default_privacy?: SpacePrivacyLevel;
    cover_photo_id?: bigint;
  }) {
    const album = await this.prisma.userAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('相册不存在');
    if (album.user_id !== userId) throw new ForbiddenException('无权操作此相册');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.default_privacy !== undefined) updateData.default_privacy = data.default_privacy;
    if (data.cover_photo_id !== undefined) updateData.cover_photo_id = data.cover_photo_id;

    const updated = await this.prisma.userAlbum.update({
      where: { id: albumId },
      data: updateData,
    });
    return {
      id: updated.id.toString(),
      user_id: updated.user_id,
      name: updated.name,
      description: updated.description,
      cover_photo_id: updated.cover_photo_id?.toString() || null,
      default_privacy: updated.default_privacy,
      photo_count: updated.photo_count,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  }

  async deleteAlbum(userId: string, albumId: bigint) {
    const album = await this.prisma.userAlbum.findUnique({ where: { id: albumId } });
    if (!album) throw new NotFoundException('相册不存在');
    if (album.user_id !== userId) throw new ForbiddenException('无权操作此相册');

    // 获取或创建"未分类"相册
    let uncategorized = await this.prisma.userAlbum.findFirst({
      where: { user_id: userId, name: '未分类' },
    });
    if (!uncategorized) {
      uncategorized = await this.prisma.userAlbum.create({
        data: {
          user_id: userId,
          name: '未分类',
          default_privacy: SpacePrivacyLevel.clan,
        },
      });
    }

    // 将照片移至未分类相册
    await this.prisma.userPhoto.updateMany({
      where: { album_id: albumId, user_id: userId },
      data: { album_id: uncategorized.id },
    });

    // 更新未分类相册的照片计数
    const movedCount = await this.prisma.userPhoto.count({
      where: { album_id: uncategorized.id },
    });
    await this.prisma.userAlbum.update({
      where: { id: uncategorized.id },
      data: { photo_count: movedCount },
    });

    // 删除相册
    await this.prisma.userAlbum.delete({ where: { id: albumId } });
    return { message: '相册已删除，照片已移至"未分类"' };
  }

  // ==================== 照片 ====================

  async listPhotos(userId: string, params: {
    album_id?: bigint;
    page?: number;
    pageSize?: number;
  }) {
    const { album_id, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;
    const where: any = { user_id: userId };
    if (album_id) where.album_id = album_id;

    const [items, total] = await Promise.all([
      this.prisma.userPhoto.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: { album: { select: { id: true, name: true } } },
      }),
      this.prisma.userPhoto.count({ where }),
    ]);

    return {
      data: items.map((p) => ({
        id: p.id.toString(),
        album_id: p.album_id.toString(),
        album_name: p.album.name,
        file_url: p.file_url,
        thumbnail_url: p.thumbnail_url,
        location_name: p.location_name,
        taken_year: p.taken_year,
        taken_date: p.taken_date,
        description: p.description,
        privacy: p.privacy,
        tagged_person_ids: p.tagged_person_ids,
        file_size: p.file_size?.toString(),
        created_at: p.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async uploadPhoto(
    userId: string,
    file: Express.Multer.File,
    data: {
      album_id: bigint;
      location_name: string;
      taken_year: number;
      taken_date?: string;
      description?: string;
      privacy?: SpacePrivacyLevel;
    },
  ) {
    // 校验相册
    const album = await this.prisma.userAlbum.findUnique({
      where: { id: data.album_id },
    });
    if (!album) throw new NotFoundException('相册不存在');
    if (album.user_id !== userId) throw new ForbiddenException('无权操作此相册');

    // 校验必填字段
    if (!data.location_name) {
      throw new BadRequestException('请填写地点');
    }
    if (!data.taken_year || data.taken_year < 1900 || data.taken_year > new Date().getFullYear()) {
      throw new BadRequestException('请填写有效的年份（1900-' + new Date().getFullYear() + '）');
    }

    const fileSize = BigInt(file.size);

    // 校验存储配额
    await this.ensureStorage(userId, fileSize);

    // 保存文件
    const filename = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(this.storageRoot, filename);
    fs.writeFileSync(filePath, file.buffer);
    const fileUrl = `/personal/${filename}`;

    // 继承相册隐私设置
    const privacy = data.privacy || album.default_privacy;

    const photo = await this.prisma.userPhoto.create({
      data: {
        user_id: userId,
        album_id: data.album_id,
        file_url: fileUrl,
        location_name: data.location_name,
        taken_year: data.taken_year,
        taken_date: data.taken_date ? new Date(data.taken_date) : null,
        description: data.description,
        privacy,
        file_size: fileSize,
      },
    });

    // 更新相册照片计数
    await this.prisma.userAlbum.update({
      where: { id: data.album_id },
      data: { photo_count: { increment: 1 } },
    });

    // 更新存储用量
    await this.addStorageUsage(userId, fileSize);

    return {
      id: photo.id.toString(),
      file_url: photo.file_url,
      location_name: photo.location_name,
      taken_year: photo.taken_year,
      taken_date: photo.taken_date,
      privacy: photo.privacy,
    };
  }

  async updatePhoto(userId: string, photoId: bigint, data: {
    location_name?: string;
    taken_year?: number;
    taken_date?: string;
    description?: string;
    privacy?: SpacePrivacyLevel;
  }) {
    const photo = await this.prisma.userPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('照片不存在');
    if (photo.user_id !== userId) throw new ForbiddenException('无权操作此照片');

    const updateData: any = {};
    if (data.location_name !== undefined) updateData.location_name = data.location_name;
    if (data.taken_year !== undefined) {
      if (data.taken_year < 1900 || data.taken_year > new Date().getFullYear()) {
        throw new BadRequestException('请填写有效的年份');
      }
      updateData.taken_year = data.taken_year;
    }
    if (data.taken_date !== undefined) updateData.taken_date = new Date(data.taken_date);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.privacy !== undefined) updateData.privacy = data.privacy;

    const updated = await this.prisma.userPhoto.update({
      where: { id: photoId },
      data: updateData,
    });
    return {
      id: updated.id.toString(),
      album_id: updated.album_id.toString(),
      file_url: updated.file_url,
      thumbnail_url: updated.thumbnail_url,
      location_name: updated.location_name,
      taken_year: updated.taken_year,
      taken_date: updated.taken_date,
      description: updated.description,
      privacy: updated.privacy,
      file_size: updated.file_size?.toString(),
      created_at: updated.created_at,
    };
  }

  async deletePhoto(userId: string, photoId: bigint) {
    const photo = await this.prisma.userPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('照片不存在');
    if (photo.user_id !== userId) throw new ForbiddenException('无权操作此照片');

    // 删除照片
    await this.prisma.userPhoto.delete({ where: { id: photoId } });

    // 更新相册计数
    await this.prisma.userAlbum.update({
      where: { id: photo.album_id },
      data: { photo_count: { decrement: 1 } },
    });

    // 更新存储用量
    if (photo.file_size) {
      await this.subtractStorageUsage(userId, photo.file_size);
    }

    return { message: '照片已删除' };
  }

  async movePhoto(userId: string, photoId: bigint, targetAlbumId: bigint) {
    const photo = await this.prisma.userPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('照片不存在');
    if (photo.user_id !== userId) throw new ForbiddenException('无权操作此照片');

    const targetAlbum = await this.prisma.userAlbum.findUnique({
      where: { id: targetAlbumId },
    });
    if (!targetAlbum) throw new NotFoundException('目标相册不存在');
    if (targetAlbum.user_id !== userId) throw new ForbiddenException('无权操作目标相册');

    const oldAlbumId = photo.album_id;

    await this.prisma.userPhoto.update({
      where: { id: photoId },
      data: { album_id: targetAlbumId },
    });

    // 更新两个相册的计数
    await Promise.all([
      this.prisma.userAlbum.update({
        where: { id: oldAlbumId },
        data: { photo_count: { decrement: 1 } },
      }),
      this.prisma.userAlbum.update({
        where: { id: targetAlbumId },
        data: { photo_count: { increment: 1 } },
      }),
    ]);

    return { message: '照片已移动' };
  }

  // ==================== 留言板 ====================

  async listMessages(userId: string, params: {
    year?: number;
    page?: number;
    pageSize?: number;
  }) {
    const { year, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;
    const where: any = { user_id: userId };

    if (year) {
      where.created_at = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.userMessage.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { nickname: true, avatar_url: true, phone: true } },
        },
      }),
      this.prisma.userMessage.count({ where }),
    ]);

    return {
      data: items.map((m) => ({
        id: m.id.toString(),
        content: m.content,
        image_url: m.image_url,
        privacy: m.privacy,
        like_count: m.like_count,
        is_edited: m.is_edited,
        created_at: m.created_at,
        updated_at: m.updated_at,
        can_edit:
          new Date().getTime() - m.created_at.getTime() < 30 * 60 * 1000,
        author: {
          nickname: m.user.nickname || m.user.phone,
          avatar_url: m.user.avatar_url,
        },
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async createMessage(
    userId: string,
    data: { content: string; privacy?: SpacePrivacyLevel },
    imageFile?: Express.Multer.File,
  ) {
    if (!data.content || data.content.length > 200) {
      throw new BadRequestException('留言内容不能超过200字');
    }

    let imageUrl: string | null = null;

    if (imageFile) {
      const fileSize = BigInt(imageFile.size);
      await this.ensureStorage(userId, fileSize);

      const filename = `${Date.now()}_${imageFile.originalname}`;
      const filePath = path.join(this.storageRoot, filename);
      fs.writeFileSync(filePath, imageFile.buffer);
      imageUrl = `/personal/${filename}`;

      await this.addStorageUsage(userId, fileSize);
    }

    const message = await this.prisma.userMessage.create({
      data: {
        user_id: userId,
        content: data.content,
        image_url: imageUrl,
        privacy: (data.privacy as SpacePrivacyLevel) || SpacePrivacyLevel.clan,
      },
    });

    return {
      id: message.id.toString(),
      content: message.content,
      image_url: message.image_url,
      privacy: message.privacy,
      created_at: message.created_at,
    };
  }

  async updateMessage(userId: string, messageId: bigint, data: { content: string }) {
    const message = await this.prisma.userMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('留言不存在');
    if (message.user_id !== userId) throw new ForbiddenException('无权操作此留言');

    // 30分钟内可编辑
    const elapsed = new Date().getTime() - message.created_at.getTime();
    if (elapsed > 30 * 60 * 1000) {
      throw new BadRequestException('已超过可编辑时间（30分钟）');
    }

    if (!data.content || data.content.length > 200) {
      throw new BadRequestException('留言内容不能超过200字');
    }

    const updated = await this.prisma.userMessage.update({
      where: { id: messageId },
      data: { content: data.content, is_edited: true },
    });

    return {
      id: updated.id.toString(),
      content: updated.content,
      is_edited: updated.is_edited,
      updated_at: updated.updated_at,
    };
  }

  async deleteMessage(userId: string, messageId: bigint) {
    const message = await this.prisma.userMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('留言不存在');
    if (message.user_id !== userId) throw new ForbiddenException('无权操作此留言');

    await this.prisma.userMessage.delete({ where: { id: messageId } });
    return { message: '留言已删除' };
  }
}
