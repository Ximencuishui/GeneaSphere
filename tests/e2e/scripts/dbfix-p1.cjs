#!/usr/bin/env node
/* eslint-disable */
const path = require('path');
process.env.DATABASE_URL = 'postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere';
const { PrismaClient } = require(path.join('e:/GeneaSphere', 'node_modules', '@prisma', 'client'));
const prisma = new PrismaClient();
(async () => {
  try {
    // Fix P1: 13800000000 must be OWNER in demo clan
    const admin = await prisma.user.findUnique({ where: { phone: '13800000000' }, select: { id: true } });
    const demoClan = await prisma.clan.findFirst({ where: { name: '朱熹族谱（演示）' }, select: { id: true } });
    if (!admin || !demoClan) {
      console.error('missing demo admin user or demo clan');
      process.exit(1);
    }
    const before = await prisma.clanMember.findFirst({
      where: { user_id: admin.id, clan_id: BigInt(demoClan.id) },
      select: { id: true, role: true },
    });
    console.log('before:', JSON.stringify({ admin: admin.id, clan: demoClan.id, before }, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    if (before) {
      const updated = await prisma.clanMember.update({
        where: { id: before.id },
        data: { role: 'OWNER' },
        select: { id: true, role: true },
      });
      console.log('after:', JSON.stringify(updated, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } else {
      const created = await prisma.clanMember.create({
        data: { user_id: admin.id, clan_id: BigInt(demoClan.id), role: 'OWNER' },
        select: { id: true, role: true },
      });
      console.log('created:', JSON.stringify(created, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    }
    // Verify both demo accounts
    const all = await prisma.clanMember.findMany({
      where: { user: { phone: { in: ['13800000000', '13800000001'] } } },
      select: { user_id: true, role: true, clan: { select: { name: true } } },
    });
    console.log('verify:', JSON.stringify(all, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
