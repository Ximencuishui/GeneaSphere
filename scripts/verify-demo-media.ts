import 'dotenv/config';
import { DemoSeedService } from '../apps/server/src/auth/demo-seed.service';

async function main() {
  const service = new DemoSeedService();
  const prisma = (service as any).prisma;

  const clan = await prisma.clan.findFirst({ where: { name: '朱熹族谱（演示）' } });
  if (!clan) {
    console.log('未找到演示家族');
    await prisma.$disconnect();
    return;
  }

  const [albums, media, links, events, locMedia] = await Promise.all([
    prisma.clanAlbum.count({ where: { clan_id: clan.id } }),
    prisma.mediaArchive.count({ where: { clan_id: clan.id } }),
    prisma.mediaPersonLink.count({ where: { media: { clan_id: clan.id } } }),
    prisma.familyEvent.count({ where: { clan_id: clan.id } }),
    prisma.migrationLocationMedia.count({ where: { clan_id: clan.id } }),
  ]);

  console.log({
    clanId: clan.id.toString(),
    albums,
    media,
    mediaPersonLinks: links,
    familyEvents: events,
    migrationLocationMedia: locMedia,
  });

  await prisma.$disconnect();
}

main().catch(console.error);
