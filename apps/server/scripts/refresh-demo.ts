import 'dotenv/config';
import { DemoSeedService } from '../src/auth/demo-seed.service';

/**
 * 刷新朱熹族谱（演示）数据
 *
 * 用法（需先确保数据库连接正常、.env 已配置）：
 *   npx ts-node -P scripts/tsconfig.json scripts/refresh-demo.ts
 */
async function main() {
  const service = new DemoSeedService();
  const prisma = (service as any).prisma;

  console.log('[refresh-demo] 查找演示家族...');
  const demoClan = await prisma.clan.findFirst({
    where: { name: '朱熹族谱（演示）' },
  });

  if (demoClan) {
    console.log(`[refresh-demo] 找到演示家族 id=${demoClan.id}，开始清空...`);
    await service.resetDemoClanData(demoClan.id);
    await prisma.clanMember.deleteMany({ where: { clan_id: demoClan.id } });
    await prisma.clan.delete({ where: { id: demoClan.id } });
    console.log('[refresh-demo] 旧演示家族已删除，准备重新生成...');
  } else {
    console.log('[refresh-demo] 未找到演示家族，直接生成...');
  }

  await service.seedDemoData();
  console.log('[refresh-demo] 演示数据刷新完成');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[refresh-demo] 刷新失败:', err);
  process.exit(1);
});
