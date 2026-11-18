import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import {
  DEFAULT_VISITOR_PRIVACY,
  VisitorPrivacyRules,
  generationFromMaxDepth,
  mediaVisibleToVisitor,
} from './visitor-privacy';

export interface VisitorDecision {
  restricted: boolean;
  rules: VisitorPrivacyRules;
}

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async load(clanId: bigint): Promise<VisitorPrivacyRules> {
    const row = await this.prisma.privacySetting.findUnique({ where: { clan_id: clanId } });
    if (!row) return { ...DEFAULT_VISITOR_PRIVACY, verify_questions: [] };
    return {
      allow_visitor_deceased: row.allow_visitor_deceased,
      max_generations_visible: row.max_generations_visible,
      hide_living_photos: row.hide_living_photos,
      hide_living_spouses: row.hide_living_spouses,
      enable_relative_verify: row.enable_relative_verify,
      verify_questions: row.verify_questions || [],
      verify_max_attempts: row.verify_max_attempts,
    };
  }

  async isClanMember(clanId: bigint, userId: string): Promise<boolean> {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { admin_user_id: true },
    });
    if (clan?.admin_user_id === userId) return true;
    const member = await this.prisma.clanMember.findUnique({
      where: { clan_id_user_id: { clan_id: clanId, user_id: userId } },
      select: { user_id: true },
    });
    return !!member;
  }

  async forViewer(clanId: bigint, userId?: string | null): Promise<VisitorDecision> {
    const rules = await this.load(clanId);
    if (userId && await this.isClanMember(clanId, userId)) {
      return { restricted: false, rules };
    }
    return { restricted: true, rules };
  }

  async namedPeople(clanId: bigint) {
    const [persons, generations] = await Promise.all([
      this.prisma.person.findMany({
        where: { clan_id: clanId, deleted_at: null },
        select: { id: true, full_name: true, is_living: true },
      }),
      this.generationMap(clanId),
    ]);
    return persons.map((person) => ({
      full_name: person.full_name,
      is_living: person.is_living,
      generation: generations.get(person.id.toString()) ?? 1,
    }));
  }

  async generationMap(clanId: bigint): Promise<Map<string, number>> {
    const rows = await this.prisma.personAncestry.findMany({
      where: { descendant: { clan_id: clanId } },
      select: { descendant_id: true, depth: true },
    });
    const maxDepth = new Map<string, number>();
    for (const row of rows) {
      const id = row.descendant_id.toString();
      const prev = maxDepth.get(id);
      if (prev == null || row.depth > prev) maxDepth.set(id, row.depth);
    }
    const generations = new Map<string, number>();
    for (const [id, depth] of maxDepth) generations.set(id, generationFromMaxDepth(depth));
    return generations;
  }

  async personAccess(personId: bigint, userId?: string | null) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, clan_id: true, is_living: true },
    });
    if (!person) return null;
    const decision = await this.forViewer(person.clan_id, userId);
    let generation = 1;
    if (decision.restricted) {
      const map = await this.generationMap(person.clan_id);
      generation = map.get(person.id.toString()) ?? 1;
    }
    return { person, decision, generation };
  }

  async filterMedia<T extends { id: bigint | number | string }>(
    clanId: bigint,
    userId: string | undefined,
    rows: T[],
  ): Promise<T[]> {
    const decision = await this.forViewer(clanId, userId);
    if (!decision.restricted || rows.length === 0) return rows;
    const ids = rows.map((row) => BigInt(row.id));
    const links = await this.prisma.mediaPersonLink.findMany({
      where: { media_id: { in: ids } },
      select: { media_id: true, person: { select: { id: true, is_living: true } } },
    });
    const generations = await this.generationMap(clanId);
    const byMedia = new Map<string, Array<{ is_living: boolean; generation: number }>>();
    for (const link of links) {
      const key = link.media_id.toString();
      const list = byMedia.get(key) || [];
      list.push({
        is_living: link.person.is_living,
        generation: generations.get(link.person.id.toString()) ?? 1,
      });
      byMedia.set(key, list);
    }
    return rows.filter((row) => mediaVisibleToVisitor(byMedia.get(String(row.id)) || [], decision.rules));
  }
}
