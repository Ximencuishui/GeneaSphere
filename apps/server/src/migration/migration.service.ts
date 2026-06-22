import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { AdminService } from '../admin/admin.service';
import {
  CreateMigrationEventDto,
} from './dto/create-migration-event.dto';
import { UpdateMigrationEventDto } from './dto/update-migration-event.dto';
import { LinkLocationMediaDto } from './dto/link-location-media.dto';

/**
 * 迁徙地图服务
 *
 * 提供 POI 聚合、迁徙事件 CRUD、朝代数据、地点-图片关联等核心能力。
 */
@Injectable()
export class MigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  // ==================== POI 聚合 ====================

  /**
   * 聚合生成 POI 列表
   *
   * 数据来源：
   *   1) persons.birth_place + persons.death_place
   *   2) migration_events.from_location / to_location
   *
   * 返回每个 POI 包含：
   *   - name（地点名）
   *   - lat / lng（首选手动经纬度，其次任意来源）
   *   - person_count：在该地出生或死亡的族人数量
   *   - media_count：地点关联的影像数量
   *   - time_range：{ earliest, latest }
   *   - source: 'birth' | 'death' | 'migration' | 'mixed'
   */
  async getPois(clanId: bigint, branch?: string) {
    // 拉取人物出生/死亡地（按支系过滤）
    const persons = await this.prisma.person.findMany({
      where: {
        clan_id: clanId,
        ...(branch ? { migration_branch: branch } : {}),
      },
      select: {
        id: true,
        full_name: true,
        birth_date: true,
        death_date: true,
        birth_place: true,
        birth_lat: true,
        birth_lng: true,
        death_place: true,
        death_lat: true,
        death_lng: true,
        migration_branch: true,
      },
    });

    // 拉取迁徙事件
    const events = await this.prisma.migrationEvent.findMany({
      where: {
        clan_id: clanId,
        ...(branch ? { branch } : {}),
      },
      orderBy: { event_year: 'asc' },
    });

    // 拉取地点-图片关联，统计每个地点的照片数量
    const locationMediaRaw = await this.prisma.migrationLocationMedia.findMany({
      where: { clan_id: clanId },
      select: { location_name: true, media_id: true },
    });
    const mediaCountByLocation = new Map<string, Set<bigint>>();
    for (const lm of locationMediaRaw) {
      const set = mediaCountByLocation.get(lm.location_name) || new Set();
      set.add(lm.media_id);
      mediaCountByLocation.set(lm.location_name, set);
    }

    // 聚合 POI（用 Map 按地点名归一）
    type POIData = {
      name: string;
      lat?: number;
      lng?: number;
      person_count: number;
      media_count: number;
      earliest_year?: number;
      latest_year?: number;
      source: 'birth' | 'death' | 'migration' | 'mixed';
      branch?: string | null;
      person_ids: bigint[];
    };
    const poiMap = new Map<string, POIData>();

    const ensurePoi = (name: string): POIData | null => {
      if (!name || !name.trim()) return null;
      const key = name.trim();
      if (!poiMap.has(key)) {
        poiMap.set(key, {
          name: key,
          person_count: 0,
          media_count: 0,
          source: 'migration',
          person_ids: [],
        });
      }
      return poiMap.get(key)!;
    };

    // 1) 处理出生地
    for (const p of persons) {
      if (!p.birth_place) continue;
      const poi = ensurePoi(p.birth_place);
      if (!poi) continue;
      poi.person_count++;
      poi.person_ids.push(p.id);
      if (p.birth_lat != null && poi.lat == null) poi.lat = p.birth_lat;
      if (p.birth_lng != null && poi.lng == null) poi.lng = p.birth_lng;
      if (p.birth_date) {
        const y = new Date(p.birth_date).getFullYear();
        if (poi.earliest_year == null || y < poi.earliest_year) poi.earliest_year = y;
        if (poi.latest_year == null || y > poi.latest_year) poi.latest_year = y;
      }
      if (!poi.branch) poi.branch = p.migration_branch;
      // 升级 source
      if (poi.source === 'migration') poi.source = 'birth';
      else if (poi.source !== 'birth') poi.source = 'mixed';
    }

    // 2) 处理死亡地
    for (const p of persons) {
      if (!p.death_place) continue;
      const poi = ensurePoi(p.death_place);
      if (!poi) continue;
      poi.person_count++;
      poi.person_ids.push(p.id);
      if (p.death_lat != null && poi.lat == null) poi.lat = p.death_lat;
      if (p.death_lng != null && poi.lng == null) poi.lng = p.death_lng;
      if (p.death_date) {
        const y = new Date(p.death_date).getFullYear();
        if (poi.earliest_year == null || y < poi.earliest_year) poi.earliest_year = y;
        if (poi.latest_year == null || y > poi.latest_year) poi.latest_year = y;
      }
      // 升级 source
      if (poi.source === 'migration') poi.source = 'death';
      else if (poi.source !== 'death') poi.source = 'mixed';
    }

    // 3) 处理迁徙事件
    for (const e of events) {
      for (const loc of [
        { name: e.from_location, lat: e.from_lat, lng: e.from_lng },
        { name: e.to_location, lat: e.to_lat, lng: e.to_lng },
      ]) {
        const poi = ensurePoi(loc.name);
        if (!poi) continue;
        if (loc.lat != null && poi.lat == null) poi.lat = loc.lat;
        if (loc.lng != null && poi.lng == null) poi.lng = loc.lng;
        if (poi.earliest_year == null || e.event_year < poi.earliest_year) {
          poi.earliest_year = e.event_year;
        }
        if (poi.latest_year == null || e.event_year > poi.latest_year) {
          poi.latest_year = e.event_year;
        }
      }
    }

    // 4) 关联照片数量
    for (const [name, set] of mediaCountByLocation.entries()) {
      const poi = ensurePoi(name);
      if (poi) poi.media_count = set.size;
    }

    // 5) 转换为返回结构
    const result = Array.from(poiMap.values()).map((poi) => ({
      id: poi.name,
      name: poi.name,
      lat: poi.lat ?? null,
      lng: poi.lng ?? null,
      person_count: poi.person_count,
      media_count: poi.media_count,
      earliest_year: poi.earliest_year,
      latest_year: poi.latest_year,
      source: poi.source,
      branch: poi.branch,
    }));

    // 按最早年份排序（无年份的排后面）
    result.sort((a, b) => {
      const ay = a.earliest_year ?? 99999;
      const by = b.earliest_year ?? 99999;
      return ay - by;
    });

    return result;
  }

  // ==================== 迁徙事件 CRUD ====================

  async getEvents(clanId: bigint, branch?: string) {
    const events = await this.prisma.migrationEvent.findMany({
      where: {
        clan_id: clanId,
        ...(branch ? { branch } : {}),
      },
      orderBy: { event_year: 'asc' },
      include: {
        person: {
          select: {
            id: true,
            full_name: true,
            gender: true,
            birth_date: true,
            death_date: true,
          },
        },
      },
    });

    return events.map((e) => ({
      id: e.id.toString(),
      clan_id: e.clan_id.toString(),
      person_id: e.person_id?.toString() ?? null,
      person: e.person
        ? {
            id: e.person.id.toString(),
            full_name: e.person.full_name,
            gender: e.person.gender,
            birth_date: e.person.birth_date?.toISOString() ?? null,
            death_date: e.person.death_date?.toISOString() ?? null,
          }
        : null,
      branch: e.branch,
      from_location: e.from_location,
      from_lat: e.from_lat,
      from_lng: e.from_lng,
      to_location: e.to_location,
      to_lat: e.to_lat,
      to_lng: e.to_lng,
      event_year: e.event_year,
      reason: e.reason,
      description: e.description,
      created_at: e.created_at.toISOString(),
    }));
  }

  async getBranches(clanId: bigint) {
    // 从 persons + migration_events 中提取所有支系标签
    const persons = await this.prisma.person.findMany({
      where: {
        clan_id: clanId,
        NOT: { migration_branch: null },
      },
      select: { migration_branch: true },
      distinct: ['migration_branch'],
    });
    const events = await this.prisma.migrationEvent.findMany({
      where: {
        clan_id: clanId,
        NOT: { branch: null },
      },
      select: { branch: true },
      distinct: ['branch'],
    });

    const set = new Set<string>();
    for (const p of persons) {
      if (p.migration_branch) set.add(p.migration_branch);
    }
    for (const e of events) {
      if (e.branch) set.add(e.branch);
    }

    return Array.from(set).sort().map((name) => ({ name }));
  }

  async createEvent(
    clanId: bigint,
    userId: string,
    dto: CreateMigrationEventDto,
  ) {
    await this.adminService.requireAdmin(clanId, userId);

    if (!dto.from_location?.trim() || !dto.to_location?.trim()) {
      throw new BadRequestException('迁出地和迁入地不能为空');
    }
    if (dto.from_location === dto.to_location) {
      throw new BadRequestException('迁出地和迁入地不能相同');
    }

    const event = await this.prisma.migrationEvent.create({
      data: {
        clan_id: clanId,
        person_id: dto.person_id ? BigInt(dto.person_id) : null,
        branch: dto.branch || null,
        from_location: dto.from_location.trim(),
        from_lat: dto.from_lat ?? null,
        from_lng: dto.from_lng ?? null,
        to_location: dto.to_location.trim(),
        to_lat: dto.to_lat ?? null,
        to_lng: dto.to_lng ?? null,
        event_year: dto.event_year,
        reason: dto.reason || null,
        description: dto.description || null,
        creator_id: userId,
      },
    });

    return {
      id: event.id.toString(),
      message: '迁徙事件已创建',
    };
  }

  async updateEvent(
    clanId: bigint,
    userId: string,
    id: string,
    dto: UpdateMigrationEventDto,
  ) {
    await this.adminService.requireAdmin(clanId, userId);

    const existing = await this.prisma.migrationEvent.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
    });
    if (!existing) {
      throw new NotFoundException('迁徙事件不存在');
    }

    await this.prisma.migrationEvent.update({
      where: { id: existing.id },
      data: {
        person_id:
          dto.person_id !== undefined
            ? dto.person_id
              ? BigInt(dto.person_id)
              : null
            : existing.person_id,
        branch: dto.branch !== undefined ? dto.branch : existing.branch,
        from_location: dto.from_location ?? existing.from_location,
        from_lat: dto.from_lat !== undefined ? dto.from_lat : existing.from_lat,
        from_lng: dto.from_lng !== undefined ? dto.from_lng : existing.from_lng,
        to_location: dto.to_location ?? existing.to_location,
        to_lat: dto.to_lat !== undefined ? dto.to_lat : existing.to_lat,
        to_lng: dto.to_lng !== undefined ? dto.to_lng : existing.to_lng,
        event_year: dto.event_year ?? existing.event_year,
        reason: dto.reason !== undefined ? dto.reason : existing.reason,
        description:
          dto.description !== undefined ? dto.description : existing.description,
      },
    });

    return { message: '迁徙事件已更新' };
  }

  async deleteEvent(clanId: bigint, userId: string, id: string) {
    await this.adminService.requireAdmin(clanId, userId);

    const existing = await this.prisma.migrationEvent.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
    });
    if (!existing) {
      throw new NotFoundException('迁徙事件不存在');
    }

    await this.prisma.migrationEvent.delete({
      where: { id: existing.id },
    });

    return { message: '迁徙事件已删除' };
  }

  // ==================== 朝代数据 ====================

  async getDynasties() {
    const list = await this.prisma.historicalDynasty.findMany({
      orderBy: { start_year: 'asc' },
    });
    return list.map((d) => ({
      id: d.id,
      name: d.name,
      start_year: d.start_year,
      end_year: d.end_year,
      geojson_url: d.geojson_url,
      description: d.description,
      color: d.color,
      fill_opacity: d.fill_opacity,
      label_position: d.label_position,
    }));
  }

  // ==================== 地点-图片关联 ====================

  async getLocationMedia(clanId: bigint, locationName: string) {
    if (!locationName?.trim()) return [];
    const links = await this.prisma.migrationLocationMedia.findMany({
      where: {
        clan_id: clanId,
        location_name: locationName.trim(),
      },
      orderBy: { display_order: 'asc' },
      include: {
        media: {
          select: {
            id: true,
            file_url: true,
            taken_year: true,
            taken_location: true,
            description: true,
            media_type: true,
          },
        },
      },
    });
    return links.map((l) => ({
      id: l.id.toString(),
      location_name: l.location_name,
      display_order: l.display_order,
      media: {
        id: l.media.id.toString(),
        file_url: l.media.file_url,
        taken_year: l.media.taken_year,
        taken_location: l.media.taken_location,
        description: l.media.description,
        media_type: l.media.media_type,
      },
    }));
  }

  async linkLocationMedia(
    clanId: bigint,
    userId: string,
    dto: LinkLocationMediaDto,
  ) {
    await this.adminService.requireAdmin(clanId, userId);

    if (!dto.location_name?.trim() || !dto.media_id) {
      throw new BadRequestException('地点名称和图片 ID 不能为空');
    }

    // 校验图片属于该家族
    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(dto.media_id), clan_id: clanId },
    });
    if (!media) {
      throw new NotFoundException('图片不存在或不属于当前家族');
    }

    // 防止重复关联
    const existing = await this.prisma.migrationLocationMedia.findFirst({
      where: {
        clan_id: clanId,
        location_name: dto.location_name.trim(),
        media_id: BigInt(dto.media_id),
      },
    });
    if (existing) {
      throw new BadRequestException('该图片已关联到该地点');
    }

    const link = await this.prisma.migrationLocationMedia.create({
      data: {
        clan_id: clanId,
        location_name: dto.location_name.trim(),
        media_id: BigInt(dto.media_id),
        display_order: dto.display_order ?? 0,
        linked_by: userId,
      },
    });

    return {
      id: link.id.toString(),
      message: '图片已关联到地点',
    };
  }

  async unlinkLocationMedia(
    clanId: bigint,
    userId: string,
    linkId: string,
  ) {
    await this.adminService.requireAdmin(clanId, userId);

    const existing = await this.prisma.migrationLocationMedia.findFirst({
      where: { id: BigInt(linkId), clan_id: clanId },
    });
    if (!existing) {
      throw new NotFoundException('关联记录不存在');
    }

    await this.prisma.migrationLocationMedia.delete({
      where: { id: existing.id },
    });
    return { message: '已解除关联' };
  }

  // ==================== 地点经纬度补全（管理员） ====================

  /**
   * 获取所有缺少经纬度的地点名（用于管理员手动补充）
   */
  async getLocationsMissingCoords(clanId: bigint) {
    const pois = await this.getPois(clanId);
    return pois
      .filter((p) => p.lat == null || p.lng == null)
      .map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        person_count: p.person_count,
      }));
  }

  /**
   * 直接在数据库中把所有该地名对应的 person / event 经纬度一次性补齐
   */
  async fillLocationCoords(
    clanId: bigint,
    userId: string,
    locationName: string,
    lat: number,
    lng: number,
  ) {
    await this.adminService.requireAdmin(clanId, userId);

    if (!locationName?.trim()) {
      throw new BadRequestException('地点名称不能为空');
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException('经纬度格式不正确');
    }

    const name = locationName.trim();
    const [birthUpd, deathUpd, fromUpd, toUpd] = await Promise.all([
      this.prisma.person.updateMany({
        where: {
          clan_id: clanId,
          birth_place: name,
          OR: [{ birth_lat: null }, { birth_lng: null }],
        },
        data: { birth_lat: lat, birth_lng: lng },
      }),
      this.prisma.person.updateMany({
        where: {
          clan_id: clanId,
          death_place: name,
          OR: [{ death_lat: null }, { death_lng: null }],
        },
        data: { death_lat: lat, death_lng: lng },
      }),
      this.prisma.migrationEvent.updateMany({
        where: {
          clan_id: clanId,
          from_location: name,
          OR: [{ from_lat: null }, { from_lng: null }],
        },
        data: { from_lat: lat, from_lng: lng },
      }),
      this.prisma.migrationEvent.updateMany({
        where: {
          clan_id: clanId,
          to_location: name,
          OR: [{ to_lat: null }, { to_lng: null }],
        },
        data: { to_lat: lat, to_lng: lng },
      }),
    ]);

    return {
      message: '已补全经纬度',
      updated_person_birth: birthUpd.count,
      updated_person_death: deathUpd.count,
      updated_event_from: fromUpd.count,
      updated_event_to: toUpd.count,
    };
  }
}
