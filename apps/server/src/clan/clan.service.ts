import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { CreateClanDto, UpdateClanDto } from './dto/create-clan.dto';
import { ClanResolverService } from '../common/clan-resolver.service';
import { serializeBigInt } from '../common/bigint-serializer';

@Injectable()
export class ClanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  /**
   * 统一出口序列化：把 Prisma 结果里的 BigInt 字段全部转 string，
   * 避免 Express res.json() 抛 'Do not know how to serialize a BigInt'。
   */
  private toJson<T>(value: T): T {
    return serializeBigInt(value);
  }

  /**
   * Create a new clan
   * @param createClanDto - Clan data
   * @param userId - ID of the user creating the clan (becomes admin)
   * @returns The created clan
   */
  async create(createClanDto: CreateClanDto, userId: string) {
    const { name, description, settings_json } = createClanDto;

    const slug = await this.clanResolver.generateUniqueSlug(name);

    const result = await this.prisma.clan.create({
      data: {
        name,
        slug,
        description,
        settings_json,
        admin_user_id: userId,
      },
      include: {
        admin_user: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });
    return this.toJson(result);
  }

  /**
   * Find all clans (with pagination)
   * @param userId - Filter by user ID (optional)
   * @returns List of clans
   */
  async findAll(userId?: string) {
    const where = userId ? { admin_user_id: userId } : {};

    const rows = await this.prisma.clan.findMany({
      where,
      include: {
        admin_user: {
          select: {
            id: true,
            phone: true,
          },
        },
        _count: {
          select: {
            persons: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    return this.toJson(rows);
  }

  /**
   * Find a clan by ID
   * @param id - Clan ID
   * @returns The clan or null
   */
  async findOne(id: bigint) {
    const clan = await this.prisma.clan.findUnique({
      where: { id },
      include: {
        admin_user: {
          select: {
            id: true,
            phone: true,
          },
        },
        persons: {
          take: 10,
          orderBy: {
            created_at: 'desc',
          },
        },
        _count: {
          select: {
            persons: true,
            media: true,
          },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with ID ${id} not found`);
    }

    return this.toJson(clan);
  }

  /**
   * Find a clan by slug
   * @param slug - Clan slug (e.g., 'zhuxi-demo')
   * @returns The clan or null
   */
  async findBySlug(slug: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { slug },
      include: {
        admin_user: {
          select: {
            id: true,
            phone: true,
          },
        },
        persons: {
          take: 10,
          orderBy: {
            created_at: 'desc',
          },
        },
        _count: {
          select: {
            persons: true,
            media: true,
          },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with slug '${slug}' not found`);
    }

    return this.toJson(clan);
  }

  /**
   * Update a clan
   * @param id - Clan ID
   * @param updateClanDto - Data to update
   * @param userId - ID of the user making the request
   * @returns The updated clan
   */
  async update(id: bigint, updateClanDto: UpdateClanDto, userId: string) {
    // Check if clan exists and user is admin
    const clan = await this.prisma.clan.findUnique({
      where: { id },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with ID ${id} not found`);
    }

    if (clan.admin_user_id !== userId) {
      throw new ForbiddenException('Only the clan admin can update this clan');
    }

    const result = await this.prisma.clan.update({
      where: { id },
      data: updateClanDto,
      include: {
        admin_user: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });
    return this.toJson(result);
  }

  /**
   * Delete a clan
   * @param id - Clan ID
   * @param userId - ID of the user making the request
   */
  async remove(id: bigint, userId: string) {
    // Check if clan exists and user is admin
    const clan = await this.prisma.clan.findUnique({
      where: { id },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with ID ${id} not found`);
    }

    if (clan.admin_user_id !== userId) {
      throw new ForbiddenException('Only the clan admin can delete this clan');
    }

    // Delete the clan (cascade will delete related records)
    await this.prisma.clan.delete({
      where: { id },
    });

    return { message: `Clan with ID ${id} deleted successfully` };
  }

  /**
   * Get clan statistics
   * @param id - Clan ID
   * @returns Statistics about the clan
   */
  async getStatistics(id: bigint) {
    const [personCount, mediaCount, familyCount] = await Promise.all([
      this.prisma.person.count({
        where: { clan_id: id },
      }),
      this.prisma.mediaArchive.count({
        where: { clan_id: id },
      }),
      this.prisma.familyUnit.count({
        where: { clan_id: id },
      }),
    ]);

    return this.toJson({
      person_count: personCount,
      media_count: mediaCount,
      family_count: familyCount,
    });
  }
}
