-- 修谱闭环：族谱草稿 / 众包通知
-- 关联族谱工作流的 clan_created / notify / digitize 三个阶段；
-- 幂等：老库重复执行不报错。

CREATE TABLE IF NOT EXISTS "genealogy_drafts" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" VARCHAR(60),
    "generation_start" INTEGER,
    "generation_end" INTEGER,
    "description" TEXT,
    "cover_image_url" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genealogy_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "genealogy_drafts_clan_id_updated_at_idx"
  ON "genealogy_drafts"("clan_id", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'genealogy_drafts_clan_id_fkey') THEN
    ALTER TABLE "genealogy_drafts" ADD CONSTRAINT "genealogy_drafts_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'genealogy_drafts_created_by_fkey') THEN
    ALTER TABLE "genealogy_drafts" ADD CONSTRAINT "genealogy_drafts_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS "crowdsource_notices" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "token" VARCHAR(64) NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crowdsource_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "crowdsource_notices_token_key"
  ON "crowdsource_notices"("token");
CREATE INDEX IF NOT EXISTS "crowdsource_notices_clan_id_status_idx"
  ON "crowdsource_notices"("clan_id", "status");
CREATE INDEX IF NOT EXISTS "crowdsource_notices_clan_id_updated_at_idx"
  ON "crowdsource_notices"("clan_id", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crowdsource_notices_clan_id_fkey') THEN
    ALTER TABLE "crowdsource_notices" ADD CONSTRAINT "crowdsource_notices_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crowdsource_notices_created_by_fkey') THEN
    ALTER TABLE "crowdsource_notices" ADD CONSTRAINT "crowdsource_notices_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 旧库若曾产生重复版本号，先按创建顺序重新编号，再建立唯一索引。
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "clan_id"
    ORDER BY "created_at", "id"
  ) AS new_version_number
  FROM "genealogy_documents"
)
UPDATE "genealogy_documents" AS document
SET "version_number" = ranked.new_version_number
FROM ranked
WHERE document."id" = ranked."id"
  AND document."version_number" <> ranked.new_version_number;

CREATE UNIQUE INDEX IF NOT EXISTS "genealogy_documents_clan_id_version_number_key"
  ON "genealogy_documents"("clan_id", "version_number");