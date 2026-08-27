import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Gender } from '@geneasphere/db';
import {
  ReviewStatus,
  ApplicationStatus,
  ModificationStatus,
  RelationChangeStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ADMIN_AVATAR,
  MEMBER_AVATAR,
  HISTORICAL_AVATAR,
  MALE_AVATAR,
  FEMALE_AVATAR,
  CLAN_COVER_IMAGE,
  DEMO_MEDIA_IMAGES,
} from './demo-assets';
/**
 * 演示种子数据服务 - 朱熹族谱版（1000 人）
 * 始祖朱熹（1130-1200），覆盖约 28 代。
 */
@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);
  private prisma = new PrismaClient();
  async onModuleInit() { await this.seedDemoData(); }
  async resetDemoClanData(clanId: bigint) {
    // 1) 先收集该家族所有 person_id，后续按 id 引用精准清理孤儿记录
    const personIds = (
      await this.prisma.person.findMany({
        where: { clan_id: clanId },
        select: { id: true },
      })
    ).map((p) => p.id);
    const personIdList = personIds.length > 0 ? personIds : [-1n];

    // 2) 整段包进事务：任一步失败整体回滚，避免 familyUnit 残留撞 unique 约束。
    //    随着演示数据增多，删除 1000+ 人物及关联记录可能超过默认 5s 事务超时，
    //    故将超时延长至 60s。
    await this.prisma.$transaction(async (tx) => {
      // a) 删各类审批/申请记录（多表引用 person_id，必须先清）
      //    familyRelationChange 的 person_id/target_person_id 非级联外键，需按
      //    person 兜底删除（兼容 clan_id 不一致的残留记录，避免删 person 时外键报错）
      await tx.familyRelationChange.deleteMany({
        where: {
          OR: [
            { clan_id: clanId },
            { person_id: { in: personIdList } },
            { target_person_id: { in: personIdList } },
          ],
        },
      });
      await tx.personModificationRequest.deleteMany({
        where: { OR: [{ clan_id: clanId }, { person_id: { in: personIdList } }] },
      });
      await tx.mergeApplication.deleteMany({ where: { clan_id: clanId } });
      await tx.bioReview.deleteMany({ where: { person_id: { in: personIdList } } });

      // b) 删影像及关联审核（按 clan_id 清，避免旧数据残留）
      await tx.mediaReview.deleteMany({ where: { media: { clan_id: clanId } } });
      await tx.migrationLocationMedia.deleteMany({ where: { clan_id: clanId } });
      await tx.mediaPersonLink.deleteMany({ where: { media: { clan_id: clanId } } });
      await tx.mediaArchive.deleteMany({ where: { clan_id: clanId } });
      await tx.clanAlbum.deleteMany({ where: { clan_id: clanId } });

      // c) 删公告、家族大事件、迁徙事件、册谱卷宗等 clan 级数据
      await tx.clanAnnouncement.deleteMany({ where: { clan_id: clanId } });
      await tx.familyEvent.deleteMany({ where: { clan_id: clanId } });
      await tx.migrationEvent.deleteMany({ where: { clan_id: clanId } });
      await tx.bookAnnotation.deleteMany({ where: { volume: { clan_id: clanId } } });
      await tx.bookVolume.deleteMany({ where: { clan_id: clanId } });
      await tx.dataSnapshot.deleteMany({ where: { clan_id: clanId } });
      await tx.privacySetting.deleteMany({ where: { clan_id: clanId } });
      await tx.clanCouncilMember.deleteMany({ where: { clan_id: clanId } });
      await tx.clanRevisionTeamMember.deleteMany({ where: { clan_id: clanId } });
      await tx.xipai.deleteMany({ where: { clan_id: clanId } });

      // d) 删 familyChild：先按 family.clan_id 清；再扫孤儿（family.clan_id != clanId
      //    但 child_id 引用本家族 person 的记录），避免下次重建时 family_unit 还残留
      //    child 关系导致 UNIQUE 冲突
      await tx.familyChild.deleteMany({ where: { family: { clan_id: clanId } } });
      await tx.familyChild.deleteMany({ where: { child_id: { in: personIdList } } });

      // e) 删 familyUnit：按 clan_id 清；再扫孤儿 family_unit（clan_id != 目标 clanId
      //    但 husband/wife 引用本家族 person 的）—— 这是上次 TRUNCATE CASCADE 没清干净的
      //    来源。直接按 husband_id/wife_id IN personIdList 兜底，确保彻底干净
      await tx.familyUnit.deleteMany({ where: { clan_id: clanId } });
      await tx.familyUnit.deleteMany({
        where: {
          OR: [
            { husband_id: { in: personIdList } },
            { wife_id: { in: personIdList } },
          ],
        },
      });

      // f) 删 personAncestry（闭包表）：ancestor 或 descendant 任一引用本家族 person 即清
      await tx.personAncestry.deleteMany({
        where: {
          OR: [
            { ancestor_id: { in: personIdList } },
            { descendant_id: { in: personIdList } },
          ],
        },
      });

      // g) 最后兜底：所有可能引用了 person_id 的表全部按 personIdList 清一遍，
      //    防止新增的非级联外键（如 family_relation_changes_person_id）遗漏，
      //    确保删 person 时不再触发任何 P2003 外键约束报错
      await tx.personModificationRequest.deleteMany({ where: { person_id: { in: personIdList } } });
      await tx.mergeApplication.deleteMany({ where: { matched_person_id: { in: personIdList } } });
      await tx.bioReview.deleteMany({ where: { person_id: { in: personIdList } } });
      await tx.familyRelationChange.deleteMany({ where: { OR: [{ person_id: { in: personIdList } }, { target_person_id: { in: personIdList } }] } });
      await tx.videoProject.deleteMany({ where: { target_person_id: { in: personIdList } } });
      await tx.lineageVideoProject.deleteMany({ where: { center_person_id: { in: personIdList } } });
      await tx.migrationEvent.deleteMany({ where: { person_id: { in: personIdList } } });
      await tx.personUserLink.deleteMany({ where: { person_id: { in: personIdList } } });
      await tx.familyBookProject.deleteMany({ where: { start_person_id: { in: personIdList } } });

      // h) 最后才删 person
      await tx.person.deleteMany({ where: { clan_id: clanId } });
    }, { timeout: 60000 });

    this.logger.log(`已清空家族 ${clanId} 的人物/家庭/祖先关系（含孤儿记录兜底清理，共 ${personIds.length} 人）`);
  }
  async seedDemoData() {
    try {
      const demoPasswordHash = await bcrypt.hash('demo123', 10);
      let demoUser = await this.prisma.user.findUnique({ where: { phone: '13800000000' } });
      if (!demoUser) {
        demoUser = await this.prisma.user.create({
          data: {
            phone: '13800000000',
            password_hash: demoPasswordHash,
            nickname: '演示用户·管理员',
            email: 'demo@geneasphere.com',
            gender: 'male',
            avatar_url: ADMIN_AVATAR,
          },
        });
        this.logger.log(`演示用户已创建: 13800000000 / demo123 (avatar=${ADMIN_AVATAR})`);
      } else {
        await this.prisma.user.update({
          where: { phone: '13800000000' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoUser.nickname || '演示用户·管理员',
            email: demoUser.email || 'demo@geneasphere.com',
            avatar_url: demoUser.avatar_url || ADMIN_AVATAR,
          },
        });
      }
      let demoMemberUser = await this.prisma.user.findUnique({ where: { phone: '13800000001' } });
      if (!demoMemberUser) {
        demoMemberUser = await this.prisma.user.create({
          data: {
            phone: '13800000001',
            password_hash: demoPasswordHash,
            nickname: '演示族员·朱小小',
            email: 'member@geneasphere.com',
            gender: 'male',
            avatar_url: MEMBER_AVATAR,
          },
        });
      } else {
        await this.prisma.user.update({
          where: { phone: '13800000001' },
          data: {
            password_hash: demoPasswordHash,
            nickname: demoMemberUser.nickname || '演示族员·朱小小',
            email: demoMemberUser.email || 'member@geneasphere.com',
            avatar_url: demoMemberUser.avatar_url || MEMBER_AVATAR,
          },
        });
      }
      for (const userId of [demoUser.id, demoMemberUser.id]) {
        const setting = await this.prisma.userSetting.findUnique({ where: { user_id: userId } });
        if (!setting) await this.prisma.userSetting.create({ data: { user_id: userId } });
      }
      const legacyClan = await this.prisma.clan.findFirst({ where: { name: '李氏宗族（演示）' } });
      if (legacyClan) {
        this.logger.log(`发现旧演示家族 李氏宗族（演示）(id=${legacyClan.id})，清理中...`);
        await this.resetDemoClanData(legacyClan.id);
        await this.prisma.clanMember.deleteMany({ where: { clan_id: legacyClan.id } });
        await this.prisma.clan.delete({ where: { id: legacyClan.id } });
        this.logger.log('旧演示家族已清理');
      }
      let demoClan = await this.prisma.clan.findFirst({ where: { name: '朱熹族谱（演示）' } });
      const isFirstCreate = !demoClan;
      if (!demoClan) {
        demoClan = await this.prisma.clan.create({
          data: { name: '朱熹族谱（演示）', slug: 'zhuxi-demo', description: this.buildClanDescription(), admin_user: { connect: { id: demoUser.id } } },
        });
        await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoUser.id, role: 'OWNER' } });
        const stats = await this.createDemoZhuXiGenealogy(demoClan.id);
        this.logger.log(`✅ 朱熹族谱已生成: ${stats.totalPersons} 位族人, ${stats.totalFamilies} 个家庭`);
      } else {
        const existing = await this.prisma.clanMember.findUnique({ where: { clan_id_user_id: { clan_id: demoClan.id, user_id: demoUser.id } } });
        if (!existing) await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoUser.id, role: 'OWNER' } });
        // [2026-08-20] 老库兼容：补齐老 demo 家族缺失的 slug 字段（老 seed 漏写）
        if (!demoClan.slug) {
          await this.prisma.clan.update({ where: { id: demoClan.id }, data: { slug: 'zhuxi-demo' } });
          this.logger.log(`  ✅ 补齐 demo 家族 slug=zhuxi-demo`);
        }
      }
      const existingMemberClan = await this.prisma.clanMember.findUnique({ where: { clan_id_user_id: { clan_id: demoClan.id, user_id: demoMemberUser.id } } });
      if (!existingMemberClan) await this.prisma.clanMember.create({ data: { clan_id: demoClan.id, user_id: demoMemberUser.id, role: 'EDITOR' } });

      // ==================== 朱小小 Person 记录 + PersonUserLink 关联 ====================
      // 族员演示账号（13800000001）作为朱熹长房后裔"朱小小"在族谱中真实存在
      // 使用 upsert 保证幂等：多次启动 seed 不会重复创建
      let zhuxiaoxiao = await this.prisma.person.findFirst({
        where: { clan_id: demoClan.id, full_name: '朱小小' },
      });
      if (!zhuxiaoxiao) {
        zhuxiaoxiao = await this.prisma.person.create({
          data: {
            clan_id: demoClan.id,
            full_name: '朱小小',
            gender: 'male' as Gender,
            birth_date: new Date('2000-01-01'),
            death_date: null,
            is_living: true,
            birth_place: '福建武夷山',
            migration_branch: 'A',
            avatar_url: MEMBER_AVATAR,
            thumbnail_url: MEMBER_AVATAR,
          },
        });
        this.logger.log(`✅ 朱小小 Person 记录已创建: id=${zhuxiaoxiao.id}`);
      } else if (!zhuxiaoxiao.avatar_url) {
        zhuxiaoxiao = await this.prisma.person.update({
          where: { id: zhuxiaoxiao.id },
          data: { avatar_url: MEMBER_AVATAR, thumbnail_url: MEMBER_AVATAR },
        });
      }

      // 创建或更新 PersonUserLink 关联（族员账号 ↔ 朱小小 Person）
      const existingLink = await this.prisma.personUserLink.findFirst({
        where: { user_id: demoMemberUser.id, person_id: zhuxiaoxiao.id, relation_role: 'self' },
      });
      if (!existingLink) {
        await this.prisma.personUserLink.create({
          data: {
            user_id: demoMemberUser.id,
            person_id: zhuxiaoxiao.id,
            relation_role: 'self',
            verified_at: new Date(),
          },
        });
        this.logger.log(`✅ PersonUserLink 已创建: user=${demoMemberUser.id} -> 朱小小(person=${zhuxiaoxiao.id})`);
      }

      // [2026-08-16] 确保朱小小挂入族谱树（避免演示族出现"无家庭关联的孤立账号"）：
      // 以族内最深男性后代为父，补写 person_ancestry / family_units / family_children。
      // 幂等：已存在父链则跳过。旧库可能已有孤立朱小小，同样在此补挂。
      const zxxHasParent = await this.prisma.personAncestry.findFirst({
        where: { descendant_id: zhuxiaoxiao.id, depth: 1, ancestor_id: { not: zhuxiaoxiao.id } },
        select: { ancestor_id: true },
      });
      if (!zxxHasParent) {
        const attachTarget = await this.attachZhuxiaoxiaoToTree(demoClan.id, zhuxiaoxiao.id);
        this.logger.log(`✅ 朱小小已挂入族谱: 父=${attachTarget}`);
      }

      // P2-2 修复：确保 demoClan.description 始终有内容（与前端「家族简介」占位文案一致）
      // 首次创建时 line 134 已带 description；后续重启动时也幂等补齐老数据库的空字段。
      const targetDescription = this.buildClanDescription();
      if (demoClan.description !== targetDescription) {
        await this.prisma.clan.update({
          where: { id: demoClan.id },
          data: { description: targetDescription },
        });
      }

      // [2026-08-20] 补齐册谱卷宗冷启动数据（卷一谱序源流 + 卷二/三世录）
      await this.seedBookVolumes(demoClan.id, demoUser.id.toString());

      // [2026-08-21] 补齐家族概况冷启动数据：精神、家规、口号、来源 + 理事会 + 修谱小组
      await this.seedClanOverview(demoClan.id);

      // [2026-08-24] 补齐迁徙事件冷启动数据，让迁徙地图首次打开即有轨迹可展示
      await this.seedMigrationEvents(demoClan.id, demoUser.id.toString());

      // [2026-08-24] 补齐图片影像类演示数据：相册、影像、人物关联、家族大事件、迁徙地点配图
      await this.seedMediaDemoData(demoClan.id, demoUser.id.toString());

      // [2026-08-24] 补齐公告与各类审批演示数据
      await this.seedAnnouncements(demoClan.id, demoUser.id.toString());
      await this.seedReviewAndApprovalData(demoClan.id, demoUser.id.toString(), demoMemberUser.id.toString());

      await this.seedPlatformAdmin();
    } catch (error) {
      this.logger.error('种子数据初始化失败:', error.message);
      this.logger.error(error.stack);
    }
  }

  /**
   * 册谱卷宗冷启动：为演示家族补齐卷一谱序源流 + 卷二/三世录（幂等）。
   * 注意：不能"存在即跳过"——老库可能已有 cepu.getVolumes() 空库自动生成的占位卷
   * （卷一内容为"（此处录入谱序…）"占位符），必须逐卷幂等补齐，否则卷一永远停留在占位状态。
   */
  private async seedBookVolumes(clanId: bigint, adminUserId: string) {
    // 卷一：谱序源流（文档卷，含姓氏源流、朱熹简介、修谱宗旨、凡例、修谱人员）
    const volume1Content = `<h2 style="text-align:center;">朱氏族谱谱序</h2>
<h3 style="text-align:center;color:#666;">——暨《紫阳朱氏宗谱》首修序</h3>
<p style="text-indent:2em;">盖闻木本水源，人心敦本；春露秋霜，孝思不匮。姓氏之传，家族之系，犹江河之有源，枝叶之有根也。朱氏得姓，肇自微子，衍于沛国，播迁四方，而我闽中紫阳一脉，实理学宗师朱文公熹之后裔也。</p>
<h4>一、姓氏源流</h4>
<p style="text-indent:2em;">朱氏起源于曹挟邾国，战国时期去"邑"为"朱"，遂有朱姓。两汉之际，沛国朱氏为望族，世居安徽宿州。南唐永嘉陵参政朱廷畴，为紫阳朱氏入闽始祖。廷畴四世孙朱松，任福建建州尤溪县尉，携家寓居尤溪。朱松之子朱熹，字元晦，号紫阳，生于宋建炎四年（1130年），卒于庆元六年（1200年），为宋代理学集大成者，世称"朱子"。</p>
<h4>二、家族源流</h4>
<p style="text-indent:2em;">文公朱熹，原籍江西婺源，五世祖朱惟甫任福建建州录事参军，遂家于建宁府崇安县五夫里。曾祖朱森、祖朱绚、父朱松，世有隐德。公生于尤溪，幼随父迁居崇安，师从李侗，亲炙洛学。绍兴十八年（1148年）进士及第，历仕泉州同安主簿、知南康军、提举浙东常平茶盐公事、焕章阁待制等职。庆元党禁起，落职奉祠，筑室建阳考亭，聚徒讲学，创白鹿洞书院，亲订《白鹿洞书院学规》，为后世书院楷模。</p>
<p style="text-indent:2em;">文公三子：长朱塾，字子厚；次朱埜，字子桀；季朱在，字子思。皆以父荫入仕，各有传述。长房朱塾之孙朱鉴，编《朱文公实纪》；季房朱在续修族谱，辑《朱子实纪》十二卷，为吾族文献之祖。自宋而元，而明，而清，以至近世，子孙繁衍，分布于闽、赣、浙、苏、皖各省，蔚为江南望族。</p>
<h4>三、本次修谱宗旨</h4>
<p style="text-indent:2em;">岁在乙巳，适逢文公诞辰八百九十五周年，族中贤达倡议续修族谱，以彰先德，以联族谊，以启后昆。本次修谱，遵循"存真求实"之原则，上溯源流，下续世系，旁及艺文，兼录女眷，务求周备。又值信息时代，本谱采用数字化技术编纂，可于线上浏览检索，便于海内外宗亲互联互通，共续紫阳血脉。</p>
<h4>四、凡例</h4>
<ul style="line-height:1.8;">
<li>一、本谱以朱熹为一世祖，依次编排，不遗漏任何裔孙。</li>
<li>二、男子书名，女子书氏；已嫁者随夫姓，已聘者书"字"。</li>
<li>三、字号、籍贯、生卒年月日时、葬地，皆据实录入；无考者缺之。</li>
<li>四、功名、官职、著述，择要记载，以彰先德。</li>
<li>五、养子、入赘，注明其故，以明血统。</li>
<li>六、节妇、孝子、烈女，酌情立传，以励风化。</li>
<li>七、女性入"闺秀录"，与男性"世系录"并列，各从其类。</li>
</ul>
<h4>五、修谱人员名单</h4>
<table style="width:100%;border-collapse:collapse;margin-top:8px;">
<tr style="background:#f5f5f5;"><th style="border:1px solid #ddd;padding:8px;text-align:left;">姓名</th><th style="border:1px solid #ddd;padding:8px;text-align:left;">辈分</th><th style="border:1px solid #ddd;padding:8px;text-align:left;">职责</th></tr>
<tr><td style="border:1px solid #ddd;padding:8px;">朱熹</td><td style="border:1px solid #ddd;padding:8px;">一世祖</td><td style="border:1px solid #ddd;padding:8px;">创始修谱（宋）</td></tr>
<tr><td style="border:1px solid #ddd;padding:8px;">朱在</td><td style="border:1px solid #ddd;padding:8px;">二世</td><td style="border:1px solid #ddd;padding:8px;">续修《朱子实纪》（宋嘉定）</td></tr>
<tr><td style="border:1px solid #ddd;padding:8px;">朱鉴</td><td style="border:1px solid #ddd;padding:8px;">三世</td><td style="border:1px solid #ddd;padding:8px;">编《朱文公实纪》（宋）</td></tr>
<tr><td style="border:1px solid #ddd;padding:8px;">编纂委员会</td><td style="border:1px solid #ddd;padding:8px;">第28世</td><td style="border:1px solid #ddd;padding:8px;">本次续修主持</td></tr>
</table>
<p style="margin-top:24px;text-align:right;">朱氏族谱续修理事会 敬撰<br/>公元二〇二五年（岁次乙巳）</p>`;

    // 卷一：存在但为占位符内容 → 替换为完整谱序；已完整/已编辑 → 不动
    const vol1 = await this.prisma.bookVolume.findFirst({
      where: { clan_id: clanId, type: 'document', sort_order: 1 },
    });
    if (!vol1) {
      await this.prisma.bookVolume.create({
        data: {
          clan_id: clanId,
          sort_order: 1,
          title: '卷一 谱序源流',
          type: 'document',
          content: volume1Content,
          created_by: adminUserId,
        },
      });
      this.logger.log('  ✅ 卷一谱序源流已创建');
    } else if (!vol1.content || vol1.content.includes('此处录入谱序')) {
      await this.prisma.bookVolume.update({
        where: { id: vol1.id },
        data: { content: volume1Content, created_by: adminUserId },
      });
      this.logger.log(`  ✅ 卷一谱序源流占位内容已替换为完整谱序（id=${vol1.id}）`);
    } else {
      this.logger.log('  卷一谱序源流内容已完整，跳过');
    }

    // 卷二：世系录（世录卷，男性）—— 已存在则不动（保留默认/用户配置）
    const vol2 = await this.prisma.bookVolume.findFirst({
      where: { clan_id: clanId, type: 'shilu', sort_order: 2 },
    });
    if (!vol2) {
      await this.prisma.bookVolume.create({
        data: {
          clan_id: clanId,
          sort_order: 2,
          title: '卷二 世系录',
          type: 'shilu',
          config: { gender_filter: 'male', layout: 'su' },
          created_by: adminUserId,
        },
      });
      this.logger.log('  ✅ 卷二世系录已创建');
    }

    // 卷三：闺秀录（世录卷，女性）—— 已存在则不动
    const vol3 = await this.prisma.bookVolume.findFirst({
      where: { clan_id: clanId, type: 'shilu', sort_order: 3 },
    });
    if (!vol3) {
      await this.prisma.bookVolume.create({
        data: {
          clan_id: clanId,
          sort_order: 3,
          title: '卷三 闺秀录',
          type: 'shilu',
          config: { gender_filter: 'female', layout: 'su' },
          created_by: adminUserId,
        },
      });
      this.logger.log('  ✅ 卷三闺秀录已创建');
    }

    this.logger.log('  册谱卷宗冷启动检查完成（卷一谱序源流、卷二世系录、卷三闺秀录）');
  }

  /** 家族概况冷启动：精神、家规、口号、来源 + 理事会 + 修谱小组 */
  private async seedClanOverview(clanId: bigint) {
    // 1) 补齐家族基础信息（spirit / rules / slogan / origin_place）
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) return;

    const needUpdate =
      !clan.slogan ||
      !clan.origin_place ||
      !clan.spirit ||
      !clan.rules;

    if (needUpdate) {
      await this.prisma.clan.update({
        where: { id: clanId },
        data: {
          slogan: clan.slogan || '传承朱子家训，弘扬理学精神',
          origin_place: clan.origin_place || '江西婺源',
          spirit: clan.spirit || '忠孝传家远，诗书继世长。\n恪守朱子家训，秉持格物致知、诚意正心、修身齐家、治国平天下之道。',
          rules: clan.rules || '一、孝父母：百善孝为先，晨昏定省，侍奉无怠。\n二、友兄弟：手足情深，兄友弟恭，和睦相处。\n三、谨夫妇：相敬如宾，勤俭持家，共育后代。\n四、教子孙：诗书传家，以德为先，严慈相济。\n五、睦宗族：宗族和睦，守望相助，患难与共。\n六、重丧祭：慎终追远，祭祀以诚，不忘根本。\n七、崇节俭：戒奢以俭，量入为出，积善余庆。\n八、守国法：奉公守法，不涉邪僻，立身行道。',
        },
      });
      this.logger.log('  ✅ 家族概况信息已补齐（口号/来源/精神/家规）');
    }

    // 2) 家族理事会成员（幂等：按姓名+clan_id判断）
    const existingCouncil = await this.prisma.clanCouncilMember.findMany({
      where: { clan_id: clanId },
      select: { name: true },
    });
    const existingNames = new Set(existingCouncil.map((m) => m.name));

    const councilMembers = [
      { name: '朱国栋', contact: '13800001001', position: '理事长', remark: '朱熹第 25 世孙，退休教师，主持理事会工作' },
      { name: '朱昌华', contact: '13800001002', position: '副理事长', remark: '朱熹第 26 世孙，企业家，负责外联与筹款' },
      { name: '朱盛荣', contact: '13800001003', position: '理事', remark: '朱熹第 27 世孙，退休干部，负责族务协调' },
      { name: '朱明德', contact: '13800001004', position: '理事', remark: '朱熹第 28 世孙，中学教师，负责文化研究' },
      { name: '朱耀辉', contact: '13800001005', position: '监事', remark: '朱熹第 27 世孙，会计师，负责财务监督' },
    ];

    const newCouncil = councilMembers.filter((m) => !existingNames.has(m.name));
    if (newCouncil.length > 0) {
      await this.prisma.clanCouncilMember.createMany({
        data: newCouncil.map((m, i) => ({
          clan_id: clanId,
          name: m.name,
          contact: m.contact,
          position: m.position,
          sort_order: i,
          remark: m.remark,
        })),
      });
      this.logger.log(`  ✅ 家族理事会成员已创建：${newCouncil.length} 人`);
    }

    // 3) 修谱小组成员（幂等：按姓名+clan_id判断）
    const existingRevision = await this.prisma.clanRevisionTeamMember.findMany({
      where: { clan_id: clanId },
      select: { name: true },
    });
    const existingRevisionNames = new Set(existingRevision.map((m) => m.name));

    const revisionMembers = [
      { name: '朱文斌', contact: '13800002001', duty: '主编', remark: '朱熹第 26 世孙，历史系教授，主修谱牒学' },
      { name: '朱武强', contact: '13800002002', duty: '副主编', remark: '朱熹第 27 世孙，地方志办公室退休，负责世系考订' },
      { name: '朱秀兰', contact: '13800002003', duty: '资料搜集', remark: '朱熹第 28 世孙女，负责走访调研、老谱收集' },
      { name: '朱慧敏', contact: '13800002004', duty: '文字录入', remark: '朱熹第 29 世孙女，负责文字录入与校对' },
      { name: '朱致远', contact: '13800002005', duty: '排版设计', remark: '朱熹第 28 世孙，平面设计师，负责版式设计' },
      { name: '朱守正', contact: '13800002006', duty: '校对审核', remark: '朱熹第 25 世孙，退休编辑，负责终校把关' },
    ];

    const newRevision = revisionMembers.filter((m) => !existingRevisionNames.has(m.name));
    if (newRevision.length > 0) {
      await this.prisma.clanRevisionTeamMember.createMany({
        data: newRevision.map((m, i) => ({
          clan_id: clanId,
          name: m.name,
          contact: m.contact,
          duty: m.duty,
          sort_order: i,
          remark: m.remark,
        })),
      });
      this.logger.log(`  ✅ 修谱小组成员已创建：${newRevision.length} 人`);
    }

    // 4) 字辈表（幂等：按 clan_id+generation 判断，表结构 @@unique([clan_id, generation])）
    //    第 N 世用字 = ZIBEI_CHARS[N-1]，与种子人物“朱+字辈+名”的命名规则保持一致。
    const existingXipai = await this.prisma.xipai.findMany({
      where: { clan_id: clanId },
      select: { generation: true },
    });
    const existingXipaiGens = new Set(existingXipai.map((x) => x.generation));

    const newXipai = DemoSeedService.ZIBEI_CHARS.map((char, idx) => {
      const generation = idx + 1;
      return {
        generation,
        character: char,
        note: idx === 0 ? '始迁祖朱熹（字元晦，号晦庵）用字' : `朱熹后裔第 ${generation} 世用字`,
      };
    }).filter((x) => !existingXipaiGens.has(x.generation));

    if (newXipai.length > 0) {
      await this.prisma.xipai.createMany({
        data: newXipai.map((x) => ({
          clan_id: clanId,
          generation: x.generation,
          character: x.character,
          note: x.note,
        })),
      });
      this.logger.log(`  ✅ 字辈表已创建：${newXipai.length} 个字辈（第 1~${DemoSeedService.ZIBEI_CHARS.length} 世）`);
    }
  }

  /**
   * 迁徙事件冷启动：为演示家族生成若干标志性迁徙轨迹（幂等）。
   * 事件覆盖朱熹先祖入闽、朱熹迁居考亭、后裔分迁婺源/杭州/福州/台湾等，
   * 让迁徙地图首次打开即有 POI 与迁徙线可展示。
   */
  private async seedMigrationEvents(clanId: bigint, creatorId: string) {
    const events: Array<{
      personName?: string;
      branch?: string;
      from_location: string;
      from_lat: number;
      from_lng: number;
      to_location: string;
      to_lat: number;
      to_lng: number;
      event_year: number;
      reason: 'WAR' | 'BUSINESS' | 'OFFICIAL' | 'RECLAMATION' | 'FAMINE' | 'OTHER';
      description: string;
    }> = [
      {
        branch: 'A',
        from_location: '江西婺源',
        from_lat: 29.248,
        from_lng: 117.862,
        to_location: '福建尤溪',
        to_lat: 26.171,
        to_lng: 118.193,
        event_year: 1130,
        reason: 'OFFICIAL',
        description: '朱熹之父朱松任尤溪县尉，携家眷自婺源入闽，朱熹即生于尤溪。',
      },
      {
        personName: '朱熹',
        branch: 'A',
        from_location: '福建尤溪',
        from_lat: 26.171,
        from_lng: 118.193,
        to_location: '福建崇安',
        to_lat: 27.756,
        to_lng: 118.026,
        event_year: 1143,
        reason: 'OFFICIAL',
        description: '朱松调任建州，朱熹随父迁居崇安五夫里，师从刘子翚、胡宪等。',
      },
      {
        personName: '朱熹',
        branch: 'A',
        from_location: '福建崇安',
        from_lat: 27.756,
        from_lng: 118.026,
        to_location: '福建建阳',
        to_lat: 27.332,
        to_lng: 118.12,
        event_year: 1172,
        reason: 'OTHER',
        description: '朱熹卜居建阳考亭，在此讲学著述，世称“考亭学派”。',
      },
      {
        personName: '朱铨',
        branch: 'A',
        from_location: '福建建阳',
        from_lat: 27.332,
        from_lng: 118.12,
        to_location: '江西婺源',
        to_lat: 29.248,
        to_lng: 117.862,
        event_year: 1210,
        reason: 'OTHER',
        description: '朱塾次子朱铨归守婺源祖业，开朱氏婺源支，为婺源朱氏始迁祖。',
      },
      {
        branch: 'C',
        from_location: '福建建阳',
        from_lat: 27.332,
        from_lng: 118.12,
        to_location: '福建福州',
        to_lat: 26.08,
        to_lng: 119.306,
        event_year: 1275,
        reason: 'WAR',
        description: '宋元鼎革之际，建阳朱氏季房一支避乱南迁福州。',
      },
      {
        branch: 'A',
        from_location: '江西婺源',
        from_lat: 29.248,
        from_lng: 117.862,
        to_location: '浙江杭州',
        to_lat: 30.274,
        to_lng: 120.155,
        event_year: 1368,
        reason: 'WAR',
        description: '元末战乱，婺源朱氏长房一支东迁杭州。',
      },
      {
        branch: 'C',
        from_location: '福建建阳',
        from_lat: 27.332,
        from_lng: 118.12,
        to_location: '江苏苏州',
        to_lat: 31.298,
        to_lng: 120.585,
        event_year: 1405,
        reason: 'BUSINESS',
        description: '明初社会安定，建阳朱氏季房从商迁苏州。',
      },
      {
        branch: 'C',
        from_location: '福建福州',
        from_lat: 26.08,
        from_lng: 119.306,
        to_location: '台湾台北',
        to_lat: 25.033,
        to_lng: 121.565,
        event_year: 1650,
        reason: 'WAR',
        description: '明清鼎革，福州朱氏季房一支东渡台湾，定居台北。',
      },
      {
        branch: 'C',
        from_location: '台湾台北',
        from_lat: 25.033,
        from_lng: 121.565,
        to_location: '福建厦门',
        to_lat: 24.479,
        to_lng: 118.089,
        event_year: 1985,
        reason: 'OTHER',
        description: '改革开放后，旅台宗亲回大陆定居厦门。',
      },
    ];

    // 幂等：按 (from_location, to_location, event_year, branch) 去重
    const existing = await this.prisma.migrationEvent.findMany({
      where: { clan_id: clanId },
      select: { from_location: true, to_location: true, event_year: true, branch: true },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.from_location}|${e.to_location}|${e.event_year}|${e.branch ?? ''}`),
    );

    const personNameSet = new Set(events.map((e) => e.personName).filter((n): n is string => !!n));
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, full_name: { in: Array.from(personNameSet) } },
      select: { id: true, full_name: true },
    });
    const personIdByName = new Map(persons.map((p) => [p.full_name, p.id]));

    const newEvents = events
      .filter((e) => !existingKeys.has(`${e.from_location}|${e.to_location}|${e.event_year}|${e.branch ?? ''}`))
      .map((e) => ({
        clan_id: clanId,
        person_id: e.personName ? personIdByName.get(e.personName) ?? null : null,
        branch: e.branch ?? null,
        from_location: e.from_location,
        from_lat: e.from_lat,
        from_lng: e.from_lng,
        to_location: e.to_location,
        to_lat: e.to_lat,
        to_lng: e.to_lng,
        event_year: e.event_year,
        reason: e.reason,
        description: e.description,
        creator_id: creatorId,
      }));

    if (newEvents.length === 0) {
      this.logger.log('  迁徙事件冷启动数据已存在，跳过');
      return;
    }

    await this.prisma.migrationEvent.createMany({ data: newEvents });
    this.logger.log(`  ✅ 迁徙事件冷启动数据已创建：${newEvents.length} 条`);
  }

  /**
   * 图片影像类冷启动：为演示家族生成相册、影像、人物关联、家族大事件、迁徙地点配图（幂等）。
   * 覆盖影像库、家族相册、家族大事件、迁徙地图 POI 配图等模块。
   */
  private async seedMediaDemoData(clanId: bigint, creatorId: string) {
    // 1) 创建相册（幂等：按名称去重）
    const albumSeeds = [
      { name: '宗祠故居', description: '宗祠、故居与祖地风貌', cover_url: DEMO_MEDIA_IMAGES.genealogyHall },
      { name: '祭祖大典', description: '清明、冬至祭祖活动影像', cover_url: DEMO_MEDIA_IMAGES.ancestorWorship1 },
      { name: '历代先祖', description: '重点历史人物肖像与简介', cover_url: DEMO_MEDIA_IMAGES.zhuxiPortrait },
      { name: '家族聚会', description: '宗亲联谊与家族活动', cover_url: DEMO_MEDIA_IMAGES.familyReunion },
      { name: '迁徙风光', description: '迁徙沿途与定居地风光', cover_url: DEMO_MEDIA_IMAGES.hangzhouWestLake },
    ];
    const existingAlbums = await this.prisma.clanAlbum.findMany({
      where: { clan_id: clanId },
      select: { id: true, name: true },
    });
    const existingAlbumNames = new Set(existingAlbums.map((a) => a.name));
    const albumsToCreate = albumSeeds.filter((a) => !existingAlbumNames.has(a.name));
    const createdAlbums = await this.prisma.clanAlbum.createManyAndReturn({
      data: albumsToCreate.map((a) => ({
        clan_id: clanId,
        name: a.name,
        description: a.description,
        cover_url: a.cover_url,
        default_privacy: 'clan' as const,
        creator_id: creatorId,
      })),
    });
    const allAlbums = [...existingAlbums, ...createdAlbums];
    const albumIdByName = new Map(allAlbums.map((a) => [a.name, a.id]));
    if (createdAlbums.length > 0) {
      this.logger.log(`  ✅ 家族相册已创建：${createdAlbums.length} 个`);
    }

    // 2) 创建影像（幂等：按 file_url + clan_id 去重）
    const mediaSeeds = [
      // 宗祠故居
      { key: 'wuyuanVillage', album: '宗祠故居', category: '风景', taken_year: 2024, taken_location: '江西婺源', description: '婺源朱氏祖地古村风貌' },
      { key: 'wuyishanCliff', album: '宗祠故居', category: '风景', taken_year: 2024, taken_location: '福建武夷山', description: '崇安五夫里故居周边武夷山景' },
      { key: 'jianyangAcademy', album: '宗祠故居', category: '风景', taken_year: 2023, taken_location: '福建建阳', description: '建阳考亭书院旧址' },
      { key: 'genealogyHall', album: '宗祠故居', category: '建筑', taken_year: 2024, taken_location: '福建建阳', description: '朱氏宗祠正殿' },
      // 祭祖大典
      { key: 'ancestorWorship1', album: '祭祖大典', category: '活动', taken_year: 2024, taken_location: '福建建阳', description: '清明朱氏宗亲祭祖仪式' },
      { key: 'ancestorWorship2', album: '祭祖大典', category: '活动', taken_year: 2023, taken_location: '江西婺源', description: '冬至婺源支祭祖典礼' },
      // 历代先祖
      { key: 'zhuxiPortrait', album: '历代先祖', category: '肖像', taken_year: 1200, taken_location: '福建建阳', description: '朱熹画像' },
      { key: 'zhuquanPortrait', album: '历代先祖', category: '肖像', taken_year: 1260, taken_location: '江西婺源', description: '朱铨画像，婺源朱氏始迁祖' },
      { key: 'zhuxiaoxiaoPhoto', album: '历代先祖', category: '肖像', taken_year: 2024, taken_location: '福建武夷山', description: '朱熹第 36 世孙朱小小' },
      // 家族聚会
      { key: 'familyReunion', album: '家族聚会', category: '活动', taken_year: 2024, taken_location: '福建厦门', description: '海峡两岸朱氏宗亲联谊会' },
      // 迁徙风光
      { key: 'hangzhouWestLake', album: '迁徙风光', category: '风景', taken_year: 2023, taken_location: '浙江杭州', description: '婺源支东迁杭州，西湖春色' },
      { key: 'fuzhouThreeLanes', album: '迁徙风光', category: '风景', taken_year: 2022, taken_location: '福建福州', description: '建阳季房避乱迁福州，三坊七巷' },
      { key: 'suzhouGarden', album: '迁徙风光', category: '风景', taken_year: 2021, taken_location: '江苏苏州', description: '建阳季房从商迁苏州，园林风光' },
      { key: 'taipeiNight', album: '迁徙风光', category: '风景', taken_year: 2020, taken_location: '台湾台北', description: '福州支东渡台湾，台北夜景' },
      { key: 'xiamenGulangyu', album: '迁徙风光', category: '风景', taken_year: 2024, taken_location: '福建厦门', description: '旅台宗亲回大陆定居厦门，鼓浪屿' },
    ] as const;

    const existingMedia = await this.prisma.mediaArchive.findMany({
      where: { clan_id: clanId, file_url: { in: mediaSeeds.map((m) => DEMO_MEDIA_IMAGES[m.key]) } },
      select: { id: true, file_url: true, album_id: true },
    });
    const existingMediaUrls = new Set(existingMedia.map((m) => m.file_url));
    const mediaToCreate = mediaSeeds.filter((m) => !existingMediaUrls.has(DEMO_MEDIA_IMAGES[m.key]));

    const createdMedia = await this.prisma.mediaArchive.createManyAndReturn({
      data: mediaToCreate.map((m) => {
        const url = DEMO_MEDIA_IMAGES[m.key];
        return {
          clan_id: clanId,
          uploader_id: creatorId,
          file_url: url,
          display_url: url,
          thumb_url: url,
          taken_year: m.taken_year,
          taken_location: m.taken_location,
          description: m.description,
          category: m.category,
          media_type: 'image',
          file_size: 0n,
          album_id: albumIdByName.get(m.album) ?? null,
          privacy_level: 'clan' as const,
        };
      }),
    });
    const allMedia = [...existingMedia, ...createdMedia];
    const mediaIdByUrl = new Map(allMedia.map((m) => [m.file_url, m.id]));
    if (createdMedia.length > 0) {
      this.logger.log(`  ✅ 影像文件已创建：${createdMedia.length} 张`);
    }

    // 更新相册封面计数（createManyAndReturn 未触发计数，手动补齐）
    for (const album of allAlbums) {
      const count = allMedia.filter((m) => m.album_id === album.id).length;
      if (count > 0) {
        await this.prisma.clanAlbum.update({
          where: { id: album.id },
          data: { photo_count: count },
        });
      }
    }

    // 3) 人物关联：肖像 ↔ 族谱人物（幂等：按 media_id + person_id）
    const personLinks = [
      { url: DEMO_MEDIA_IMAGES.zhuxiPortrait, personName: '朱熹' },
      { url: DEMO_MEDIA_IMAGES.zhuquanPortrait, personName: '朱铨' },
      { url: DEMO_MEDIA_IMAGES.zhuxiaoxiaoPhoto, personName: '朱小小' },
    ];
    const personNameSet = new Set(personLinks.map((p) => p.personName));
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, full_name: { in: Array.from(personNameSet) } },
      select: { id: true, full_name: true },
    });
    const personIdByName = new Map(persons.map((p) => [p.full_name, p.id]));

    const linkInserts = personLinks
      .map((p) => ({ media_id: mediaIdByUrl.get(p.url), person_id: personIdByName.get(p.personName) }))
      .filter((p): p is { media_id: bigint; person_id: bigint } => !!p.media_id && !!p.person_id);

    if (linkInserts.length > 0) {
      const result = await this.prisma.mediaPersonLink.createMany({ data: linkInserts, skipDuplicates: true });
      if (result.count > 0) {
        this.logger.log(`  ✅ 影像人物关联已创建：${result.count} 条`);
      }
    }

    // 4) 家族大事件（幂等：按 event_name + event_year + clan_id 去重）
    const familyEventSeeds = [
      { event_name: '朱熹诞生', event_type: 'birth' as const, event_year: 1130, location: '福建尤溪', description: '南宋理学家朱熹出生于尤溪郑氏草堂。' },
      { event_name: '朱熹进士及第', event_type: 'other' as const, event_year: 1148, location: '临安', description: '朱熹绍兴十八年进士及第，授泉州同安主簿。' },
      { event_name: '迁居建阳考亭', event_type: 'other' as const, event_year: 1172, location: '福建建阳', description: '朱熹卜居建阳考亭，创立考亭学派。' },
      { event_name: '朱熹逝世', event_type: 'death' as const, event_year: 1200, location: '福建建阳', description: '朱熹卒于建阳考亭，享年七十一岁。' },
      { event_name: '朱氏宗亲联谊会', event_type: 'gathering' as const, event_year: 2024, location: '福建厦门', description: '海峡两岸朱熹后裔齐聚厦门，共叙宗谊。' },
    ];
    const existingEvents = await this.prisma.familyEvent.findMany({
      where: { clan_id: clanId },
      select: { event_name: true, event_year: true },
    });
    const existingEventKeys = new Set(existingEvents.map((e) => `${e.event_name}|${e.event_year}`));
    const familyReunionMediaId = mediaIdByUrl.get(DEMO_MEDIA_IMAGES.familyReunion);
    const eventsToCreate = familyEventSeeds
      .filter((e) => !existingEventKeys.has(`${e.event_name}|${e.event_year}`))
      .map((e) => ({
        clan_id: clanId,
        event_name: e.event_name,
        event_type: e.event_type,
        event_year: e.event_year,
        event_date: null,
        location: e.location,
        description: e.description,
        created_by: creatorId,
        media_ids: e.event_name === '朱氏宗亲联谊会' && familyReunionMediaId
          ? [familyReunionMediaId.toString()]
          : [],
      }));

    if (eventsToCreate.length > 0) {
      await this.prisma.familyEvent.createMany({
        data: eventsToCreate.map((e) => ({
          ...e,
          media_ids: e.media_ids.length > 0 ? (JSON.stringify(e.media_ids) as any) : null,
        })),
      });
      this.logger.log(`  ✅ 家族大事件冷启动数据已创建：${eventsToCreate.length} 条`);
    }

    // 5) 迁徙地点配图（幂等：按 location_name + media_id）
    const locationMediaLinks = [
      { location: '江西婺源', url: DEMO_MEDIA_IMAGES.wuyuanVillage },
      { location: '福建建阳', url: DEMO_MEDIA_IMAGES.jianyangAcademy },
      { location: '福建崇安', url: DEMO_MEDIA_IMAGES.wuyishanCliff },
      { location: '浙江杭州', url: DEMO_MEDIA_IMAGES.hangzhouWestLake },
      { location: '福建福州', url: DEMO_MEDIA_IMAGES.fuzhouThreeLanes },
      { location: '江苏苏州', url: DEMO_MEDIA_IMAGES.suzhouGarden },
      { location: '台湾台北', url: DEMO_MEDIA_IMAGES.taipeiNight },
      { location: '福建厦门', url: DEMO_MEDIA_IMAGES.xiamenGulangyu },
    ];
    const locationMediaInserts = locationMediaLinks
      .map((l) => ({ location_name: l.location, media_id: mediaIdByUrl.get(l.url) }))
      .filter((l): l is { location_name: string; media_id: bigint } => !!l.media_id);

    // 迁徙地点配图表没有唯一约束，需先查询再过滤，避免重复插入
    const existingLocationMedia = await this.prisma.migrationLocationMedia.findMany({
      where: { clan_id: clanId },
      select: { location_name: true, media_id: true },
    });
    const existingLocationKeys = new Set(
      existingLocationMedia.map((l) => `${l.location_name}|${l.media_id}`),
    );
    const newLocationMedia = locationMediaInserts.filter(
      (l) => !existingLocationKeys.has(`${l.location_name}|${l.media_id}`),
    );

    if (newLocationMedia.length > 0) {
      const result = await this.prisma.migrationLocationMedia.createMany({
        data: newLocationMedia.map((l) => ({
          clan_id: clanId,
          location_name: l.location_name,
          media_id: l.media_id,
          display_order: 0,
          linked_by: creatorId,
        })),
      });
      if (result.count > 0) {
        this.logger.log(`  ✅ 迁徙地点配图已创建：${result.count} 条`);
      }
    }
  }

  /**
   * 公告冷启动：为演示家族生成若干公告（幂等：按标题去重）。
   * 覆盖置顶/普通、已发布/草稿状态，让「公告管理」页面首次打开即有数据。
   */
  private async seedAnnouncements(clanId: bigint, creatorId: string) {
    const announcementSeeds = [
      {
        title: '2025 乙巳年清明祭祖大典通知',
        content:
          '各位宗亲：\n\n' +
          '岁在乙巳，清明将至。谨定于 2025 年 4 月 4 日（清明节）上午 9 时，在建阳朱氏宗祠举行清明祭祖大典。\n\n' +
          '届时将进行三献礼、诵读家训、合影留念等环节。请各房支代表提前 30 分钟到场，统一佩戴黄色绶带。\n\n' +
          '理事会联系人：朱国栋 13800001001',
        cover_url: DEMO_MEDIA_IMAGES.ancestorWorship1,
        is_pinned: true,
        is_active: true,
      },
      {
        title: '族谱数字化录入志愿者招募',
        content:
          '为完成本次族谱续修，修谱小组现招募录入志愿者 10 名。\n\n' +
          '要求：\n1. 熟悉电脑基本操作；\n2. 每周可保证 2 小时以上在线时间；\n3. 有耐心、细心，对家族文化有热情。\n\n' +
          '有意者请联系修谱小组主编朱文斌 13800002001。',
        cover_url: DEMO_MEDIA_IMAGES.genealogyHall,
        is_pinned: false,
        is_active: true,
      },
      {
        title: '朱氏宗亲联谊会暨奖学金颁发仪式',
        content:
          '兹定于 2025 年 8 月 15 日在厦门举行朱氏宗亲联谊会，届时将为 2025 年度考取重点大学的朱氏学子颁发奖学金。\n\n' +
          '请符合条件的学生于 7 月 31 日前向理事会提交成绩单及录取通知书复印件。',
        cover_url: DEMO_MEDIA_IMAGES.familyReunion,
        is_pinned: true,
        is_active: true,
      },
      {
        title: '宗祠修缮募捐倡议书（草稿）',
        content:
          '宗祠自上次修缮至今已逾二十载，屋面漏水、梁柱虫蛀，亟待整修。经理事会商议，拟发起修缮募捐。\n\n' +
          '本倡议书尚在修订中，正式发布日期另行通知。',
        cover_url: null,
        is_pinned: false,
        is_active: false,
      },
      {
        title: '关于规范族谱信息修改流程的通知',
        content:
          '为进一步保证族谱信息的准确性，自即日起，所有族员提交的人物信息修改申请，均需经过管理员审核后方可生效。\n\n' +
          '请各位宗亲在「个人中心-我的家族」中提交修改，并填写完整修改原因，以便快速审核。',
        cover_url: null,
        is_pinned: false,
        is_active: true,
      },
    ];

    const existingTitles = await this.prisma.clanAnnouncement.findMany({
      where: { clan_id: clanId },
      select: { title: true },
    });
    const existingTitleSet = new Set(existingTitles.map((a) => a.title));
    const newAnnouncements = announcementSeeds.filter((a) => !existingTitleSet.has(a.title));

    if (newAnnouncements.length > 0) {
      const now = new Date();
      await this.prisma.clanAnnouncement.createMany({
        data: newAnnouncements.map((a, idx) => ({
          clan_id: clanId,
          title: a.title,
          content: a.content,
          cover_url: a.cover_url,
          is_pinned: a.is_pinned,
          is_active: a.is_active,
          published_at: a.is_active ? new Date(now.getTime() - idx * 24 * 60 * 60 * 1000) : null,
          created_by: creatorId,
        })),
      });
      this.logger.log(`  ✅ 公告演示数据已创建：${newAnnouncements.length} 条`);
    } else {
      this.logger.log('  公告演示数据已存在，跳过');
    }
  }

  /**
   * 审批类数据冷启动：影像审核、生平审核、认亲申请、家庭关系变更、信息修改申请。
   * 全部幂等：按业务唯一键去重，重复启动不会重复创建。
   */
  private async seedReviewAndApprovalData(
    clanId: bigint,
    adminUserId: string,
    memberUserId: string,
  ) {
    // 依赖影像与人物数据
    const mediaList = await this.prisma.mediaArchive.findMany({
      where: { clan_id: clanId },
      select: { id: true, file_url: true, description: true, category: true },
      orderBy: { id: 'asc' },
      take: 10,
    });
    const personList = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      select: { id: true, full_name: true },
      orderBy: { id: 'asc' },
      take: 12,
    });
    if (mediaList.length === 0 || personList.length < 3) {
      this.logger.warn('  缺少影像或人物数据，跳过审批演示数据创建');
      return;
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // ---------- 1) 影像审核 ----------
    const mediaReviewSeeds = [
      { mediaIdx: 0, status: ReviewStatus.PENDING },
      { mediaIdx: 1, status: ReviewStatus.PENDING },
      { mediaIdx: 2, status: ReviewStatus.APPROVED, reviewedAt: yesterday },
      { mediaIdx: 3, status: ReviewStatus.REJECTED, reviewedAt: twoDaysAgo, rejectReason: '图像模糊，请重新上传高清版本' },
      { mediaIdx: 4, status: ReviewStatus.APPROVED, reviewedAt: yesterday },
    ];
    const existingMediaReviewIds = new Set(
      (
        await this.prisma.mediaReview.findMany({
          where: { media_id: { in: mediaList.map((m) => m.id) } },
          select: { media_id: true },
        })
      ).map((r) => r.media_id.toString()),
    );
    const mediaReviewsToCreate = mediaReviewSeeds
      .filter((s) => !existingMediaReviewIds.has(mediaList[s.mediaIdx]?.id.toString()))
      .map((s) => {
        const media = mediaList[s.mediaIdx];
        return {
          media_id: media.id,
          status: s.status,
          reviewer_id: s.status !== ReviewStatus.PENDING ? adminUserId : null,
          reviewed_at: s.reviewedAt ?? null,
          reject_reason: s.rejectReason ?? null,
        };
      });
    if (mediaReviewsToCreate.length > 0) {
      await this.prisma.mediaReview.createMany({ data: mediaReviewsToCreate });
      this.logger.log(`  ✅ 影像审核演示数据已创建：${mediaReviewsToCreate.length} 条`);
    }

    // ---------- 2) 生平审核 ----------
    const bioReviewSeeds = [
      { personIdx: 0, title: '朱熹生平补录', status: ReviewStatus.APPROVED, reviewedAt: yesterday },
      { personIdx: 1, title: '朱铨迁婺源事迹补充', status: ReviewStatus.PENDING },
      { personIdx: 2, title: '朱小小大学经历更正', status: ReviewStatus.PENDING },
      { personIdx: 3, title: '朱鉴功名信息补充', status: ReviewStatus.REJECTED, reviewedAt: twoDaysAgo, rejectReason: '缺少权威文献出处' },
    ];
    const existingBioReviewKeys = new Set(
      (
        await this.prisma.bioReview.findMany({
          where: { person_id: { in: personList.map((p) => p.id) } },
          select: { person_id: true, title: true },
        })
      ).map((r) => `${r.person_id}|${r.title}`),
    );
    const bioReviewsToCreate = bioReviewSeeds
      .filter((s) => {
        const person = personList[s.personIdx];
        return person && !existingBioReviewKeys.has(`${person.id}|${s.title}`);
      })
      .map((s) => {
        const person = personList[s.personIdx];
        return {
          person_id: person.id,
          author_id: memberUserId,
          title: s.title,
          content: `关于 ${person.full_name} 的生平信息补充与勘误，请管理员审核。`,
          status: s.status,
          reviewer_id: s.status !== ReviewStatus.PENDING ? adminUserId : null,
          reviewed_at: s.reviewedAt ?? null,
          reject_reason: s.rejectReason ?? null,
        };
      });
    if (bioReviewsToCreate.length > 0) {
      await this.prisma.bioReview.createMany({ data: bioReviewsToCreate });
      this.logger.log(`  ✅ 生平审核演示数据已创建：${bioReviewsToCreate.length} 条`);
    }

    // ---------- 3) 认亲申请 ----------
    const mergeAppSeeds = [
      {
        originPlace: '江西婺源',
        xipaiInfo: ['铨', '洪', '桐'],
        ancestorName: '朱铨',
        status: ApplicationStatus.PENDING,
        matchedPersonIdx: 1,
        matchScore: 82,
      },
      {
        originPlace: '福建福州',
        xipaiInfo: ['鋆', '深', '柄'],
        ancestorName: '朱鋆',
        status: ApplicationStatus.APPROVED,
        matchedPersonIdx: 5,
        matchScore: 75,
        reviewedAt: yesterday,
      },
      {
        originPlace: '浙江杭州',
        xipaiInfo: ['鉴', '浚', '桂'],
        ancestorName: '朱鉴',
        status: ApplicationStatus.NEEDS_MANUAL_REVIEW,
        matchedPersonIdx: 0,
        matchScore: 45,
      },
      {
        originPlace: '台湾台北',
        xipaiInfo: ['柄', '模', '朴'],
        ancestorName: '朱柄',
        status: ApplicationStatus.REJECTED,
        matchedPersonIdx: 7,
        matchScore: 28,
        reviewedAt: twoDaysAgo,
        rejectReason: '字辈与家族字辈表不匹配，无法确认血缘',
      },
    ];
    const existingMergeKeys = new Set(
      (
        await this.prisma.mergeApplication.findMany({
          where: { clan_id: clanId },
          select: { applicant_id: true, origin_place: true },
        })
      ).map((a) => `${a.applicant_id}|${a.origin_place}`),
    );
    const mergeAppsToCreate = mergeAppSeeds
      .filter((s, idx) => {
        const key = `${memberUserId}|${s.originPlace}`;
        return !existingMergeKeys.has(key) && personList[s.matchedPersonIdx];
      })
      .map((s, idx) => ({
        clan_id: clanId,
        applicant_id: memberUserId,
        origin_place: s.originPlace,
        xipai_info: s.xipaiInfo,
        ancestor_name: s.ancestorName,
        migration_history: `先祖自${s.originPlace}迁出，历经数代，现申请归宗。`,
        matched_person_id: personList[s.matchedPersonIdx].id,
        match_score: s.matchScore,
        match_details: `字辈匹配度 ${s.matchScore}%，建议${s.matchScore > 50 ? '通过' : '人工核查'}影印资料`,
        status: s.status,
        reviewed_by: s.status !== ApplicationStatus.PENDING ? adminUserId : null,
        reviewed_at: s.reviewedAt ?? null,
        reject_reason: s.rejectReason ?? null,
        created_at: new Date(now.getTime() - idx * 12 * 60 * 60 * 1000),
      }));
    if (mergeAppsToCreate.length > 0) {
      await this.prisma.mergeApplication.createMany({ data: mergeAppsToCreate });
      this.logger.log(`  ✅ 认亲申请演示数据已创建：${mergeAppsToCreate.length} 条`);
    }

    // ---------- 4) 家庭关系变更 ----------
    const relationChangeSeeds = [
      {
        personIdx: 2,
        targetPersonIdx: 3,
        changeType: 'spouse' as const,
        previousState: { spouse_name: '未知' },
        currentState: { spouse_name: '陈氏' },
        status: RelationChangeStatus.pending,
        changeReason: '补充配偶信息',
      },
      {
        personIdx: 4,
        targetPersonIdx: 5,
        changeType: 'child' as const,
        previousState: { children: [] },
        currentState: { children: ['朱沐'] },
        status: RelationChangeStatus.approved,
        changeReason: '补充子女信息',
        reviewedAt: yesterday,
      },
      {
        personIdx: 6,
        targetPersonIdx: 7,
        changeType: 'custody' as const,
        previousState: { custody: '未知' },
        currentState: { custody: '随父生活' },
        status: RelationChangeStatus.needs_manual,
        changeReason: '抚养关系变更，需线下确认',
        needsManual: true,
      },
      {
        personIdx: 8,
        targetPersonIdx: 9,
        changeType: 'marriage' as const,
        previousState: { marriage_status: '未婚' },
        currentState: { marriage_status: '已婚' },
        status: RelationChangeStatus.rejected,
        changeReason: '更正婚姻状态',
        reviewedAt: twoDaysAgo,
        rejectReason: '缺少结婚证或族内证明',
      },
    ];
    const existingRelationKeys = new Set(
      (
        await this.prisma.familyRelationChange.findMany({
          where: { clan_id: clanId },
          select: { person_id: true, change_type: true, created_at: true },
        })
      ).map((r) => `${r.person_id}|${r.change_type}|${r.created_at.getTime()}`),
    );
    const relationChangesToCreate = relationChangeSeeds
      .filter((s) => personList[s.personIdx] && personList[s.targetPersonIdx])
      .map((s, idx) => {
        const createdAt = new Date(now.getTime() - idx * 6 * 60 * 60 * 1000);
        return {
          clan_id: clanId,
          person_id: personList[s.personIdx].id,
          operator_user_id: memberUserId,
          change_type: s.changeType,
          previous_state: s.previousState,
          current_state: s.currentState,
          privacy_level: 'admin' as const,
          change_reason: s.changeReason,
          target_person_id: personList[s.targetPersonIdx].id,
          target_user_id: null as string | null,
          status: s.status,
          approved_by: s.status !== RelationChangeStatus.pending && s.status !== RelationChangeStatus.needs_manual ? adminUserId : null,
          reviewed_at: s.reviewedAt ?? null,
          reject_reason: s.rejectReason ?? null,
          needs_manual: s.needsManual ?? false,
          created_at: createdAt,
        };
      })
      .filter((r) => !existingRelationKeys.has(`${r.person_id}|${r.change_type}|${r.created_at.getTime()}`));
    if (relationChangesToCreate.length > 0) {
      await this.prisma.familyRelationChange.createMany({ data: relationChangesToCreate });
      this.logger.log(`  ✅ 家庭关系变更演示数据已创建：${relationChangesToCreate.length} 条`);
    }

    // ---------- 5) 信息修改申请 ----------
    const modificationSeeds = [
      {
        personIdx: 2,
        fieldName: 'birth_place',
        oldValue: '福建武夷山',
        newValue: '福建建阳',
        reason: '出生地登记错误',
        status: ModificationStatus.PENDING,
      },
      {
        personIdx: 3,
        fieldName: 'full_name',
        oldValue: '朱鉴',
        newValue: '朱鑑',
        reason: '正字繁体写法',
        status: ModificationStatus.APPROVED,
        reviewedAt: yesterday,
      },
      {
        personIdx: 4,
        fieldName: 'death_place',
        oldValue: '',
        newValue: '福建建阳',
        reason: '补充逝世地点',
        status: ModificationStatus.REJECTED,
        reviewedAt: twoDaysAgo,
        rejectReason: '无确凿史料支持',
      },
    ];
    const existingModificationKeys = new Set(
      (
        await this.prisma.personModificationRequest.findMany({
          where: { clan_id: clanId },
          select: { person_id: true, field_name: true, new_value: true },
        })
      ).map((r) => `${r.person_id}|${r.field_name}|${r.new_value}`),
    );
    const modificationsToCreate = modificationSeeds
      .filter((s) => personList[s.personIdx])
      .filter((s) => {
        const person = personList[s.personIdx];
        return !existingModificationKeys.has(`${person.id}|${s.fieldName}|${s.newValue}`);
      })
      .map((s) => {
        const person = personList[s.personIdx];
        return {
          person_id: person.id,
          clan_id: clanId,
          requester_user_id: memberUserId,
          field_name: s.fieldName,
          old_value: s.oldValue,
          new_value: s.newValue,
          reason: s.reason,
          status: s.status,
          reviewer_id: s.status !== ModificationStatus.PENDING ? adminUserId : null,
          reviewed_at: s.reviewedAt ?? null,
          reject_reason: s.rejectReason ?? null,
        };
      });
    if (modificationsToCreate.length > 0) {
      await this.prisma.personModificationRequest.createMany({ data: modificationsToCreate });
      this.logger.log(`  ✅ 信息修改申请演示数据已创建：${modificationsToCreate.length} 条`);
    }
  }

  private async seedPlatformAdmin() {
    // 4 个角色的演示账号，统一密码 admin123，便于平台多角色权限测试。
    // 现有 seed 只创建 super 账号；此处扩展为完整 4 角色覆盖（幂等 upsert）。
    // 手机号使用 1380000009X 段避开族员演示账号冲突段。
    // 使用 Prisma upsert 原子化 findUnique+create/update，避免热重启并发竞态
    // （参见 R4 报告：修复前首启观察到 id 跳跃 1→2→6→7，中间 id 被竞态失败占用）。
    const demoAccounts: Array<{
      username: string;
      role: 'super' | 'operator' | 'finance' | 'auditor';
      real_name: string;
      phone: string;
    }> = [
      { username: 'platform_admin',    role: 'super',    real_name: '超级管理员',  phone: '13800000090' },
      { username: 'platform_operator', role: 'operator', real_name: '运营管理员',  phone: '13800000091' },
      { username: 'platform_finance',  role: 'finance',  real_name: '财务管理员',  phone: '13800000092' },
      { username: 'platform_auditor',  role: 'auditor',  real_name: '审计管理员',  phone: '13800000093' },
    ];
    const passwordHash = await bcrypt.hash('admin123', 10);
    for (const acc of demoAccounts) {
      await this.prisma.platformAdmin.upsert({
        where: { username: acc.username },
        create: {
          username: acc.username,
          password_hash: passwordHash,
          role: acc.role,
          real_name: acc.real_name,
          phone: acc.phone,
          status: 'active',
        },
        update: {
          password_hash: passwordHash,
          role: acc.role,
          real_name: acc.real_name,
          phone: acc.phone,
        },
      });
      this.logger.log(`✅ 平台管理员演示账号 upsert: ${acc.username} / admin123 (${acc.role})`);
    }
  }

  /** 构造演示家族的完整 description（含朱小小介绍） */
  private buildClanDescription(): string {
    return `南宋理学家朱熹（1130-1200）后裔族谱演示，涵盖约 36 代、千余位族人。\n\n演示族员「朱小小」：朱熹长房 36 世孙，2000 年生于福建武夷山，毕业于厦门大学软件工程系，现从事家族数字化工作。`;
  }
  private static readonly TARGET_POPULATION = 5000;
  private static readonly CURRENT_YEAR = 2026;
  private static readonly GENERATION_YEARS = 25;
  private static readonly ZIBEI_CHARS = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深','桂','桐','森','柄','模','朴','梓','樾','楷','检','樽','栻','栉','栒','栋','梁','焕','炽','炜','炤','焘','煜','烨','炳'];
  private static readonly MALE_GIVEN_NAMES = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝','廉','邦','国','家','民','世','代','永','长','久','远','福','禄','寿','喜','财','源','海','山','川','林','涛','波','渊','文','武','斌','勇','强','伟','雄','辉','光','星','辰','天','地','宇','宙','鸿','志','远','翔','飞','龙','虎','豹','麟','凤','祺','瑞'];
  private static readonly MARRIAGE_SURNAMES = ['刘','陈','张','王','李','赵','黄','周','吴','徐','孙','胡','高','林','何','郭','马','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹','袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘'];
  private static readonly FEMALE_GIVEN_NAMES = ['娘','姑','英','华','芳','芬','萍','莉','梅','兰','菊','竹','莲','荷','玉','珍','珠','翠','凤','鸾','燕','莺','蝶','娥','媛','婷','娟','秀','惠','敏','慧','巧','美','丽','倩','仪','静','娴','淑','贤','德','贞','婉','柔','云','霞','月','星','瑶','琼'];
  private static readonly BIRTH_PLACES = ['婺源','徽州','建阳','崇安','武夷山','杭州','福州','江西婺源','安徽歙县','福建建瓯','浙江淳安','江苏苏州'];
  /**
   * 生成某年份的随机完整日期（月 1-12、日 1-28，避开 2/30 等非法日期），
   * 让演示族员的出生年月日与卒日更真实，不再全部固定为 1 月 1 日 / 12 月 31 日。
   */
  private static randomDateInYear(year: number): Date {
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  private static readonly HISTORICAL_FIGURES: HistoricalFigure[] = [
    { name: '朱熹', gender: 'male', birth: 1130, death: 1200, generation: 1, branch: 'A' },
    { name: '刘氏', gender: 'female', birth: 1132, death: 1195, generation: 1, branch: 'A' },
    { name: '朱塾', gender: 'male', birth: 1153, death: 1191, generation: 2, father: '朱熹', mother: '刘氏', branch: 'A' },
    { name: '朱埜', gender: 'male', birth: 1156, death: 1212, generation: 2, father: '朱熹', mother: '刘氏', branch: 'B' },
    { name: '朱在', gender: 'male', birth: 1169, death: 1239, generation: 2, father: '朱熹', mother: '刘氏', branch: 'C' },
    { name: '林氏', gender: 'female', birth: 1155, death: 1215, generation: 2, branch: 'A' },
    { name: '赵氏', gender: 'female', birth: 1158, death: 1218, generation: 2, branch: 'B' },
    { name: '范氏', gender: 'female', birth: 1172, death: 1240, generation: 2, branch: 'C' },
    { name: '朱鉴', gender: 'male', birth: 1190, death: 1258, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
    { name: '朱铨', gender: 'male', birth: 1195, death: 1260, generation: 3, father: '朱塾', mother: '林氏', branch: 'A' },
    { name: '朱潜', gender: 'male', birth: 1200, death: 1270, generation: 3, father: '朱埜', mother: '赵氏', branch: 'B' },
    { name: '朱鋆', gender: 'male', birth: 1205, death: 1275, generation: 3, father: '朱在', mother: '范氏', branch: 'C' },
    { name: '郑氏', gender: 'female', birth: 1192, death: 1265, generation: 3, branch: 'A' },
    { name: '王氏', gender: 'female', birth: 1198, death: 1268, generation: 3, branch: 'A' },
    { name: '孙氏', gender: 'female', birth: 1203, death: 1275, generation: 3, branch: 'B' },
    { name: '徐氏', gender: 'female', birth: 1208, death: 1280, generation: 3, branch: 'C' },
    { name: '朱浚', gender: 'male', birth: 1220, death: 1290, generation: 4, father: '朱鉴', mother: '郑氏', branch: 'A' },
    { name: '朱洪', gender: 'male', birth: 1225, death: 1295, generation: 4, father: '朱铨', mother: '王氏', branch: 'A' },
    { name: '朱沐', gender: 'male', birth: 1230, death: 1300, generation: 4, father: '朱潜', mother: '孙氏', branch: 'B' },
    { name: '朱深', gender: 'male', birth: 1235, death: 1305, generation: 4, father: '朱鋆', mother: '徐氏', branch: 'C' },
    { name: '陈氏', gender: 'female', birth: 1223, death: 1293, generation: 4, branch: 'A' },
    { name: '周氏', gender: 'female', birth: 1228, death: 1298, generation: 4, branch: 'A' },
    { name: '吴氏', gender: 'female', birth: 1233, death: 1303, generation: 4, branch: 'B' },
    { name: '何氏', gender: 'female', birth: 1238, death: 1308, generation: 4, branch: 'C' },
    { name: '朱桂', gender: 'male', birth: 1252, death: 1320, generation: 5, father: '朱浚', mother: '陈氏', branch: 'A' },
    { name: '朱桐', gender: 'male', birth: 1258, death: 1325, generation: 5, father: '朱洪', mother: '周氏', branch: 'A' },
    { name: '朱森', gender: 'male', birth: 1263, death: 1330, generation: 5, father: '朱沐', mother: '吴氏', branch: 'B' },
    { name: '朱柄', gender: 'male', birth: 1268, death: 1335, generation: 5, father: '朱深', mother: '何氏', branch: 'C' },
    { name: '郭氏', gender: 'female', birth: 1255, death: 1323, generation: 5, branch: 'A' },
    { name: '马氏', gender: 'female', birth: 1260, death: 1328, generation: 5, branch: 'A' },
    { name: '黄氏', gender: 'female', birth: 1265, death: 1333, generation: 5, branch: 'B' },
    { name: '罗氏', gender: 'female', birth: 1270, death: 1338, generation: 5, branch: 'C' },
  ];
  /**
   * 历史重点族员传记数据：与 HISTORICAL_FIGURES 一一对应。
   * - 男性填写字号 / 籍贯 / 葬地 / 功名 / 传记
   * - 女性填写誉称 / 葬地 / 配偶家世（马氏、朱氏、范氏等外族姓氏)
   * - 用于册谱世系表开本预览时让“重点人物”展开信息，避免只有名字和年份。
   */
  private static readonly HISTORICAL_BIOS: Record<string, {
    courtesy_name?: string;
    native_place?: string;
    burial_place?: string;
    achievements?: string;
    biography?: string;
    marital_notes?: string;
  }> = {
    '朱熹': {
      courtesy_name: '元晦、仲晦',
      native_place: '福建路建宁府崇安县(今武夷山市)',
      burial_place: '建阳唐石里大林谷(今福建建阳区)',
      achievements: '南宋理学家、文学家,世称朱子,理学集大成者。',
      biography: '号紫阳,绍兴十八年(1148)进士,历任泉州同安主簿、知南康军、提举浙东常平茶盐公事等。淳熙十四年(1187)授秘阁修撰,庆元六年(1200)卒。创白鹿洞书院,著有《四书章句集注》《周易本义》《诗集传》《楚辞集注》等,后世辑为《朱子语类》《朱文公文集》。',
    },
    '刘氏': {
      native_place: '崇安五夫里',
      burial_place: '与夫同坆',
      marital_notes: '朱熹继配,封硕人。',
    },
    '朱塾': {
      courtesy_name: '子厚',
      native_place: '建阳崇安',
      burial_place: '唐石里',
      achievements: '承奉郎,父荫入仕。',
      biography: '朱熹长子。幼承庭训,通晓经义。以父荫补承奉郎,任监潭州南岳庙。绍熙四年(1193)先于父卒,年仅三十九,朱熹深痛之,手书《亡男塾扩记》于墓中。',
    },
    '朱埜': {
      courtesy_name: '子桀',
      native_place: '建阳',
      burial_place: '建阳后山',
      achievements: '从事郎,迁儒林郎。',
      biography: '朱熹次子。庆元党禁时随同远窜,后以父泽入仕,历任泉州市舶司干办公事。',
    },
    '朱在': {
      courtesy_name: '子思',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '迪功郎,补官入仕。',
      biography: '朱熹季子。自幼随父讲学,《朱子语类》多载其问对。庆元党禁解后任迪功郎,嘉定年间编刻《朱子实纪》十二卷,为后世研究朱子重要文献。',
    },
    '林氏': { native_place: '崇安', burial_place: '与夫同坆', marital_notes: '朱塾配,先卒。' },
    '赵氏': { native_place: '宗室', burial_place: '建阳', marital_notes: '朱埜配,宗室女。' },
    '范氏': { native_place: '建阳', burial_place: '唐石里', marital_notes: '朱在配。' },
    '朱鉴': {
      courtesy_name: '子明',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '承务郎,累迁朝奉大夫。',
      biography: '朱塾长子。承父祖之学,潜心理学,门人称“文肃先生”。编《朱文公实纪》,刊刻于建阳。',
    },
    '朱铨': {
      courtesy_name: '子衡',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '从事郎,府学教授。',
      biography: '朱塾次子。任府学教授,后迁居婺源,开朱氏婺源支,为婺源朱氏始迁祖。',
    },
    '朱潜': {
      courtesy_name: '子虚',
      native_place: '建阳',
      burial_place: '建阳',
      achievements: '迪功郎。',
      biography: '朱埜子。',
    },
    '朱鋆': {
      courtesy_name: '子文',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '从事郎。',
      biography: '朱在子。续修朱子家谱,辑《朱子实纪》。',
    },
    '郑氏': { native_place: '崇安', burial_place: '与夫同坆', marital_notes: '朱鉴配。' },
    '王氏': { native_place: '婺源', burial_place: '婺源', marital_notes: '朱铨配,随夫迁婺源。' },
    '孙氏': { native_place: '建阳', burial_place: '建阳', marital_notes: '朱潜配。' },
    '徐氏': { native_place: '建阳', burial_place: '唐石里', marital_notes: '朱鋆配。' },
    '朱浚': {
      courtesy_name: '子深',
      native_place: '婺源',
      burial_place: '婺源',
      achievements: '儒林郎。',
      biography: '朱鉴子。承家学,以儒术传家。',
    },
    '朱洪': {
      courtesy_name: '子大',
      native_place: '婺源',
      burial_place: '婺源',
      achievements: '从事郎。',
      biography: '朱铨子。守婺源祖业,拓展朱氏婺源分支。',
    },
    '朱沐': {
      courtesy_name: '子清',
      native_place: '建阳',
      burial_place: '建阳',
      achievements: '府学教谕。',
      biography: '朱潜子。',
    },
    '朱深': {
      courtesy_name: '子澄',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '从政郎。',
      biography: '朱鋆子。',
    },
    '朱桂': {
      courtesy_name: '子芬',
      native_place: '婺源',
      burial_place: '婺源',
      achievements: '宣教郎。',
      biography: '朱浚子。继承婺源支,渐成婺源望族。',
    },
    '朱桐': {
      courtesy_name: '子桐',
      native_place: '婺源',
      burial_place: '婺源',
      achievements: '从事郎。',
      biography: '朱洪子。',
    },
    '朱森': {
      courtesy_name: '子森',
      native_place: '建阳',
      burial_place: '建阳',
      achievements: '儒学教谕。',
      biography: '朱沐子。',
    },
    '朱柄': {
      courtesy_name: '子柄',
      native_place: '建阳',
      burial_place: '唐石里',
      achievements: '宣教郎。',
      biography: '朱深子。',
    },
    '郭氏': { native_place: '婺源', burial_place: '婺源', marital_notes: '朱桂配。' },
    '马氏': { native_place: '婺源', burial_place: '婺源', marital_notes: '朱桐配。' },
    '黄氏': { native_place: '建阳', burial_place: '建阳', marital_notes: '朱森配。' },
    '罗氏': { native_place: '建阳', burial_place: '唐石里', marital_notes: '朱柄配。' },
  };
  private async createDemoZhuXiGenealogy(clanId: bigint) {
    const startTime = Date.now();
    this.logger.log('开始生成朱熹族谱 1000 人演示数据...');
    const historicalMap = new Map<string, bigint>();
    const historicalData = DemoSeedService.HISTORICAL_FIGURES.map((f) => ({
      clan_id: clanId,
      full_name: f.name,
      gender: f.gender as Gender,
      birth_date: DemoSeedService.randomDateInYear(f.birth),
      death_date: f.death ? DemoSeedService.randomDateInYear(f.death) : null,
      is_living: !f.death || f.death >= DemoSeedService.CURRENT_YEAR,
      birth_place: DemoSeedService.BIRTH_PLACES[f.generation % DemoSeedService.BIRTH_PLACES.length],
      migration_branch: f.branch,
      avatar_url: HISTORICAL_AVATAR(f.generation * 10 + (f.branch ? f.branch.charCodeAt(0) : 0), f.gender),
    }));
    const createdHistorical = await this.prisma.person.createManyAndReturn({ data: historicalData });
    createdHistorical.forEach((p, idx) => { historicalMap.set(DemoSeedService.HISTORICAL_FIGURES[idx].name, p.id); });
    this.logger.log(`  [1/5] 历史核心层: ${createdHistorical.length} 人`);
    // [2026-08-19] 为历史重点族员插入 PersonBio（字号/籍贯/葬地/功名/传记),
    // 供册谱世系表开本预览时呈现,避免重点人物只有名字 + 年份的“空脸谱”效果。
    // 幂等：按 person_id upsert,重复启动不会重复创建。
    const bioData = DemoSeedService.HISTORICAL_FIGURES
      .map((f) => DemoSeedService.HISTORICAL_BIOS[f.name])
      .filter((b): b is NonNullable<typeof b> => !!b);
    const personIdsWithBio = DemoSeedService.HISTORICAL_FIGURES
      .filter((f) => !!DemoSeedService.HISTORICAL_BIOS[f.name])
      .map((f) => historicalMap.get(f.name))
      .filter((id): id is bigint => !!id);
    if (bioData.length === personIdsWithBio.length && bioData.length > 0) {
      await this.prisma.$transaction(
        personIdsWithBio.map((pid, i) => {
          const b = bioData[i];
          return this.prisma.personBio.upsert({
            where: { person_id: pid },
            create: { person_id: pid, ...b },
            update: b,
          });
        }),
      );
      this.logger.log(`        历史重点人物 PersonBio: ${bioData.length} 条`);
    }
    const famIdx = new Map<string, number>();
    const familiesArr: Array<{ clan_id: bigint; husband_id: bigint | null; wife_id: bigint | null; union_type: string }> = [];
    const childrenArr: Array<{ family_key: string; child_key: string; birth_order: number }> = [];
    const createCouple = (key: string, husbandName: string, wifeName?: string) => {
      const idx = familiesArr.length;
      familiesArr.push({ clan_id: clanId, husband_id: historicalMap.get(husbandName) ?? null, wife_id: wifeName ? historicalMap.get(wifeName) ?? null : null, union_type: 'normal' });
      famIdx.set(key, idx);
      return idx;
    };
    const addChild = (familyKey: string, childName: string, birthOrder: number) => { childrenArr.push({ family_key: familyKey, child_key: childName, birth_order: birthOrder }); };
    createCouple('F-朱熹','朱熹','刘氏');
    addChild('F-朱熹','朱塾',1);addChild('F-朱熹','朱埜',2);addChild('F-朱熹','朱在',3);
    createCouple('F-朱塾','朱塾','林氏');
    addChild('F-朱塾','朱鉴',1);addChild('F-朱塾','朱铨',2);
    createCouple('F-朱埜','朱埜','赵氏');
    addChild('F-朱埜','朱潜',1);
    createCouple('F-朱在','朱在','范氏');
    addChild('F-朱在','朱鋆',1);
    createCouple('F-朱鉴','朱鉴','郑氏');
    addChild('F-朱鉴','朱浚',1);
    createCouple('F-朱铨','朱铨','王氏');
    addChild('F-朱铨','朱洪',1);
    createCouple('F-朱潜','朱潜','孙氏');
    addChild('F-朱潜','朱沐',1);
    createCouple('F-朱鋆','朱鋆','徐氏');
    addChild('F-朱鋆','朱深',1);
    createCouple('F-朱浚','朱浚','陈氏');
    addChild('F-朱浚','朱桂',1);
    createCouple('F-朱洪','朱洪','周氏');
    addChild('F-朱洪','朱桐',1);
    createCouple('F-朱沐','朱沐','吴氏');
    addChild('F-朱沐','朱森',1);
    createCouple('F-朱深','朱深','何氏');
    addChild('F-朱深','朱柄',1);
    createCouple('F-朱桂','朱桂','郭氏');
    createCouple('F-朱桐','朱桐','马氏');
    createCouple('F-朱森','朱森','黄氏');
    createCouple('F-朱柄','朱柄','罗氏');
    const histFamilies=await this.prisma.familyUnit.createManyAndReturn({data:familiesArr});
    const histFamilyIdMap=new Map<string,bigint>();
    famIdx.forEach((arrIdx,key)=>{histFamilyIdMap.set(key,histFamilies[arrIdx].id);});
    this.logger.log('  [2/5] 历史家庭层: '+histFamilies.length+' 个家庭');
    const histChildIns=childrenArr.map(c=>({family_id:histFamilyIdMap.get(c.family_key),child_id:historicalMap.get(c.child_key),birth_order:c.birth_order}));
    if(histChildIns.length>0) await this.prisma.familyChild.createMany({data:histChildIns});
    this.logger.log('        历史子女关系: '+histChildIns.length+' 条');

    const breedingPool: Array<{name:string;gen:number;birth:number;branch:string;wifeName:string|null;}> = [];
    const fifthGenMales = DemoSeedService.HISTORICAL_FIGURES.filter((f) => f.gender === 'male' && f.generation === 5);
    const wifeMap5 = new Map<string,string>([['朱桂','郭氏'],['朱桐','马氏'],['朱森','黄氏'],['朱柄','罗氏']]);
    for (const f of fifthGenMales) {
      breedingPool.push({name: f.name, gen: f.generation, birth: f.birth, branch: f.branch || 'A', wifeName: wifeMap5.get(f.name) || null});
    }
    const usedNames = new Set<string>(DemoSeedService.HISTORICAL_FIGURES.map((f) => f.name));
    // [2026-08-20 修复] 名字组合空间冲突：
    //   ZIBEI_CHARS 长度 28 × MALE_GIVEN_NAMES 长度 70 = 1960 组合，理论上够用。
    //   但 nextName 第 81 次就会生成 '朱塾明'（zibeiIdx=85,nameIdx=80），后续 LCM(28,70)=140 次后
    //   又会回到 '朱塾明'！原 ensureUnique 重试 500 次内反复撞 usedNames，500 次后强制返回重名，
    //   导致 1194/1314 '朱塾明'、1476/1596 '朱栋德'、1758/1878 '朱栻仁' 等多份重名 persons
    //   插入数据库，newPersonMap.set 后写入的覆盖前面的，最终 first-id 的人成 orphan（无家庭）。
    //   修复：nextName 维护 usedPairs 集合，仅当 (zibei, given) 未使用时才返回，从源头杜绝重名，
    //   ensureUnique 退化为防御性兜底（理论上已不触发）。
    const usedMalePairs = new Set<string>();
    const newPeopleData: any[] = [];
    const newFamiliesData: Array<{key:string;husbandName:string;wifeName:string|null;childNames:string[];childOrders:number[];}> = [];
    // 每对夫妻只允许一个 FamilyUnit（唯一约束 husband_id+wife_id+marriage_order），按丈夫名去重复用
    const familyByHusband = new Map<string, {key:string;husbandName:string;wifeName:string|null;childNames:string[];childOrders:number[];} >();
    const getCoupleFamily = (husbandName: string, wifeName: string | null) => {
      let fam = familyByHusband.get(husbandName);
      if (!fam) {
        fam = { key: 'F-' + husbandName, husbandName, wifeName, childNames: [], childOrders: [] };
        familyByHusband.set(husbandName, fam);
        newFamiliesData.push(fam);
      }
      return fam;
    };
    let totalCreated = 0;
    let nameIdx = 0;
    let zibeiIdx = 5;
    const nextName = (): string => {
      // [2026-08-20 修复] ZIBEI_CHARS 扩展到 33 个字符（与 70 互质），LCM(33, 70) = 2310 >> 繁衍数 526。
      //   原 28 字符时 LCM(28, 70) = 140，第 141 次必撞名。现在 33 字符，attempt=0 直接成功。
      const ZIBEI_LEN = DemoSeedService.ZIBEI_CHARS.length;
      for (let attempt = 0; attempt < ZIBEI_LEN * 70; attempt++) {
        const z = zibeiIdx % ZIBEI_LEN;
        const g = (nameIdx + attempt * 7) % 70;
        const pair = `${z}_${g}`;
        if (!usedMalePairs.has(pair)) {
          usedMalePairs.add(pair);
          const zibei = DemoSeedService.ZIBEI_CHARS[z];
          zibeiIdx++;
          const given = DemoSeedService.MALE_GIVEN_NAMES[g];
          nameIdx++;
          return '朱' + zibei + given;
        }
      }
      throw new Error(`男名组合空间耗尽（${ZIBEI_LEN}×70 不足）`);
    };
    // [2026-08-16 修复] 女性姓名生成：旧实现 nextWifeName 用共享 nameIdx，且
    // 名字下标恒等于姓氏下标+3（ensureUnique 重试分支也恒差 5），组合空间只有 50 种，
    // 500+ 位女性（妻子+女儿）姓名大量重复 → family_units.wife_id 只落到 116 个
    // distinct 人，树谱配偶数据错乱。改为独立单调序号展开完整 50×50=2500 组合。
    let femaleNameCounter = 0;
    const FEMALE_NAME_POOL = (() => {
      const arr: string[] = [];
      for (const sn of DemoSeedService.MARRIAGE_SURNAMES) {
        for (const fn of DemoSeedService.FEMALE_GIVEN_NAMES) {
          arr.push(sn + fn);
        }
      }
      return arr;
    })();
    const nextWifeName = (): string => {
      return FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];
    };
    const ensureUnique = (baseName: string, isMale: boolean): string => {
      let nm = baseName;
      let attempt = 0;
      while (usedNames.has(nm) && attempt < 5000) {
        if (isMale) {
          // [2026-08-20 修复] nextName 改造后理论上 baseName 已是 unique，这里重试分支只作防御性兑现。
          //   顺序递增 zibei 跳出周期，提供更长的 retry space。
          zibeiIdx++;
          const z = zibeiIdx % 28;
          const given = DemoSeedService.MALE_GIVEN_NAMES[(nameIdx + attempt) % 70];
          nm = '朱' + DemoSeedService.ZIBEI_CHARS[z] + given;
        } else {
          // 女性重试同样从完整组合池顺序取，保证与 usedNames 永不冲突（池容量 2500 >> 所需 ~740）
          nm = FEMALE_NAME_POOL[femaleNameCounter++ % FEMALE_NAME_POOL.length];
        }
        attempt++;
      }
      if (usedNames.has(nm)) {
        throw new Error('ensureUnique 5000 次重试仍撞名 ' + nm + '，需扩 names 池');
      }
      usedNames.add(nm);
      return nm
    };
    // [2026-08-21] 为前5代历史人物自动补充子女，避免第6代人口突兀爆炸。
    // 将每个第3-5代男性补齐到至少2个儿子，让家族树前5代更丰满、过渡更平滑。
    const extraChildLinks: Array<{ familyKey: string; childName: string; birthOrder: number }> = [];
    for (const figure of DemoSeedService.HISTORICAL_FIGURES) {
      if (figure.gender !== 'male' || figure.generation < 3 || figure.generation > 5) continue;
      const existingSons = DemoSeedService.HISTORICAL_FIGURES.filter(
        (f) => f.gender === 'male' && f.father === figure.name,
      ).length;
      const targetSons = 2;
      for (let i = existingSons; i < targetSons; i++) {
        const sonGen = figure.generation + 1;
        if (sonGen > 5) continue;
        const sonBirth = figure.birth + 22 + i * 4;
        const sonDeath = sonBirth + 55 + ((i * 7) % 20);
        const zibei = DemoSeedService.ZIBEI_CHARS[(sonGen - 1) % DemoSeedService.ZIBEI_CHARS.length];
        const given = DemoSeedService.MALE_GIVEN_NAMES[(i + figure.generation * 3) % DemoSeedService.MALE_GIVEN_NAMES.length];
        const sonName = ensureUnique('朱' + zibei + given, true);
        newPeopleData.push({
          name: sonName, gender: 'male', birth: sonBirth, death: sonDeath,
          gen: sonGen, branch: figure.branch || 'A', is_living: sonDeath >= DemoSeedService.CURRENT_YEAR,
        });
        totalCreated++;
        // 补充子女全部为历史人物（生卒于13-14世纪），全部已故，妻子概率也统一为70%
        const wifeName = Math.random() < 0.7 ? ensureUnique(nextWifeName(), false) : null;
        if (wifeName) {
          const wBirth = sonBirth + 18 + (i % 5);
          const wDeath = wBirth + 45 + ((i * 11) % 25);
          newPeopleData.push({
            name: wifeName, gender: 'female', birth: wBirth, death: wDeath,
            gen: sonGen, branch: figure.branch || 'A', is_living: wDeath >= DemoSeedService.CURRENT_YEAR,
          });
          totalCreated++;
        }
        getCoupleFamily(sonName, wifeName);
        extraChildLinks.push({ familyKey: 'F-' + figure.name, childName: sonName, birthOrder: i + 1 });
        if (sonGen === 5) {
          breedingPool.push({ name: sonName, gen: sonGen, birth: sonBirth, branch: figure.branch || 'A', wifeName });
        }
      }
    }
    this.logger.log('  [3/5] 开始程序化繁衍生成新人物（已补充前5代子女 ' + totalCreated + ' 人）...');
    let generation = 6;
    const totalTarget = DemoSeedService.TARGET_POPULATION - DemoSeedService.HISTORICAL_FIGURES.length;

    const totalTargetByGen: Record<number, number> = {
      // [2026-08-24] 重新设计：从第 6 代 8 人平滑增长到第 16-17 代峰值 44 人，
      // 再缓慢回落到第 33 代，覆盖到近现代（第 33 代约生于 2000-2010，在世人员集中于此）。
      6: 8, 7: 12, 8: 16, 9: 20, 10: 24,
      11: 28, 12: 32, 13: 36, 14: 40, 15: 42,
      16: 44, 17: 44, 18: 42, 19: 40, 20: 38,
      21: 34, 22: 30, 23: 26, 24: 22, 25: 18,
      26: 16, 27: 14, 28: 12, 29: 10, 30: 8,
      31: 6, 32: 5, 33: 4, 34: 4, 35: 3,
    };
    const allMalesArr: Array<{name:string;gen:number;birth:number;branch:string;wifeName:string|null;}> = breedingPool.slice();
    // [2026-08-24 修复] 血缘链推进：按世代维护男性池，父亲必须取自上一代男性，
    // 保证后代血缘深度逐代 +1，能真实延伸到第 30 代近现代。
    // 旧逻辑从全代池（allMalesArr）就近选父，会导致大多数儿子扎堆挂在早期几代男性
    // 名下，血缘深度只到 ~10 代就断（第 11 代之后人数为 0，再次出现“断崖”）。
    const malesByGen = new Map<number, Array<{name:string;gen:number;birth:number;branch:string;wifeName:string|null;}>>();
    for (const m of breedingPool) {
      if (!malesByGen.has(m.gen)) malesByGen.set(m.gen, []);
      malesByGen.get(m.gen)!.push(m);
    }
    // [2026-08-20 修复] B 房 960 人失衡：
    //   原算法 `fatherIdx = (i + generation * 7 + nameIdx) % allMalesArr.length`
    //   是一个不均匀 hash，随者 allMalesArr 在代代繁衍中不断增长（房支继承自父亲），
    //   会偏向某个 mod 位置，使得 B 房人数远超 A/C 房（曾观察 A=27 / B=960 / C=14）。
    //   修复：显式按 1/3 拆分 A/B/C 三房，每代 targetNewMales 中 i % 3 决定本轮房支，
    //   从该房支的男性池里就近选父亲（池空时托底任意男性，保证不中断繁衍）。
    const BRANCHES = ['A', 'B', 'C'] as const;
    while (totalCreated < totalTarget && generation <= 35) {
      const targetNewMales = totalTargetByGen[generation] || 0;
      if (targetNewMales === 0 || allMalesArr.length === 0) {
        generation++;
        continue;
      }
      for (let i = 0; i < targetNewMales && totalCreated < totalTarget; i++) {
        // 1/3 拆分：i % 3 决定本轮儿子该入哪房
        const targetBranch = BRANCHES[i % 3];
        // 从上一代男性池（同房支）就近选父亲，保证血缘链逐代推进
        const prevGenPool = malesByGen.get(generation - 1) || [];
        let father: typeof allMalesArr[number] | undefined;
        if (prevGenPool.length > 0) {
          for (let attempt = 0; attempt < prevGenPool.length; attempt++) {
            const idx = (i + attempt) % prevGenPool.length;
            if (prevGenPool[idx].branch === targetBranch) {
              father = prevGenPool[idx];
              break;
            }
          }
          if (!father) father = prevGenPool[i % prevGenPool.length];
        } else {
          // 兜底：上一代池为空时（如刚开启第 6 代）使用全局池，保证不中断繁衍
          for (let attempt = 0; attempt < allMalesArr.length; attempt++) {
            const idx = (i + attempt) % allMalesArr.length;
            if (allMalesArr[idx].branch === targetBranch) {
              father = allMalesArr[idx];
              break;
            }
          }
          if (!father) father = allMalesArr[i % allMalesArr.length];
        }
        const fatherWife = father.wifeName;
        const sonName = ensureUnique(nextName(), true);
        const sonBirth = father.birth + 23 + ((i + generation) % 5);
        // [2026-08-24 修复] 在世率按【出生年份】判定而非世代序号：
        //   旧逻辑按 generation>=25 就给 4% 在世，但第 27-33 代出生在 1796-1931 年，
        //   到 2026 年早已超过寿命上限（230 岁），导致大量“僵尸在世”不合理数据。
        //   新逻辑：仅 1950 年后出生者才可能在世，且出生越晚在世概率越高。
        const yearsOld = DemoSeedService.CURRENT_YEAR - sonBirth;
        const livingProbability = sonBirth >= 1950
          ? Math.min(0.85, (sonBirth - 1950) * 0.03)
          : 0;
        const isLiving = livingProbability > 0 && Math.random() < livingProbability;
        const sonDeath = sonBirth + 50 + ((nameIdx + i) % 40);
        newPeopleData.push({
          name: sonName, gender: 'male', birth: sonBirth, death: sonDeath,
          gen: generation, branch: father.branch, is_living: isLiving,
        });
        totalCreated++;
        // [2026-08-24 修复] 妻子概率固定 65%，优先保代数深度（不随世代变化）
        const wifeProbability = 0.65;
        const wname = Math.random() < wifeProbability ? ensureUnique(nextWifeName(), false) : null;
        if (wname) {
          const wBirth = sonBirth + 18 + ((nameIdx + i) % 8);
          const wDeath = wBirth + 45 + ((nameIdx + i) % 50);
          const wLiving = isLiving && Math.random() < 0.7; // 妻子在世率略低于丈夫
          newPeopleData.push({
            name: wname, gender: 'female', birth: wBirth, death: wDeath,
            gen: generation, branch: father.branch, is_living: wLiving,
          });
          totalCreated++;
        }
        // 儿子自己的小家庭（含女儿作为子女）
        const sonFam = getCoupleFamily(sonName, wname);
        // [2026-08-24 修复] 女儿概率降低（30%生0个，25%生1个，45%生2个）
        const daughterCount = wname ? (Math.random() < 0.70 ? 0 : Math.random() < 0.65 ? 1 : 2) : 0;
        for (let d = 0; d < daughterCount && totalCreated < totalTarget; d++) {
          const daughterName = ensureUnique(nextWifeName(), false);
          const dBirth = sonBirth + 3 + d;
          const dDeath = dBirth + 45 + ((nameIdx + i) % 45);
          const dLiving = isLiving && Math.random() < 0.6;
          newPeopleData.push({
            name: daughterName, gender: 'female', birth: dBirth, death: dDeath,
            gen: generation, branch: father.branch, is_living: dLiving,
          });
          totalCreated++;
          sonFam.childNames.push(daughterName);
          sonFam.childOrders.push(sonFam.childNames.length);
        }
        // 儿子挂到父亲家庭下（同一父亲多个儿子复用同一 FamilyUnit，避免唯一约束冲突）
        const fatherFam = getCoupleFamily(father.name, fatherWife);
        fatherFam.childNames.push(sonName);
        fatherFam.childOrders.push(fatherFam.childNames.length);
        allMalesArr.push({name: sonName, gen: generation, birth: sonBirth, branch: father.branch, wifeName: wname});
        // 同步进入本代男性池，供下一代选父（保证血缘链逐代推进）
        if (!malesByGen.has(generation)) malesByGen.set(generation, []);
        malesByGen.get(generation)!.push({name: sonName, gen: generation, birth: sonBirth, branch: father.branch, wifeName: wname});
      }
      generation++;
    }
    this.logger.log('        新人物: ' + newPeopleData.length + ' (目标 ' + totalTarget + ')');

    const newPersonInsertData = newPeopleData.map((p) => ({
      clan_id: clanId,
      full_name: p.name,
      gender: p.gender as Gender,
      birth_date: DemoSeedService.randomDateInYear(p.birth),
      // 在世人员无卒日（death 为未来年份的模拟寿命，不应写入 death_date）
      death_date: p.is_living ? null : DemoSeedService.randomDateInYear(p.death),
      is_living: p.is_living,
      birth_place: DemoSeedService.BIRTH_PLACES[p.gen % DemoSeedService.BIRTH_PLACES.length],
      migration_branch: p.branch,
      avatar_url: p.gender === 'male' ? MALE_AVATAR(p.gen * 100 + totalCreated) : FEMALE_AVATAR(p.gen * 100 + totalCreated),
    }));
    const CHUNK = 200;
    const allNewPersons: any[] = [];
    for (let i = 0; i < newPersonInsertData.length; i += CHUNK) {
      const chunk = newPersonInsertData.slice(i, i + CHUNK);
      const inserted = await this.prisma.person.createManyAndReturn({ data: chunk });
      allNewPersons.push(...inserted);
    }
    const newPersonMap = new Map<string, bigint>();
    allNewPersons.forEach((p) => { newPersonMap.set(p.full_name, p.id); });
    this.logger.log('        已插入新人物: ' + allNewPersons.length);
    const fullPersonMap = new Map<string, bigint>();
    historicalMap.forEach((id, name) => { fullPersonMap.set(name, id); });
    newPersonMap.forEach((id, name) => { fullPersonMap.set(name, id); });
    const newFamiliesInsertData: Array<{clan_id:bigint;husband_id:bigint|null;wife_id:bigint|null;union_type:string;}> = [];
    const newFamilyKeyToIdx = new Map<string, number>();
    for (const fam of newFamiliesData) {
      // 第5代历史人物（朱桂等）的夫妻家庭已在历史层创建，直接复用，避免唯一约束冲突
      if (histFamilyIdMap.has(fam.key)) continue;
      const hId = fullPersonMap.get(fam.husbandName);
      if (!hId) continue;
      const wId = fam.wifeName ? fullPersonMap.get(fam.wifeName) : null;
      newFamiliesInsertData.push({ clan_id: clanId, husband_id: hId, wife_id: wId, union_type: 'normal' });
      newFamilyKeyToIdx.set(fam.key, newFamiliesInsertData.length - 1);
    }
    const insertedNewFamilies = await this.prisma.familyUnit.createManyAndReturn({ data: newFamiliesInsertData });
    this.logger.log('  [4/5] 新家庭层: ' + insertedNewFamilies.length + ' 个家庭');
    const newFamilyIdMap = new Map<string, bigint>();
    newFamilyKeyToIdx.forEach((arrIdx, key) => { newFamilyIdMap.set(key, insertedNewFamilies[arrIdx].id); });
    const newChildInserts: Array<{family_id:bigint;child_id:bigint;birth_order:number;}> = [];
    for (const fam of newFamiliesData) {
      // 历史层已建的家庭复用其 family_id 挂子女
      const fId = newFamilyIdMap.get(fam.key) ?? histFamilyIdMap.get(fam.key);
      if (!fId) continue;
      for (let c = 0; c < fam.childNames.length; c++) {
        const cId = fullPersonMap.get(fam.childNames[c]);
        if (cId) newChildInserts.push({ family_id: fId, child_id: cId, birth_order: fam.childOrders[c] || (c + 1) });
      }
    }
    // 补充的前5代子女：挂到对应历史人物/补充人物家庭中
    for (const link of extraChildLinks) {
      const fId = newFamilyIdMap.get(link.familyKey) ?? histFamilyIdMap.get(link.familyKey);
      const cId = fullPersonMap.get(link.childName);
      if (fId && cId) newChildInserts.push({ family_id: fId, child_id: cId, birth_order: link.birthOrder });
    }
    if (newChildInserts.length > 0) {
      for (let i = 0; i < newChildInserts.length; i += CHUNK) {
        await this.prisma.familyChild.createMany({ data: newChildInserts.slice(i, i + CHUNK) });
      }
    }
    this.logger.log('        新子女关系: ' + newChildInserts.length + ' 条');

    // 5.0) 写入 self-record（depth=0）：每个 person 一条 (ancestor=descendant=self, depth=0)
    // TreeService.getSubTree 依赖 self-record 来定位根节点，缺失会触发 findUnique 降级
    // 并在每次请求都打 warn。批量插入，skipDuplicates 兜底并发竞态
    const selfRecordData = Array.from(fullPersonMap.values()).map((pid) => ({
      ancestor_id: pid,
      descendant_id: pid,
      depth: 0,
    }));
    for (let i = 0; i < selfRecordData.length; i += CHUNK) {
      await this.prisma.personAncestry.createMany({
        data: selfRecordData.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
    this.logger.log('        self-record: ' + selfRecordData.length + ' 条');

    this.logger.log('  [5/5] 构建 PersonAncestry 祖先关系表...');
    const allFC = await this.prisma.familyChild.findMany({
      where: { family: { clan_id: clanId } },
      select: { child_id: true, family: { select: { husband_id: true } } },
    });
    const parentMap = new Map<bigint, bigint>();
    const childrenMap = new Map<bigint, bigint[]>();
    for (const fc of allFC) {
      if (fc.family.husband_id) {
        parentMap.set(fc.child_id, fc.family.husband_id);
        if (!childrenMap.has(fc.family.husband_id)) childrenMap.set(fc.family.husband_id, []);
        childrenMap.get(fc.family.husband_id)!.push(fc.child_id);
      }
    }
    const depth1Inserts: Array<{ancestor_id:bigint;descendant_id:bigint;depth:number;}> = [];
    for (const [child, father] of parentMap.entries()) {
      depth1Inserts.push({ ancestor_id: father, descendant_id: child, depth: 1 });
    }
    for (let i = 0; i < depth1Inserts.length; i += CHUNK) {
      await this.prisma.personAncestry.createMany({ data: depth1Inserts.slice(i, i + CHUNK) });
    }
    this.logger.log('        depth=1: ' + depth1Inserts.length + ' 条');
    let currentDepth = 1;
    // [2026-08-24 修复] MAX_DEPTH 从 30 提升到 38：繁衍循环已覆盖到第 35 代（generation<=35），
    // 血缘链若仍被硬编码截断在 30，第 31-35 代族人会全部掉到链外（断崖复现）。
    // 取 38 略高于繁衍上限，确保链完整覆盖又不至于无限扩张。
    const MAX_DEPTH = 38;
    while (currentDepth < MAX_DEPTH) {
      const currentRecords = await this.prisma.personAncestry.findMany({
        where: { depth: currentDepth },
        select: { ancestor_id: true, descendant_id: true },
      });
      if (currentRecords.length === 0) break;
      const nextInsertsMap = new Map<string, {ancestor_id:bigint;descendant_id:bigint;depth:number;}>();
      for (const rec of currentRecords) {
        const children = childrenMap.get(rec.descendant_id) || [];
        for (const child of children) {
          const key = rec.ancestor_id.toString() + '_' + child.toString();
          if (!nextInsertsMap.has(key)) {
            nextInsertsMap.set(key, { ancestor_id: rec.ancestor_id, descendant_id: child, depth: currentDepth + 1 });
          }
        }
      }
      if (nextInsertsMap.size === 0) break;
      const nextInserts = Array.from(nextInsertsMap.values());
      for (let i = 0; i < nextInserts.length; i += CHUNK) {
        await this.prisma.personAncestry.createMany({ data: nextInserts.slice(i, i + CHUNK) });
      }
      this.logger.log('        depth=' + (currentDepth + 1) + ': ' + nextInserts.length + ' 条');
      currentDepth++;
    }

    // 5.7) [2026-08-20] 把女性（嫁入妻子、女儿）也接入族根 ancestry 链。
    //   原闭包表只沿 husband_id 链构造，嫁入妻子只有 self-record (depth=0)；
    //   女儿仅 (ancestor=父, descendant=女儿, depth=1) 但无子女，无法被迭代扩展到
    //   (ancestor=族根, descendant=女儿, depth=N)。导致后台 demographics 按世代分组时
    //   所有女性都掉到链外，女性数 = 0，与房支分布完全不一致。
    //   修复：为每个 family_unit.wife_id 建一条 (ancestor=族根, depth=丈夫的 depth) 记录，
    //   同一女性亦作为某家庭 child（女儿）时本 SQL 也会自然覆盖（distinct 去重）。
    //   幂等：ON CONFLICT DO NOTHING 兜底。
    const root = await this.prisma.person.findFirst({
      where: {
        clan_id: clanId,
        deleted_at: null,
        descendant_links: { none: { depth: 1 } },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (root) {
      const wifeInserts = await this.prisma.$queryRaw<Array<{ ancestor_id: bigint; descendant_id: bigint; depth: number }>>`
        SELECT DISTINCT pa.ancestor_id, fu.wife_id AS descendant_id, pa.depth
        FROM family_units fu
        JOIN person_ancestry pa ON pa.descendant_id = fu.husband_id
        WHERE fu.clan_id = ${clanId}
          AND pa.ancestor_id = ${root.id}
          AND fu.wife_id IS NOT NULL
      `;
      let wifeInserted = 0;
      for (let i = 0; i < wifeInserts.length; i += CHUNK) {
        const r = await this.prisma.personAncestry.createMany({
          data: wifeInserts.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
        wifeInserted += r.count;
      }
      this.logger.log(`  [5.7] 女性 ancestry 链: ${wifeInserts.length} 条 (新插入 ${wifeInserted} 条)`);
    }

    const totalPersonCount = await this.prisma.person.count({ where: { clan_id: clanId } });
    const totalFamilyCount = await this.prisma.familyUnit.count({ where: { clan_id: clanId } });
    const totalAncestryCount = await this.prisma.personAncestry.count({
      where: { OR: [{ ancestor: { clan_id: clanId } }, { descendant: { clan_id: clanId } }] },
    });
    const elapsed = Date.now() - startTime;
    this.logger.log('✅ 朱熹族谱生成完成: ' + totalPersonCount + ' 人, ' + totalFamilyCount + ' 个家庭, ' + totalAncestryCount + ' 条祖先关系 (耗时 ' + elapsed + 'ms)');
    return { totalPersons: totalPersonCount, totalFamilies: totalFamilyCount, totalAncestry: totalAncestryCount };
  }

  /**
   * [2026-08-16] 把朱小小挂入族谱树：找族内最深男性后代为父，
   * 按 pedigree.syncAncestryFromParents 的写模式补齐：
   *   - person_ancestry：self-record + 父亲的祖先链（depth+1）+ (父, 小小, 1)
   *   - family_units：复用/新建"父亲单亲家庭"（husband=父, wife=NULL）
   *   - family_children：绑定家庭与子女（幂等）
   * 返回父节点 id。
   */
  private async attachZhuxiaoxiaoToTree(clanId: bigint, childId: bigint): Promise<string> {
    // 1) 定位族根（无 depth=1 父链的人，取最小 id 保持稳定）
    const root = await this.prisma.person.findFirst({
      where: {
        clan_id: clanId,
        deleted_at: null,
        descendant_links: { none: { depth: 1 } },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!root) throw new Error('找不到族根，无法挂载朱小小');
    // 2) 族内最深男性后代（父链可达，避免挂到配偶/妻子支）
    const deepest = await this.prisma.personAncestry.findFirst({
      where: {
        ancestor_id: root.id,
        descendant: { clan_id: clanId, deleted_at: null, gender: 'male' },
      },
      orderBy: { depth: 'desc' },
      select: { descendant_id: true, depth: true },
    });
    const fatherId = deepest ? deepest.descendant_id : root.id;

    // 3) 闭包表
    const rows: Array<{ ancestor_id: bigint; descendant_id: bigint; depth: number }> = [];
    const seen = new Set<string>();
    const push = (ancestorId: bigint, descendantId: bigint, depth: number) => {
      const key = `${ancestorId}:${descendantId}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ ancestor_id: ancestorId, descendant_id: descendantId, depth });
    };
    push(childId, childId, 0);
    const fatherAncestries = await this.prisma.personAncestry.findMany({
      where: { descendant_id: fatherId, ancestor: { deleted_at: null } },
      select: { ancestor_id: true, depth: true },
    });
    for (const pa of fatherAncestries) push(pa.ancestor_id, childId, pa.depth + 1);
    if (!fatherAncestries.some((pa) => pa.ancestor_id === fatherId)) push(fatherId, childId, 1);
    await this.prisma.personAncestry.createMany({ data: rows, skipDuplicates: true });

    // 4) family_units：复用父亲的单亲家庭，否则新建
    let family = await this.prisma.familyUnit.findFirst({
      where: { clan_id: clanId, husband_id: fatherId, wife_id: null },
      select: { id: true },
    });
    if (!family) {
      family = await this.prisma.familyUnit.create({
        data: { clan_id: clanId, husband_id: fatherId, wife_id: null, union_type: 'normal' },
        select: { id: true },
      });
    }

    // 5) family_children（幂等）
    const existing = await this.prisma.familyChild.findFirst({
      where: { family_id: family.id, child_id: childId },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.familyChild.create({
        data: { family_id: family.id, child_id: childId, birth_order: 1, child_type: 'BIOLOGICAL' },
      });
    }

    return fatherId.toString();
  }
}
interface HistoricalFigure {
  name: string;
  gender: 'male' | 'female';
  birth: number;
  death?: number;
  generation: number;
  father?: string;
  mother?: string;
  branch?: string;
}
