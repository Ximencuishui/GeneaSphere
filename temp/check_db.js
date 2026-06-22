const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('检查讨论功能数据表...\n');
  
  const tables = [
    { name: 'discussion_groups', check: () => prisma.discussionGroup.count() },
    { name: 'group_members', check: () => prisma.groupMember.count() },
    { name: 'group_topics', check: () => prisma.groupTopic.count() },
    { name: 'topic_replies', check: () => prisma.topicReply.count() },
    { name: 'discussion_summaries', check: () => prisma.discussionSummary.count() },
    { name: 'summary_versions', check: () => prisma.summaryVersion.count() },
  ];
  
  let allOk = true;
  for (const t of tables) {
    try {
      const count = await t.check();
      console.log(`✅ ${t.name} 表存在，记录数: ${count}`);
    } catch (e) {
      console.log(`❌ ${t.name} 表不存在`);
      allOk = false;
    }
  }
  
  if (allOk) {
    console.log('\n🎉 所有讨论功能数据表已创建完成！');
  } else {
    console.log('\n⚠️ 部分数据表缺失，需要重新同步');
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
