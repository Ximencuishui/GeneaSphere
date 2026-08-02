#!/usr/bin/env node
/* eslint-disable */
const path = require('path');
process.env.DATABASE_URL = 'postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere';
const { PrismaClient } = require(path.join('e:/GeneaSphere', 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();
(async () => {
  try {
    const users = await prisma.user.findMany({
      where: { phone: { in: ['13800000000', '13800000001'] } },
      select: { id: true, phone: true },
    });
    const clans = await prisma.clan.findMany({
      where: { name: '朱熹族谱（演示）' },
      select: { id: true, slug: true, name: true },
    });
    const memberships = await prisma.clanMember.findMany({
      where: { user_id: { in: users.map(u => u.id) } },
      select: { user_id: true, clan_id: true, role: true },
    });
    const out = {
      users,
      clans: clans.map(c => ({ ...c, id: String(c.id) })),
      memberships: memberships.map(m => ({ ...m, clan_id: String(m.clan_id) })),
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
