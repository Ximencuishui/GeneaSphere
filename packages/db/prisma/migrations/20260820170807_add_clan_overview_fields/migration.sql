-- 家族概况：扩展家族信息字段，新增家族理事会、修谱小组表
-- 幂等：老库重复执行不报错。

-- ==================== 扩展 clans 表字段 ====================
-- 原 ClanInfoPage 中部分字段（slogan/origin_place/logo_url）之前只能通过 settings_json 间接存取，
-- 这里独立成列以便查询、索引和未来的导出。

ALTER TABLE "clans"
  ADD COLUMN IF NOT EXISTS "slogan"        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "origin_place"  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "logo_url"      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "cover_url"     VARCHAR(500);


-- ==================== 家族理事会成员 ====================

CREATE TABLE IF NOT EXISTS "clan_council_members" (
    "id"          BIGSERIAL    NOT NULL,
    "clan_id"     BIGINT       NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "contact"     VARCHAR(100) NOT NULL,
    "position"    VARCHAR(100),
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "remark"      VARCHAR(500),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_council_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clan_council_members_clan_id_sort_idx"
  ON "clan_council_members"("clan_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clan_council_members_clan_id_fkey') THEN
    ALTER TABLE "clan_council_members" ADD CONSTRAINT "clan_council_members_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- ==================== 修谱小组成员 ====================

CREATE TABLE IF NOT EXISTS "clan_revision_team_members" (
    "id"          BIGSERIAL    NOT NULL,
    "clan_id"     BIGINT       NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "contact"     VARCHAR(100) NOT NULL,
    "duty"        VARCHAR(100),
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "remark"      VARCHAR(500),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_revision_team_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clan_revision_team_members_clan_id_sort_idx"
  ON "clan_revision_team_members"("clan_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clan_revision_team_members_clan_id_fkey') THEN
    ALTER TABLE "clan_revision_team_members" ADD CONSTRAINT "clan_revision_team_members_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;