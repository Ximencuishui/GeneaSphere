import 'dotenv/config';
import { DemoSeedService } from '../apps/server/src/auth/demo-seed.service';

/**
 * 为演示家族应用图片影像类冷启动数据（非破坏性）。
 *
 * 用法：
 *   npx ts-node scripts/seed-demo-media.ts
 *
 * 前置条件：
 *   - packages/db/.env 中 DATABASE_URL 已配置
 *   - 演示家族（朱熹族谱（演示））已存在
 *   - 演示用户（13800000000）已存在
 *
 * 幂等：重复执行不会重复创建数据。
 */
async function main() {
  const service = new DemoSeedService();
  const prisma = (service as any).prisma;

  console.log('[seed-demo-media] 查找演示家族...');
  const demoClan = await prisma.clan.findFirst({
    where: { name: '朱熹族谱（演示）' },
  });
  if (!demoClan) {
    console.error('[seed-demo-media] 未找到演示家族（朱熹族谱（演示）），请先运行演示数据初始化');
    process.exit(1);
  }

  const demoUser = await prisma.user.findUnique({
    where: { phone: '13800000000' },
  });
  if (!demoUser) {
    console.error('[seed-demo-media] 未找到演示用户（13800000000），请先运行演示数据初始化');
    process.exit(1);
  }

  console.log(`[seed-demo-media] 找到演示家族 id=${demoClan.id}，开始补充影像数据...`);
  await (service as any).seedMediaDemoData(demoClan.id, demoUser.id.toString());
  console.log('[seed-demo-media] 影像数据初始化完成');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[seed-demo-media] 初始化失败:', err);
  process.exit(1);
});
