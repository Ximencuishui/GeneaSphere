-- 册谱二期：卷宗内容版本历史表（BookVolumeVersion）
-- 每次标题/内容/配置变更生成快照，支持回滚；版本号 (volume_id, version) 唯一递增
-- 幂等：老库重复执行不报错

CREATE TABLE IF NOT EXISTS "book_volume_versions" (
    "id" BIGSERIAL NOT NULL,
    "volume_id" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT,
    "config" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_volume_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "book_volume_versions_volume_id_version_key"
  ON "book_volume_versions"("volume_id", "version");
CREATE INDEX IF NOT EXISTS "book_volume_versions_volume_id_idx"
  ON "book_volume_versions"("volume_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_volume_versions_volume_id_fkey') THEN
    ALTER TABLE "book_volume_versions" ADD CONSTRAINT "book_volume_versions_volume_id_fkey"
      FOREIGN KEY ("volume_id") REFERENCES "book_volumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
