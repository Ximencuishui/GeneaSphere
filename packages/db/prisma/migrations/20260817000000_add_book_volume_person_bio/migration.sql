-- 册谱模块 v1.0：卷宗配置表 + 人物传记附表
-- 依据：《册谱数据模型决策清单》§F1（BookVolume）、§A2（PersonBio）
-- 幂等设计：老库重复执行不报错（与 20260627100000_family_tree_optimization 惯例一致）
--
-- 数据边界：
-- - book_volumes 只存"卷宗结构 + 世录筛选配置"，不存人物副本（人物数据仍在 persons/family_units/family_children）
-- - person_bios 为 Person 一对一扩展（字号/葬地/功名/传记等世录字段）

-- 1. book_volumes 卷宗配置表
CREATE TABLE IF NOT EXISTS "book_volumes" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(200) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'document',
    "content" TEXT,
    "config" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_volumes_pkey" PRIMARY KEY ("id")
);

-- 2. person_bios 人物传记附表（与 Person 一对一）
CREATE TABLE IF NOT EXISTS "person_bios" (
    "person_id" BIGINT NOT NULL,
    "courtesy_name" TEXT,
    "native_place" TEXT,
    "burial_place" TEXT,
    "achievements" TEXT,
    "anecdotes" TEXT,
    "biography" TEXT,
    "marital_notes" TEXT,
    "adoption_note" TEXT,
    "premature" BOOLEAN,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_bios_pkey" PRIMARY KEY ("person_id")
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS "book_volumes_clan_id_sort_order_idx" ON "book_volumes"("clan_id", "sort_order");

-- 4. 外键（幂等：仅当约束不存在时创建）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_volumes_clan_id_fkey') THEN
    ALTER TABLE "book_volumes" ADD CONSTRAINT "book_volumes_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_bios_person_id_fkey') THEN
    ALTER TABLE "person_bios" ADD CONSTRAINT "person_bios_person_id_fkey"
      FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
