-- Migration: admin_v2_features
-- Description: 管理员后台 v2.0 新增功能 - 公告、举报、专辑、工具使用日志及软删除字段

-- ============================================
-- 1. 枚举类型
-- ============================================

-- 举报目标类型枚举
DO $$ BEGIN
  CREATE TYPE "ReportTargetType" AS ENUM ('MEMBER', 'MEDIA', 'POST', 'COMMENT', 'ALBUM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 举报状态枚举
DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. 新增表 - 家族公告
-- ============================================
CREATE TABLE IF NOT EXISTS "clan_announcements" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "cover_url" TEXT,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clan_announcements_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE,
  CONSTRAINT "clan_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "clan_announcements_clan_id_is_active_published_at_idx" ON "clan_announcements"("clan_id", "is_active", "published_at");
CREATE INDEX IF NOT EXISTS "clan_announcements_clan_id_created_at_idx" ON "clan_announcements"("clan_id", "created_at");

-- ============================================
-- 3. 新增表 - 内容举报
-- ============================================
CREATE TABLE IF NOT EXISTS "content_reports" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "target_type" "ReportTargetType" NOT NULL,
  "target_id" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "handled_by" TEXT,
  "handled_at" TIMESTAMP(3),
  "result" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_reports_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE,
  CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "content_reports_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "content_reports_clan_id_status_idx" ON "content_reports"("clan_id", "status");
CREATE INDEX IF NOT EXISTS "content_reports_target_type_target_id_idx" ON "content_reports"("target_type", "target_id");

-- ============================================
-- 4. 新增表 - 家族相册
-- ============================================
CREATE TABLE IF NOT EXISTS "clan_albums" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "cover_url" TEXT,
  "default_privacy" "SpacePrivacyLevel" NOT NULL DEFAULT 'clan',
  "photo_count" INTEGER NOT NULL DEFAULT 0,
  "creator_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clan_albums_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "clan_albums_clan_id_idx" ON "clan_albums"("clan_id");

-- ============================================
-- 5. 新增表 - 家族维度工具使用日志
-- ============================================
CREATE TABLE IF NOT EXISTS "clan_tool_usage_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "clan_id" BIGINT NOT NULL,
  "tool_type" "ToolType" NOT NULL,
  "media_id" BIGINT,
  "credits_used" INTEGER NOT NULL,
  "estimated_cost" DECIMAL(10, 4) NOT NULL,
  "status" "ToolUsageStatus" NOT NULL DEFAULT 'pending',
  "input_url" TEXT,
  "output_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "clan_tool_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "clan_tool_usage_logs_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "clan_tool_usage_logs_clan_id_created_at_idx" ON "clan_tool_usage_logs"("clan_id", "created_at");
CREATE INDEX IF NOT EXISTS "clan_tool_usage_logs_clan_id_tool_type_idx" ON "clan_tool_usage_logs"("clan_id", "tool_type");
CREATE INDEX IF NOT EXISTS "clan_tool_usage_logs_user_id_idx" ON "clan_tool_usage_logs"("user_id");

-- ============================================
-- 6. MediaArchive 表新增字段（如果不存在）
-- ============================================
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "album_id" BIGINT;

DO $$ BEGIN
  ALTER TABLE "media_archives" ADD CONSTRAINT "media_archives_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "clan_albums"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "media_archives_album_id_idx" ON "media_archives"("album_id");
CREATE INDEX IF NOT EXISTS "media_archives_deleted_at_idx" ON "media_archives"("deleted_at");

-- ============================================
-- 7. Person 表新增字段（如果不存在）
-- ============================================
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "deleted_by" TEXT;

CREATE INDEX IF NOT EXISTS "persons_deleted_at_idx" ON "persons"("deleted_at");