-- ==================== 平台管理后台 v1.0 迁移 ====================

-- 新枚举
CREATE TYPE "PlatformRole" AS ENUM ('super', 'operator', 'finance', 'auditor');
CREATE TYPE "PlatformAdminStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ClanPlatformStatus" AS ENUM ('NORMAL', 'FROZEN', 'PENDING_REVIEW', 'DELETED');
CREATE TYPE "UserPlatformBanStatus" AS ENUM ('NORMAL', 'BANNED_PERMANENT', 'BANNED_7D', 'BANNED_30D');
CREATE TYPE "SearchPostStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REMOVED');
CREATE TYPE "PrintOrderRefundStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');
CREATE TYPE "RechargeOrderStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- ==================== 平台管理员表 ====================
CREATE TABLE "platform_admins" (
    "id" BIGSERIAL PRIMARY KEY,
    "username" VARCHAR(50) NOT NULL UNIQUE,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'operator',
    "real_name" VARCHAR(50),
    "phone" VARCHAR(20),
    "status" "PlatformAdminStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "platform_admins_username_idx" ON "platform_admins"("username");
CREATE INDEX "platform_admins_role_idx" ON "platform_admins"("role");

-- ==================== 平台操作日志表 ====================
CREATE TABLE "platform_operation_logs" (
    "id" BIGSERIAL PRIMARY KEY,
    "admin_id" BIGINT NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" VARCHAR(64),
    "detail" JSONB,
    "ip_address" VARCHAR(45),
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "platform_operation_logs_admin_id_created_at_idx" ON "platform_operation_logs"("admin_id", "created_at");
CREATE INDEX "platform_operation_logs_action_type_idx" ON "platform_operation_logs"("action_type");
CREATE INDEX "platform_operation_logs_target_type_idx" ON "platform_operation_logs"("target_type");

ALTER TABLE "platform_operation_logs"
    ADD CONSTRAINT "platform_operation_logs_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE;

-- ==================== 全局配置表 ====================
CREATE TABLE "global_settings" (
    "setting_key" VARCHAR(100) PRIMARY KEY,
    "setting_value" JSONB NOT NULL,
    "description" VARCHAR(200),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==================== 充值订单表 ====================
CREATE TABLE "recharge_orders" (
    "id" BIGSERIAL PRIMARY KEY,
    "clan_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "bonus_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_method" VARCHAR(20) NOT NULL DEFAULT 'wechat',
    "transaction_no" VARCHAR(100),
    "status" "RechargeOrderStatus" NOT NULL DEFAULT 'SUCCESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "recharge_orders_clan_id_idx" ON "recharge_orders"("clan_id");
CREATE INDEX "recharge_orders_created_at_idx" ON "recharge_orders"("created_at");
CREATE INDEX "recharge_orders_status_idx" ON "recharge_orders"("status");

-- ==================== 扩展现有表 ====================

-- 家族表
ALTER TABLE "clans" ADD COLUMN "status" "ClanPlatformStatus" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "clans" ADD COLUMN "register_ip" VARCHAR(45);
ALTER TABLE "clans" ADD COLUMN "sms_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "clans" ADD COLUMN "reviewed_at" TIMESTAMP(3);
ALTER TABLE "clans" ADD COLUMN "reviewer_id" BIGINT;

CREATE INDEX "clans_status_idx" ON "clans"("status");
CREATE INDEX "clans_register_ip_idx" ON "clans"("register_ip");

-- 用户表
ALTER TABLE "users" ADD COLUMN "ban_status" "UserPlatformBanStatus" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "users" ADD COLUMN "ban_until" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "last_login_ip" VARCHAR(45);
ALTER TABLE "users" ADD COLUMN "last_login_device" VARCHAR(100);

CREATE INDEX "users_ban_status_idx" ON "users"("ban_status");

-- 影像档案表
ALTER TABLE "media_archives" ADD COLUMN "file_size" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "media_archives" ADD COLUMN "media_type" VARCHAR(20) NOT NULL DEFAULT 'image';

-- 印刷订单表
ALTER TABLE "print_orders" ADD COLUMN "tracking_company" VARCHAR(50);
ALTER TABLE "print_orders" ADD COLUMN "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "print_orders" ADD COLUMN "refund_reason" TEXT;
ALTER TABLE "print_orders" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "print_orders" ADD COLUMN "refund_status" "PrintOrderRefundStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "print_orders" ADD COLUMN "shipping_address" JSONB;

-- 寻亲帖表
ALTER TABLE "search_posts" ADD COLUMN "status" "SearchPostStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "search_posts" ADD COLUMN "reviewed_at" TIMESTAMP(3);
ALTER TABLE "search_posts" ADD COLUMN "reviewer_id" BIGINT;
ALTER TABLE "search_posts" ADD COLUMN "reject_reason" TEXT;

CREATE INDEX "search_posts_status_idx" ON "search_posts"("status");
