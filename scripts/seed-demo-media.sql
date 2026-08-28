-- ============================================================
-- 朱熹族谱（演示）图片影像类冷启动数据 SQL
-- ============================================================
-- 适用数据库：PostgreSQL
-- 作用：为演示家族补充相册、影像、人物关联、家族大事件、迁徙地点配图
-- 幂等：已存在的数据不会重复插入
-- 前置条件：演示家族（name = '朱熹族谱（演示）'）与演示用户（phone = '13800000000'）已存在
-- 用法：psql -d geneasphere -f scripts/seed-demo-media.sql
-- ============================================================

DO $$
DECLARE
  v_clan_id      BIGINT;
  v_creator_id   TEXT;

  -- 相册 ID
  v_album_zuci   BIGINT;
  v_album_jisi   BIGINT;
  v_album_xianzu BIGINT;
  v_album_juhui  BIGINT;
  v_album_qianxi BIGINT;

  -- 影像 ID
  v_img_wuyuan      BIGINT;
  v_img_wuyishan    BIGINT;
  v_img_jianyang    BIGINT;
  v_img_genealogy   BIGINT;
  v_img_jisi1       BIGINT;
  v_img_jisi2       BIGINT;
  v_img_zhuxi       BIGINT;
  v_img_zhuquan     BIGINT;
  v_img_zhuxiaoxiao BIGINT;
  v_img_reunion     BIGINT;
  v_img_hangzhou    BIGINT;
  v_img_fuzhou      BIGINT;
  v_img_suzhou      BIGINT;
  v_img_taipei      BIGINT;
  v_img_xiamen      BIGINT;

  -- 人物 ID
  v_person_zhuxi       BIGINT;
  v_person_zhuquan     BIGINT;
  v_person_zhuxiaoxiao BIGINT;
