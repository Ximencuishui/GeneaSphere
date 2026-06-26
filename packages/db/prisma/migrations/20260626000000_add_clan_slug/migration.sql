-- 多家族 SaaS：Clan 表新增 slug 字段（家族唯一标识，用于 /zupu/:slug/... 路径）
-- 1. 添加可空 slug 列
-- 2. 为现存演示家族（朱熹族谱）补 slug
-- 3. 创建唯一约束

ALTER TABLE "clans" ADD COLUMN "slug" TEXT;

UPDATE "clans" SET "slug" = 'zhuxi-zupu' WHERE "name" = '朱熹族谱（演示）' AND "slug" IS NULL;

-- 给还没有 slug 的家族用 id 兜底（理论上不应该有，但保险）
UPDATE "clans" SET "slug" = 'clan-' || "id"::text WHERE "slug" IS NULL;

ALTER TABLE "clans" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "clans_slug_key" ON "clans"("slug");
