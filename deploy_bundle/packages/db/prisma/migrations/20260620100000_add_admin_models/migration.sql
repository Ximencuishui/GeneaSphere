-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_MANUAL_REVIEW');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PRINTING', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- ==================== 角色权限 ====================

CREATE TABLE "clan_members" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clan_members_clan_id_user_id_key" ON "clan_members"("clan_id", "user_id");

ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ==================== 内容审核 ====================

CREATE TABLE "media_reviews" (
    "id" BIGSERIAL NOT NULL,
    "media_id" BIGINT NOT NULL,
    "reviewer_id" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "media_reviews" ADD CONSTRAINT "media_reviews_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_archives"("id") ON DELETE CASCADE;
ALTER TABLE "media_reviews" ADD CONSTRAINT "media_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE TABLE "bio_reviews" (
    "id" BIGSERIAL NOT NULL,
    "person_id" BIGINT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bio_reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bio_reviews" ADD CONSTRAINT "bio_reviews_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE;
ALTER TABLE "bio_reviews" ADD CONSTRAINT "bio_reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "bio_reviews" ADD CONSTRAINT "bio_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ==================== 寻亲与归宗 ====================

CREATE TABLE "merge_applications" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "origin_place" TEXT NOT NULL,
    "xipai_info" TEXT[] NOT NULL DEFAULT '{}',
    "ancestor_name" TEXT,
    "migration_history" TEXT,
    "matched_person_id" BIGINT,
    "match_score" INTEGER,
    "match_details" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "merge_target_id" BIGINT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_applications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "merge_applications" ADD CONSTRAINT "merge_applications_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;
ALTER TABLE "merge_applications" ADD CONSTRAINT "merge_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "merge_applications" ADD CONSTRAINT "merge_applications_matched_person_id_fkey" FOREIGN KEY ("matched_person_id") REFERENCES "persons"("id") ON DELETE SET NULL;
ALTER TABLE "merge_applications" ADD CONSTRAINT "merge_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- ==================== 系统设置 ====================

CREATE TABLE "privacy_settings" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "allow_visitor_deceased" BOOLEAN NOT NULL DEFAULT false,
    "max_generations_visible" INTEGER NOT NULL DEFAULT 5,
    "hide_living_photos" BOOLEAN NOT NULL DEFAULT true,
    "hide_living_spouses" BOOLEAN NOT NULL DEFAULT true,
    "enable_relative_verify" BOOLEAN NOT NULL DEFAULT false,
    "verify_questions" TEXT[] NOT NULL DEFAULT '{}',
    "verify_max_attempts" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "privacy_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "privacy_settings_clan_id_key" ON "privacy_settings"("clan_id");

ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;

CREATE TABLE "xipai" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "generation" INTEGER NOT NULL,
    "character" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xipai_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xipai_clan_id_generation_key" ON "xipai"("clan_id", "generation");

ALTER TABLE "xipai" ADD CONSTRAINT "xipai_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;

-- ==================== 操作日志 ====================

CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "details" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_clan_id_created_at_idx" ON "audit_logs"("clan_id", "created_at");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ==================== 印刷订单 ====================

CREATE TABLE "print_orders" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "tracking_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- ==================== 数据快照 ====================

CREATE TABLE "data_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "data" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_snapshots_clan_id_created_at_idx" ON "data_snapshots"("clan_id", "created_at");

ALTER TABLE "data_snapshots" ADD CONSTRAINT "data_snapshots_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE;
