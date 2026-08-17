-- 册谱二期：分享只读链接表（ShareLink）
-- 读端点可通过 ?share=<token> 匿名只读访问（scope = cepu | tree）
-- 幂等：老库重复执行不报错

CREATE TABLE IF NOT EXISTS "share_links" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'cepu',
    "token" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_key" ON "share_links"("token");
CREATE INDEX IF NOT EXISTS "share_links_clan_id_idx" ON "share_links"("clan_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_clan_id_fkey') THEN
    ALTER TABLE "share_links" ADD CONSTRAINT "share_links_clan_id_fkey"
      FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
