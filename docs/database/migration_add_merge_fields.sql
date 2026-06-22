-- 归宗合并功能数据库迁移脚本
-- 执行时间: 2026-06-21
-- 版本: v1.0

-- 1. 添加 ApplicationStatus 枚举新值 (如数据库使用 ENUM 类型)
-- ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'MERGED';
-- ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'REVERTED';

-- 2. 添加 NotificationType 枚举新值
-- ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MERGE_COMPLETED';
-- ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MERGE_ROLLBACK';

-- 3. 为 DataSnapshot 表添加新字段
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "merge_application_id" BIGINT;
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "applicant_clan_id" BIGINT;
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "merge_target_id" BIGINT;
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "branch_root_id" BIGINT;
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "operation_type" VARCHAR;
ALTER TABLE "data_snapshots" ADD COLUMN IF NOT EXISTS "is_reverted" BOOLEAN DEFAULT FALSE;

-- 4. 为 FamilyUnit 表添加新字段
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "union_type" VARCHAR DEFAULT 'normal';

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS "data_snapshots_merge_application_id_idx" ON "data_snapshots"("merge_application_id");

-- 6. 添加注释
COMMENT ON COLUMN "data_snapshots"."merge_application_id" IS '关联的合并申请ID';
COMMENT ON COLUMN "data_snapshots"."applicant_clan_id" IS '申请方家族ID（回滚用）';
COMMENT ON COLUMN "data_snapshots"."merge_target_id" IS '挂载点人物ID';
COMMENT ON COLUMN "data_snapshots"."branch_root_id" IS '申请方始祖ID';
COMMENT ON COLUMN "data_snapshots"."operation_type" IS '操作类型标识（MERGE等）';
COMMENT ON COLUMN "data_snapshots"."is_reverted" IS '是否已回滚';
COMMENT ON COLUMN "family_units"."union_type" IS '家庭单元来源（normal/merger）';
