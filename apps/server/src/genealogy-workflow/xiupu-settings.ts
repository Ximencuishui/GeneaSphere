import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';

export const XIUPU_STAGE_KEYS = [
  'project',
  'digitize',
  'internal_review',
  'errata_notice',
  'errata_revise',
  'lock',
  'render',
  'print',
] as const;

export type XiupuStageKey = (typeof XIUPU_STAGE_KEYS)[number];
export type XiupuMode = 'serial' | 'free';

export interface XiupuLock {
  locked_at: string;
  locked_by: string;
  operator_name: string;
  version_name: string;
}

export interface XiupuFinalReject {
  reason: string;
  at: string;
  operator_name: string;
}

export interface XiupuSettings {
  mode: XiupuMode;
  suspended: string[];
  lock: XiupuLock | null;
  final_reject: XiupuFinalReject | null;
  /** 旧谱电子化被驳回后，主修再次提交谱稿初审的时间。新的驳回晚于该时间才会再次回流。 */
  digitize_resubmitted_at: string | null;
}

const KEY = 'xiupu';

export function readXiupu(settings: unknown): XiupuSettings {
  const raw = (settings as Record<string, unknown> | null)?.[KEY] as Partial<XiupuSettings> | undefined;
  const suspended = Array.isArray(raw?.suspended)
    ? raw.suspended.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    mode: raw?.mode === 'free' ? 'free' : 'serial',
    suspended,
    lock: raw?.lock && typeof raw.lock.locked_at === 'string' ? (raw.lock as XiupuLock) : null,
    final_reject:
      raw?.final_reject && typeof raw.final_reject.reason === 'string'
        ? (raw.final_reject as XiupuFinalReject)
        : null,
    digitize_resubmitted_at:
      typeof raw?.digitize_resubmitted_at === 'string' ? raw.digitize_resubmitted_at : null,
  };
}

export async function loadXiupu(prisma: PrismaService, clanId: bigint) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { settings_json: true },
  });
  return {
    settings: readXiupu(clan?.settings_json),
    raw: (clan?.settings_json as Record<string, unknown> | null) ?? {},
  };
}

export async function saveXiupu(
  prisma: PrismaService,
  clanId: bigint,
  updater: (current: XiupuSettings) => XiupuSettings,
) {
  await prisma.$transaction(async (tx) => {
    const clan = await tx.clan.findUnique({
      where: { id: clanId },
      select: { settings_json: true },
    });
    const raw = (clan?.settings_json as Record<string, unknown> | null) ?? {};
    const next = updater(readXiupu(raw));
    await tx.clan.update({
      where: { id: clanId },
      data: { settings_json: { ...raw, [KEY]: next } as unknown as Prisma.InputJsonValue },
    });
  });
}

/** 终审锁稿后，世系和人物核心信息不能再改。 */
export async function assertPedigreeUnlocked(prisma: PrismaService, clanId: bigint) {
  const { settings } = await loadXiupu(prisma, clanId);
  if (settings.lock) {
    throw new ConflictException('谱系已终审锁稿，不能修改世系和人物核心信息。如需修改，请由族长解锁。');
  }
}

/** 册谱渲染只允许读取已经锁定的定稿。 */
export async function assertPedigreeLocked(prisma: PrismaService, clanId: bigint) {
  const { settings } = await loadXiupu(prisma, clanId);
  if (!settings.lock) {
    throw new ConflictException('请先完成终审定稿锁谱，再生成册谱');
  }
}
