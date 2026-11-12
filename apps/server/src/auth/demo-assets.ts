/**
 * 演示账号图片资源常量
 *
 * 使用自托管占位图接口（GET /api/public/pic/:seed/:w/:h，见
 * common/placeholder-media.controller.ts）：同一 seed 永远返回同一张图，
 * 且与站点同源——原先指向 picsum.photos，国内网络不可达，
 * 导致族谱树头像批量加载失败（2026-11-12 生产巡检）。
 *
 * 所有 URL 在种子初始化时一次性写入数据库，前端通过 <el-avatar :src="..."> 渲染。
 */

const PICSUM_BASE = '/api/public/pic/v2'

/** 管理员演示账号头像 */
export const ADMIN_AVATAR = `${PICSUM_BASE}/geneasphere-admin-zhuxi/200/200`

/** 族员演示账号（朱小小）头像 */
export const MEMBER_AVATAR = `${PICSUM_BASE}/geneasphere-member-zhuxiaoxiao/200/200`

/** 历史核心人物头像（朱熹及 27 位已知人物） */
export const HISTORICAL_AVATAR = (idx: number, gender: 'male' | 'female') =>
  `${PICSUM_BASE}/geneasphere-hist-${gender}-${idx}/200/200`

/** 程序生成男性族人头像 */
export const MALE_AVATAR = (idx: number) =>
  `${PICSUM_BASE}/geneasphere-male-${idx}/200/200`

/** 程序生成女性族人头像 */
export const FEMALE_AVATAR = (idx: number) =>
  `${PICSUM_BASE}/geneasphere-female-${idx}/200/200`

/** 朱熹出生地/迁徙地风景配图（用于生平卡片背景） */
export const SCENERY_IMAGES = {
  wuyishan: `${PICSUM_BASE}/wuyishan-zhuxi/640/360`,
  wuyuan: `${PICSUM_BASE}/wuyuan-jxi/640/360`,
  jianyang: `${PICSUM_BASE}/jianyang-fj/640/360`,
  chongan: `${PICSUM_BASE}/chongan-fj/640/360`,
  hangzhou: `${PICSUM_BASE}/hangzhou-westlake/640/360`,
  fuzhou: `${PICSUM_BASE}/fuzhou-3lanes/640/360`,
}

/** 朱小小个人简介配图（朱熹后裔大学生活） */
export const ZHUXIAOXIAO_GALLERY = [
  `${PICSUM_BASE}/zhuxiaoxiao-campus-1/640/360`,
  `${PICSUM_BASE}/zhuxiaoxiao-xiamen-univ/640/360`,
  `${PICSUM_BASE}/zhuxiaoxiao-genealogy-work/640/360`,
]

/** 家族封面图 */
export const CLAN_COVER_IMAGE = `${PICSUM_BASE}/geneasphere-clan-zhuxi-cover/1200/400`

/**
 * 能核对到公有领域肖像的名人。文件在 apps/web/public/portraits。
 * 朱熹出自台北故宫藏元人《至圣先贤半身像》册「徽国公朱熹」，维基共享资源公有领域：
 * https://commons.wikimedia.org/wiki/File:至聖先賢半身像_冊-117-朱熹.jpg
 * 头像是同一幅画的半身裁切，整页留在 zhu-xi-album.jpg，供人物传配图。
 * 朱塾、朱埜、朱在及女眷没有可核对的开源肖像，仍用占位图，不用别人的画像顶替。
 */
export const ZHU_XI_AVATAR = '/portraits/zhu-xi.jpg'
export const ZHU_XI_PORTRAIT = '/portraits/zhu-xi-album.jpg'
export const FAMOUS_PORTRAITS: Record<string, string> = {
  朱熹: ZHU_XI_AVATAR,
}

/** 演示影像库图片（风景、人文、肖像），供相册/家族事件/迁徙地点配图使用 */
export const DEMO_MEDIA_IMAGES = {
  // 风景：迁徙地与故居
  wuyuanVillage: `${PICSUM_BASE}/zhuxi-wuyuan-village/800/600`,
  wuyishanCliff: `${PICSUM_BASE}/zhuxi-wuyishan-cliff/800/600`,
  jianyangAcademy: `${PICSUM_BASE}/zhuxi-jianyang-academy/800/600`,
  hangzhouWestLake: `${PICSUM_BASE}/zhuxi-hangzhou-westlake/800/600`,
  fuzhouThreeLanes: `${PICSUM_BASE}/zhuxi-fuzhou-3lanes/800/600`,
  suzhouGarden: `${PICSUM_BASE}/zhuxi-suzhou-garden/800/600`,
  taipeiNight: `${PICSUM_BASE}/zhuxi-taipei-night/800/600`,
  xiamenGulangyu: `${PICSUM_BASE}/zhuxi-xiamen-gulangyu/800/600`,
  // 人文：祭祀与聚会
  ancestorWorship1: `${PICSUM_BASE}/zhuxi-ancestor-worship-1/800/600`,
  ancestorWorship2: `${PICSUM_BASE}/zhuxi-ancestor-worship-2/800/600`,
  genealogyHall: `${PICSUM_BASE}/zhuxi-genealogy-hall/800/600`,
  familyReunion: `${PICSUM_BASE}/zhuxi-family-reunion/800/600`,
  // 肖像
  zhuxiPortrait: ZHU_XI_PORTRAIT,
  zhuquanPortrait: `${PICSUM_BASE}/zhuxi-zhuquan-portrait/600/800`,
  zhuxiaoxiaoPhoto: `${PICSUM_BASE}/zhuxi-zhuxiaoxiao-photo/600/800`,
}