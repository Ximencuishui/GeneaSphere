import 'dotenv/config';
import { DemoSeedService } from '../apps/server/src/auth/demo-seed.service';

/**
 * 清理 migration_location_media 表中重复记录，保留每条 (clan_id, location_name, media_id) 中 id 最小的一条。
 */
async function main() {
  const service = new DemoSeedService();
  const prisma = (service as any).prisma;

  const result = await prisma.$executeRaw`
    DELETE FROM migration_location_media
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY clan_id, location_name, media_id
            ORDER BY id ASC
          ) AS rn
        FROM migration_location_media
      ) t
      WHERE t.rn > 1
    )
  `;

  console.log(`[cleanup] 已删除重复迁徙地点配图：${result} 条`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[cleanup] 失败:', err);
  process.exit(1);
});
