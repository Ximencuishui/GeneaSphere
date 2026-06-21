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

  async getSubTree(rootPersonId: bigint): Promise<TreeNode> {
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
      return this.toTreeNode(person);
    }

    const nodeMap = new Map<string, TreeNode>();
    const childMap = new Map<string, string[]>();

    for (const record of descendants) {
      const person = record.descendant;
      const node = this.toTreeNode(person);
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

    return rootNode;
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

  private toTreeNode(person: Person): TreeNode {
    return {
      id: person.id.toString(),
      name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date,
      death_date: person.death_date,
      is_living: person.is_living,
      children: [],
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
