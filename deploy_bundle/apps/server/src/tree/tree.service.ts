import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, Person, Gender } from '@prisma/client';

export interface TreeNode {
  id: string;
  name: string;
  gender: string;
  birth_date?: Date;
  death_date?: Date;
  is_living: boolean;
  children?: TreeNode[];
  marriages_history?: any[];
  avatar_url?: string;
  thumbnail_url?: string;
  has_photo: boolean;
}

export interface ClanTreeResponse {
  rootNode: TreeNode;
  mainLineage: string[];
  totalPersons: number;
}

@Injectable()
export class TreeService {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}
  async createPerson(
    data: {
      clan_id: bigint;
      full_name: string;
      gender: Gender;
      birth_date?: Date;
      death_date?: Date;
      is_living?: boolean;
    },
    parent_id?: bigint
  ): Promise<Person> {
    return await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          clan_id: data.clan_id,
          full_name: data.full_name,
          gender: data.gender,
          birth_date: data.birth_date,
          death_date: data.death_date,
          is_living: data.is_living ?? true,
        },
      });

      const ancestryRecords: Prisma.PersonAncestryCreateManyInput[] = [];

      ancestryRecords.push({
        ancestor_id: person.id,
        descendant_id: person.id,
        depth: 0,
      });

      if (parent_id) {
        const parentAncestries = await tx.personAncestry.findMany({
          where: { descendant_id: parent_id },
          select: { ancestor_id: true, depth: true },
        });

        for (const pa of parentAncestries) {
          ancestryRecords.push({
            ancestor_id: pa.ancestor_id,
            descendant_id: person.id,
            depth: pa.depth + 1,
          });
        }
      }

      await tx.personAncestry.createMany({
        data: ancestryRecords,
      });

      return person;
    });
  }

  async getSubTree(rootPersonId: bigint, includeHistoricalMarriages = false): Promise<TreeNode> {
    const descendants = await this.prisma.personAncestry.findMany({
      where: { ancestor_id: rootPersonId },
      include: {
        descendant: true,
      },
      orderBy: { depth: 'asc' },
    });

    if (descendants.length === 0) {
      const person = await this.prisma.person.findUnique({
        where: { id: rootPersonId },
      });
      if (!person) {
        throw new Error(`Person with id ${rootPersonId} not found`);
      }
      return await this.toTreeNode(person);
    }

    const nodeMap = new Map<string, TreeNode>();
    const childMap = new Map<string, string[]>();

    for (const record of descendants) {
      const person = record.descendant;
      const node = await this.toTreeNode(person);
      nodeMap.set(person.id.toString(), node);

      if (record.depth > 0) {
        const directParent = await this.getDirectParent(record.descendant_id);
        if (directParent) {
          const parentIdStr = directParent.toString();
          if (!childMap.has(parentIdStr)) {
            childMap.set(parentIdStr, []);
          }
          childMap.get(parentIdStr)!.push(record.descendant_id.toString());
        }
      }
    }

    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        const uniqueChildIds = [...new Set(childIds)];
        parentNode.children = uniqueChildIds
          .map((id) => nodeMap.get(id))
          .filter((node): node is TreeNode => node !== undefined);
      }
    }

    const rootNode = nodeMap.get(rootPersonId.toString());
    if (!rootNode) {
      throw new Error(`Root person with id ${rootPersonId} not found`);
    }

    // 如果需要历史婚姻信息，附加到每个节点
    if (includeHistoricalMarriages) {
      for (const [, node] of nodeMap) {
        const marriages = await this.prisma.marriageHistory.findMany({
          where: { person_id: BigInt(node.id) },
          include: { spouse: { select: { id: true, full_name: true } } },
          orderBy: { start_date: 'desc' },
        });
        node.marriages_history = marriages.map((m) => ({
          spouse_name: m.spouse.full_name,
          marriage_type: m.marriage_type,
          is_current: m.is_current,
          start_date: m.start_date,
          end_date: m.end_date,
          end_reason: m.end_reason,
        }));
      }
    }

    return rootNode;
  }

  /**
   * Get full clan tree data with avatar info and main lineage path
   */
  async getClanFullTree(clanId: bigint, userId?: string): Promise<ClanTreeResponse> {
    // Find the root person(s) of this clan
    const rootPerson = await this.findClanRootPerson(clanId);
    if (!rootPerson) {
      throw new Error(`No root person found for clan ${clanId}`);
    }

    // Get subtree from root
    const rootNode = await this.getSubTree(rootPerson.id);

    // Find main lineage: from root to the user's linked person
    let mainLineage: string[] = [];
    if (userId) {
      mainLineage = await this.findMainLineagePath(clanId, rootPerson.id, userId);
    }

    // Count total persons
    const totalPersons = await this.prisma.person.count({
      where: { clan_id: clanId },
    });

    return {
      rootNode,
      mainLineage,
      totalPersons,
    };
  }

  /**
   * Find the clan root person (the one with no parents, depth 0 self-reference)
   */
  private async findClanRootPerson(clanId: bigint): Promise<Person | null> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      orderBy: { id: 'asc' },
    });

    for (const person of persons) {
      const hasParent = await this.prisma.personAncestry.findFirst({
        where: {
          descendant_id: person.id,
          depth: 1,
        },
      });
      if (!hasParent) {
        return person;
      }
    }

    return persons.length > 0 ? persons[0] : null;
  }

  /**
   * Find the main lineage path from the clan root to the user-linked person
   */
  private async findMainLineagePath(clanId: bigint, rootPersonId: bigint, userId: string): Promise<string[]> {
    // Find the person linked to this user within this clan
    const userLink = await this.prisma.personUserLink.findFirst({
      where: {
        user_id: userId,
        person: { clan_id: clanId },
      },
      include: { person: true },
    });

    if (!userLink) {
      // Fallback: use the last descendant in the root's ancestry tree
      const lastDescendant = await this.prisma.personAncestry.findFirst({
        where: { ancestor_id: rootPersonId },
        orderBy: { depth: 'desc' },
        select: { descendant_id: true },
      });
      if (!lastDescendant) return [rootPersonId.toString()];

      // Trace back from the last descendant to root
      return this.buildLineagePath(lastDescendant.descendant_id, rootPersonId);
    }

    // Build path from user's linked person up to root
    return this.buildLineagePath(userLink.person.id, rootPersonId);
  }

  /**
   * Build a lineage path from a person up to a specific ancestor
   */
  private async buildLineagePath(fromPersonId: bigint, toAncestorId: bigint): Promise<string[]> {
    const path: string[] = [];
    let currentId = fromPersonId;

    // Add the starting person
    path.push(currentId.toString());

    // Maximum iterations to prevent infinite loops
    let safety = 100;

    while (currentId !== toAncestorId && safety > 0) {
      safety--;

      const directParent = await this.getDirectParent(currentId);
      if (!directParent) break;

      path.unshift(directParent.toString());
      currentId = directParent;
    }

    return path;
  }

  /**
   * Find avatar URL for a person via MediaPersonLink
   */
  private async findPersonAvatar(personId: bigint): Promise<{ avatar_url?: string; thumbnail_url?: string; has_photo: boolean }> {
    try {
      const mediaLink = await this.prisma.mediaPersonLink.findFirst({
        where: { person_id: personId },
        include: { media: { select: { file_url: true } } },
        orderBy: { media: { created_at: 'desc' } },
      });

      if (mediaLink) {
        // Build thumbnail URL from original file URL
        const fileUrl = mediaLink.media.file_url;
        const thumbnailUrl = fileUrl.replace('/media/', '/media/thumbnails/');
        // Extract filename and try to construct thumbnail path
        const parts = fileUrl.split('/');
        const filename = parts[parts.length - 1];
        const extIndex = filename.lastIndexOf('.');
        const basename = extIndex > -1 ? filename.substring(0, extIndex) : filename;
        const ext = extIndex > -1 ? filename.substring(extIndex) : '.jpg';

        return {
          avatar_url: fileUrl,
          thumbnail_url: `/media/thumbnails/${basename}_80w${ext}`,
          has_photo: true,
        };
      }

      return { has_photo: false };
    } catch {
      return { has_photo: false };
    }
  }

  private async getDirectParent(personId: bigint): Promise<bigint | null> {
    const parentAncestry = await this.prisma.personAncestry.findFirst({
      where: {
        descendant_id: personId,
        depth: 1,
      },
      select: { ancestor_id: true },
    });
    return parentAncestry?.ancestor_id ?? null;
  }

  private async toTreeNode(person: Person): Promise<TreeNode> {
    const avatarInfo = await this.findPersonAvatar(person.id);
    return {
      id: person.id.toString(),
      name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date,
      death_date: person.death_date,
      is_living: person.is_living,
      children: [],
      avatar_url: avatarInfo.avatar_url,
      thumbnail_url: avatarInfo.thumbnail_url,
      has_photo: avatarInfo.has_photo,
    };
  }

  async moveSubTree(subtreeRootId: bigint, newParentId: bigint): Promise<void> {
    return await this.prisma.$transaction(async (tx) => {
      const subtreeDescendants = await tx.personAncestry.findMany({
        where: { ancestor_id: subtreeRootId },
        select: { descendant_id: true },
      });

      const allSubtreeIds = subtreeDescendants.map((d) => d.descendant_id);

      if (allSubtreeIds.includes(newParentId)) {
        throw new Error('Cannot move subtree to itself or a descendant');
      }

      const oldPaths = await tx.personAncestry.findMany({
        where: {
          descendant_id: { in: allSubtreeIds },
        },
      });

      const oldAncestorIds = [...new Set(oldPaths.map((p) => p.ancestor_id))];
      const nonSubtreeAncestors = oldAncestorIds.filter((id) => !allSubtreeIds.includes(id));

      await tx.personAncestry.deleteMany({
        where: {
          descendant_id: { in: allSubtreeIds },
          ancestor_id: { in: nonSubtreeAncestors },
        },
      });

      const newParentAncestries = await tx.personAncestry.findMany({
        where: { descendant_id: newParentId },
        select: { ancestor_id: true, depth: true },
      });

      const newAncestryRecords: Prisma.PersonAncestryCreateManyInput[] = [];

      for (const subtreeId of allSubtreeIds) {
        const selfRecord = oldPaths.find(
          (p) => p.ancestor_id === subtreeId && p.descendant_id === subtreeId
        );

        if (selfRecord) {
          newAncestryRecords.push({
            ancestor_id: selfRecord.ancestor_id,
            descendant_id: selfRecord.descendant_id,
            depth: selfRecord.depth,
          });
        }

        const subtreeInternalPaths = oldPaths.filter(
          (p) =>
            p.descendant_id === subtreeId &&
            allSubtreeIds.includes(p.ancestor_id) &&
            p.ancestor_id !== subtreeId
        );

        for (const internalPath of subtreeInternalPaths) {
          newAncestryRecords.push({
            ancestor_id: internalPath.ancestor_id,
            descendant_id: internalPath.descendant_id,
            depth: internalPath.depth,
          });
        }

        const subtreeRootDepth = oldPaths.find(
          (p) => p.ancestor_id === subtreeRootId && p.descendant_id === subtreeId
        )?.depth ?? 0;

        for (const parentAncestry of newParentAncestries) {
          newAncestryRecords.push({
            ancestor_id: parentAncestry.ancestor_id,
            descendant_id: subtreeId,
            depth: parentAncestry.depth + 1 + subtreeRootDepth,
          });
        }
      }

      await tx.personAncestry.createMany({
        data: newAncestryRecords,
        skipDuplicates: true,
      });
    });
  }
}