BEGIN
  -- --------------------------------------------------------
  -- 1. 定位演示家族与演示用户
  -- --------------------------------------------------------
  SELECT id INTO v_clan_id FROM clans WHERE name = '朱熹族谱（演示）' LIMIT 1;
  IF v_clan_id IS NULL THEN
    RAISE NOTICE '未找到演示家族（朱熹族谱（演示）），跳过影像数据初始化';
    RETURN;
  END IF;

  SELECT id::TEXT INTO v_creator_id FROM users WHERE phone = '13800000000' LIMIT 1;
  IF v_creator_id IS NULL THEN
    v_creator_id := 'demo-system';
    RAISE NOTICE '未找到演示用户（13800000000），使用默认 creator_id: demo-system';
  END IF;

  RAISE NOTICE '开始为演示家族 id=% 初始化影像数据', v_clan_id;

  -- --------------------------------------------------------
  -- 2. 创建家族相册（幂等：按名称判断）
  -- --------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM clan_albums WHERE clan_id = v_clan_id AND name = '宗祠故居') THEN
    INSERT INTO clan_albums (clan_id, name, description, cover_url, default_privacy, photo_count, creator_id)
    VALUES (v_clan_id, '宗祠故居', '宗祠、故居与祖地风貌', 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600', 'clan', 0, v_creator_id)
    RETURNING id INTO v_album_zuci;
  ELSE
    SELECT id INTO v_album_zuci FROM clan_albums WHERE clan_id = v_clan_id AND name = '宗祠故居';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clan_albums WHERE clan_id = v_clan_id AND name = '祭祖大典') THEN
    INSERT INTO clan_albums (clan_id, name, description, cover_url, default_privacy, photo_count, creator_id)
    VALUES (v_clan_id, '祭祖大典', '清明、冬至祭祖活动影像', 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600', 'clan', 0, v_creator_id)
    RETURNING id INTO v_album_jisi;
  ELSE
    SELECT id INTO v_album_jisi FROM clan_albums WHERE clan_id = v_clan_id AND name = '祭祖大典';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clan_albums WHERE clan_id = v_clan_id AND name = '历代先祖') THEN
    INSERT INTO clan_albums (clan_id, name, description, cover_url, default_privacy, photo_count, creator_id)
    VALUES (v_clan_id, '历代先祖', '重点历史人物肖像与简介', 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800', 'clan', 0, v_creator_id)
    RETURNING id INTO v_album_xianzu;
  ELSE
    SELECT id INTO v_album_xianzu FROM clan_albums WHERE clan_id = v_clan_id AND name = '历代先祖';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clan_albums WHERE clan_id = v_clan_id AND name = '家族聚会') THEN
    INSERT INTO clan_albums (clan_id, name, description, cover_url, default_privacy, photo_count, creator_id)
    VALUES (v_clan_id, '家族聚会', '宗亲联谊与家族活动', 'https://picsum.photos/seed/zhuxi-family-reunion/800/600', 'clan', 0, v_creator_id)
    RETURNING id INTO v_album_juhui;
  ELSE
    SELECT id INTO v_album_juhui FROM clan_albums WHERE clan_id = v_clan_id AND name = '家族聚会';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clan_albums WHERE clan_id = v_clan_id AND name = '迁徙风光') THEN
    INSERT INTO clan_albums (clan_id, name, description, cover_url, default_privacy, photo_count, creator_id)
    VALUES (v_clan_id, '迁徙风光', '迁徙沿途与定居地风光', 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600', 'clan', 0, v_creator_id)
    RETURNING id INTO v_album_qianxi;
  ELSE
    SELECT id INTO v_album_qianxi FROM clan_albums WHERE clan_id = v_clan_id AND name = '迁徙风光';
  END IF;

  -- --------------------------------------------------------
  -- 3. 创建影像（幂等：按 file_url + clan_id 判断）
  -- --------------------------------------------------------
  -- 宗祠故居
  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-wuyuan-village/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-wuyuan-village/800/600', 'https://picsum.photos/seed/zhuxi-wuyuan-village/800/600', 'https://picsum.photos/seed/zhuxi-wuyuan-village/800/600', 2024, '江西婺源', '婺源朱氏祖地古村风貌', '风景', 'image', 0, v_album_zuci, 'clan')
    RETURNING id INTO v_img_wuyuan;
  ELSE
    SELECT id INTO v_img_wuyuan FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-wuyuan-village/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-wuyishan-cliff/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-wuyishan-cliff/800/600', 'https://picsum.photos/seed/zhuxi-wuyishan-cliff/800/600', 'https://picsum.photos/seed/zhuxi-wuyishan-cliff/800/600', 2024, '福建武夷山', '崇安五夫里故居周边武夷山景', '风景', 'image', 0, v_album_zuci, 'clan')
    RETURNING id INTO v_img_wuyishan;
  ELSE
    SELECT id INTO v_img_wuyishan FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-wuyishan-cliff/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-jianyang-academy/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-jianyang-academy/800/600', 'https://picsum.photos/seed/zhuxi-jianyang-academy/800/600', 'https://picsum.photos/seed/zhuxi-jianyang-academy/800/600', 2023, '福建建阳', '建阳考亭书院旧址', '风景', 'image', 0, v_album_zuci, 'clan')
    RETURNING id INTO v_img_jianyang;
  ELSE
    SELECT id INTO v_img_jianyang FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-jianyang-academy/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600', 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600', 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600', 2024, '福建建阳', '朱氏宗祠正殿', '建筑', 'image', 0, v_album_zuci, 'clan')
    RETURNING id INTO v_img_genealogy;
  ELSE
    SELECT id INTO v_img_genealogy FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-genealogy-hall/800/600';
  END IF;

  -- 祭祖大典
  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600', 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600', 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600', 2024, '福建建阳', '清明朱氏宗亲祭祖仪式', '活动', 'image', 0, v_album_jisi, 'clan')
    RETURNING id INTO v_img_jisi1;
  ELSE
    SELECT id INTO v_img_jisi1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-ancestor-worship-1/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-ancestor-worship-2/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-ancestor-worship-2/800/600', 'https://picsum.photos/seed/zhuxi-ancestor-worship-2/800/600', 'https://picsum.photos/seed/zhuxi-ancestor-worship-2/800/600', 2023, '江西婺源', '冬至婺源支祭祖典礼', '活动', 'image', 0, v_album_jisi, 'clan')
    RETURNING id INTO v_img_jisi2;
  ELSE
    SELECT id INTO v_img_jisi2 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-ancestor-worship-2/800/600';
  END IF;

  -- 历代先祖
  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800', 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800', 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800', 1200, '福建建阳', '朱熹画像', '肖像', 'image', 0, v_album_xianzu, 'clan')
    RETURNING id INTO v_img_zhuxi;
  ELSE
    SELECT id INTO v_img_zhuxi FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuxi-portrait/600/800';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuquan-portrait/600/800') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-zhuquan-portrait/600/800', 'https://picsum.photos/seed/zhuxi-zhuquan-portrait/600/800', 'https://picsum.photos/seed/zhuxi-zhuquan-portrait/600/800', 1260, '江西婺源', '朱铨画像，婺源朱氏始迁祖', '肖像', 'image', 0, v_album_xianzu, 'clan')
    RETURNING id INTO v_img_zhuquan;
  ELSE
    SELECT id INTO v_img_zhuquan FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuquan-portrait/600/800';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuxiaoxiao-photo/600/800') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-zhuxiaoxiao-photo/600/800', 'https://picsum.photos/seed/zhuxi-zhuxiaoxiao-photo/600/800', 'https://picsum.photos/seed/zhuxi-zhuxiaoxiao-photo/600/800', 2024, '福建武夷山', '朱熹第 30 世孙朱小小', '肖像', 'image', 0, v_album_xianzu, 'clan')
    RETURNING id INTO v_img_zhuxiaoxiao;
  ELSE
    SELECT id INTO v_img_zhuxiaoxiao FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-zhuxiaoxiao-photo/600/800';
  END IF;

  -- 家族聚会
  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-family-reunion/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-family-reunion/800/600', 'https://picsum.photos/seed/zhuxi-family-reunion/800/600', 'https://picsum.photos/seed/zhuxi-family-reunion/800/600', 2024, '福建厦门', '海峡两岸朱氏宗亲联谊会', '活动', 'image', 0, v_album_juhui, 'clan')
    RETURNING id INTO v_img_reunion;
  ELSE
    SELECT id INTO v_img_reunion FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-family-reunion/800/600';
  END IF;

  -- 迁徙风光
  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600', 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600', 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600', 2023, '浙江杭州', '婺源支东迁杭州，西湖春色', '风景', 'image', 0, v_album_qianxi, 'clan')
    RETURNING id INTO v_img_hangzhou;
  ELSE
    SELECT id INTO v_img_hangzhou FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-hangzhou-westlake/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-fuzhou-3lanes/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-fuzhou-3lanes/800/600', 'https://picsum.photos/seed/zhuxi-fuzhou-3lanes/800/600', 'https://picsum.photos/seed/zhuxi-fuzhou-3lanes/800/600', 2022, '福建福州', '建阳季房避乱迁福州，三坊七巷', '风景', 'image', 0, v_album_qianxi, 'clan')
    RETURNING id INTO v_img_fuzhou;
  ELSE
    SELECT id INTO v_img_fuzhou FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-fuzhou-3lanes/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-suzhou-garden/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-suzhou-garden/800/600', 'https://picsum.photos/seed/zhuxi-suzhou-garden/800/600', 'https://picsum.photos/seed/zhuxi-suzhou-garden/800/600', 2021, '江苏苏州', '建阳季房从商迁苏州，园林风光', '风景', 'image', 0, v_album_qianxi, 'clan')
    RETURNING id INTO v_img_suzhou;
  ELSE
    SELECT id INTO v_img_suzhou FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-suzhou-garden/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-taipei-night/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-taipei-night/800/600', 'https://picsum.photos/seed/zhuxi-taipei-night/800/600', 'https://picsum.photos/seed/zhuxi-taipei-night/800/600', 2020, '台湾台北', '福州支东渡台湾，台北夜景', '风景', 'image', 0, v_album_qianxi, 'clan')
    RETURNING id INTO v_img_taipei;
  ELSE
    SELECT id INTO v_img_taipei FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-taipei-night/800/600';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-xiamen-gulangyu/800/600') THEN
    INSERT INTO media_archives (clan_id, uploader_id, file_url, display_url, thumb_url, taken_year, taken_location, description, category, media_type, file_size, album_id, privacy_level)
    VALUES (v_clan_id, v_creator_id, 'https://picsum.photos/seed/zhuxi-xiamen-gulangyu/800/600', 'https://picsum.photos/seed/zhuxi-xiamen-gulangyu/800/600', 'https://picsum.photos/seed/zhuxi-xiamen-gulangyu/800/600', 2024, '福建厦门', '旅台宗亲回大陆定居厦门，鼓浪屿', '风景', 'image', 0, v_album_qianxi, 'clan')
    RETURNING id INTO v_img_xiamen;
  ELSE
    SELECT id INTO v_img_xiamen FROM media_archives WHERE clan_id = v_clan_id AND file_url = 'https://picsum.photos/seed/zhuxi-xiamen-gulangyu/800/600';
  END IF;

  -- 更新相册照片计数
  UPDATE clan_albums SET photo_count = (
    SELECT count(*) FROM media_archives WHERE album_id = clan_albums.id AND deleted_at IS NULL
  ) WHERE id IN (v_album_zuci, v_album_jisi, v_album_xianzu, v_album_juhui, v_album_qianxi);

  -- --------------------------------------------------------
  -- 4. 影像-人物关联（幂等：按 media_id + person_id）
  -- --------------------------------------------------------
  SELECT id INTO v_person_zhuxi FROM persons WHERE clan_id = v_clan_id AND full_name = '朱熹' LIMIT 1;
  SELECT id INTO v_person_zhuquan FROM persons WHERE clan_id = v_clan_id AND full_name = '朱铨' LIMIT 1;
  SELECT id INTO v_person_zhuxiaoxiao FROM persons WHERE clan_id = v_clan_id AND full_name = '朱小小' LIMIT 1;

  IF v_person_zhuxi IS NOT NULL AND v_img_zhuxi IS NOT NULL THEN
    INSERT INTO media_person_links (media_id, person_id) VALUES (v_img_zhuxi, v_person_zhuxi)
    ON CONFLICT (media_id, person_id) DO NOTHING;
  END IF;

  IF v_person_zhuquan IS NOT NULL AND v_img_zhuquan IS NOT NULL THEN
    INSERT INTO media_person_links (media_id, person_id) VALUES (v_img_zhuquan, v_person_zhuquan)
    ON CONFLICT (media_id, person_id) DO NOTHING;
  END IF;

  IF v_person_zhuxiaoxiao IS NOT NULL AND v_img_zhuxiaoxiao IS NOT NULL THEN
    INSERT INTO media_person_links (media_id, person_id) VALUES (v_img_zhuxiaoxiao, v_person_zhuxiaoxiao)
    ON CONFLICT (media_id, person_id) DO NOTHING;
  END IF;

  -- --------------------------------------------------------
  -- 5. 家族大事件（幂等：按 event_name + event_year + clan_id 判断）
  -- --------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM family_events WHERE clan_id = v_clan_id AND event_name = '朱熹诞生' AND event_year = 1130) THEN
    INSERT INTO family_events (clan_id, event_name, event_type, event_year, event_date, location, description, created_by)
    VALUES (v_clan_id, '朱熹诞生', 'birth', 1130, NULL, '福建尤溪', '南宋理学家朱熹出生于尤溪郑氏草堂。', v_creator_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM family_events WHERE clan_id = v_clan_id AND event_name = '朱熹进士及第' AND event_year = 1148) THEN
    INSERT INTO family_events (clan_id, event_name, event_type, event_year, event_date, location, description, created_by)
    VALUES (v_clan_id, '朱熹进士及第', 'other', 1148, NULL, '临安', '朱熹绍兴十八年进士及第，授泉州同安主簿。', v_creator_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM family_events WHERE clan_id = v_clan_id AND event_name = '迁居建阳考亭' AND event_year = 1172) THEN
    INSERT INTO family_events (clan_id, event_name, event_type, event_year, event_date, location, description, created_by)
    VALUES (v_clan_id, '迁居建阳考亭', 'other', 1172, NULL, '福建建阳', '朱熹卜居建阳考亭，创立考亭学派。', v_creator_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM family_events WHERE clan_id = v_clan_id AND event_name = '朱熹逝世' AND event_year = 1200) THEN
    INSERT INTO family_events (clan_id, event_name, event_type, event_year, event_date, location, description, created_by)
    VALUES (v_clan_id, '朱熹逝世', 'death', 1200, NULL, '福建建阳', '朱熹卒于建阳考亭，享年七十一岁。', v_creator_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM family_events WHERE clan_id = v_clan_id AND event_name = '朱氏宗亲联谊会' AND event_year = 2024) THEN
    INSERT INTO family_events (clan_id, event_name, event_type, event_year, event_date, location, description, media_ids, created_by)
    VALUES (
      v_clan_id,
      '朱氏宗亲联谊会',
      'gathering',
      2024,
      NULL,
      '福建厦门',
      '海峡两岸朱熹后裔齐聚厦门，共叙宗谊。',
      CASE WHEN v_img_reunion IS NOT NULL THEN ('["' || v_img_reunion::TEXT || '"]')::JSONB ELSE NULL END,
      v_creator_id
    );
  END IF;

  -- --------------------------------------------------------
  -- 6. 迁徙地点配图（幂等：按 location_name + media_id 判断）
  -- --------------------------------------------------------
  IF v_img_wuyuan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '江西婺源' AND media_id = v_img_wuyuan) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '江西婺源', v_img_wuyuan, 0, v_creator_id);
  END IF;

  IF v_img_jianyang IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '福建建阳' AND media_id = v_img_jianyang) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '福建建阳', v_img_jianyang, 0, v_creator_id);
  END IF;

  IF v_img_wuyishan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '福建崇安' AND media_id = v_img_wuyishan) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '福建崇安', v_img_wuyishan, 0, v_creator_id);
  END IF;

  IF v_img_hangzhou IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '浙江杭州' AND media_id = v_img_hangzhou) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '浙江杭州', v_img_hangzhou, 0, v_creator_id);
  END IF;

  IF v_img_fuzhou IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '福建福州' AND media_id = v_img_fuzhou) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '福建福州', v_img_fuzhou, 0, v_creator_id);
  END IF;

  IF v_img_suzhou IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '江苏苏州' AND media_id = v_img_suzhou) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '江苏苏州', v_img_suzhou, 0, v_creator_id);
  END IF;

  IF v_img_taipei IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '台湾台北' AND media_id = v_img_taipei) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '台湾台北', v_img_taipei, 0, v_creator_id);
  END IF;

  IF v_img_xiamen IS NOT NULL AND NOT EXISTS (SELECT 1 FROM migration_location_media WHERE clan_id = v_clan_id AND location_name = '福建厦门' AND media_id = v_img_xiamen) THEN
    INSERT INTO migration_location_media (clan_id, location_name, media_id, display_order, linked_by)
    VALUES (v_clan_id, '福建厦门', v_img_xiamen, 0, v_creator_id);
  END IF;

  RAISE NOTICE '演示家族影像数据初始化完成';
END $$;
