import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { CreateClanDto, UpdateClanDto } from './dto/create-clan.dto';

@Injectable()
export class ClanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new clan
   * @param createClanDto - Clan data
   * @param userId - ID of the user creating the clan (becomes admin)
   * @returns The created clan
   */
  async create(createClanDto: CreateClanDto, userId: string) {
    const { name, description, settings_json } = createClanDto;

    return this.prisma.clan.create({
      data: {
        name,
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
  }

  /**
   * Find all clans (with pagination)
   * @param userId - Filter by user ID (optional)
   * @returns List of clans
   */
  async findAll(userId?: string) {
    const where = userId ? { admin_user_id: userId } : {};

    return this.prisma.clan.findMany({
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

    return clan;
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

    return this.prisma.clan.update({
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

    return {
      person_count: personCount,
      media_count: mediaCount,
      family_count: familyCount,
    };
  }
}
