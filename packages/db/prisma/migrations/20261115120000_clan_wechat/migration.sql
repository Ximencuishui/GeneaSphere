-- 家族公众号配置与图文草稿。密钥列只给服务端读写，接口不回显。

CREATE TABLE IF NOT EXISTS "clan_wechat_configs" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "app_id" VARCHAR(64),
  "app_secret" VARCHAR(128),
  "token" VARCHAR(64),
  "encoding_aes_key" VARCHAR(64),
  "whitelisted_domains" TEXT,
  "follow_reply_type" VARCHAR(20) NOT NULL DEFAULT 'TEXT',
  "follow_reply_content" TEXT,
  "default_menu_json" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_wechat_configs_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "clan_wechat_configs_clan_id_key"
  ON "clan_wechat_configs"("clan_id");

CREATE TABLE IF NOT EXISTS "clan_wechat_articles" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "digest" VARCHAR(500),
  "content" TEXT NOT NULL DEFAULT '',
  "cover_url" TEXT,
  "article_type" VARCHAR(20) NOT NULL DEFAULT 'NEWS',
  "source_url" TEXT,
  "scheduled_at" TIMESTAMP(3),
  "target_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(20) NOT NULL DEFAULT 'drafts',
  "published_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_wechat_articles_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clan_wechat_articles_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "clan_wechat_articles_clan_id_status_created_at_idx"
  ON "clan_wechat_articles"("clan_id", "status", "created_at");
