import { ReviewStatus } from '@prisma/client';

/** 未通过审核的影像不对族人公开。没有审核单的旧数据仍可见。 */
export const hiddenUntilApproved = {
  deleted_at: null,
  NOT: {
    reviews: {
      some: { status: { in: [ReviewStatus.PENDING, ReviewStatus.REJECTED] } },
    },
  },
};

export function publicMediaWhere(
  clanId: bigint,
  filters?: { taken_year?: number; taken_location?: string },
) {
  const where: Record<string, unknown> = {
    clan_id: clanId,
    ...hiddenUntilApproved,
  };
  if (filters?.taken_year !== undefined) {
    where.taken_year = filters.taken_year;
  }
  if (filters?.taken_location) {
    where.taken_location = { contains: filters.taken_location };
  }
  return where;
}

/** 聚落封面：本族、未删除、已设封面，并且满足公开列表的审核可见规则。 */
export function coverMediaWhere(clanId: bigint) {
  return {
    ...publicMediaWhere(clanId),
    is_cover: true,
  };
}
