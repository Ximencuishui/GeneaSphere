-- 柔性家庭关系更新与隐私保护功能 v1.0

-- 枚举
CREATE TYPE "RelationChangeType" AS ENUM ('marriage', 'spouse', 'child', 'custody');
CREATE TYPE "RelationChangeStatus" AS ENUM ('pending', 'approved', 'rejected', 'auto_approved', 'needs_manual');
CREATE TYPE "RelationPrivacyLevel" AS ENUM ('self', 'admin', 'clan');
CREATE TYPE "CustodyStatus" AS ENUM ('living_with', 'not_living_with', 'joint');
CREATE TYPE "MarriageType" AS ENUM ('first', 'remarriage');
CREATE TYPE "MarriageEndReason" AS ENUM ('divorce', 'widowed');

-- 用户与人物的多对多关联表
CREATE TABLE "person_user_links" (
  "id"            BIGSERIAL PRIMARY KEY,
  "user_id"       TEXT NOT NULL,
  "person_id"     BIGINT NOT NULL,
  "relation_role" TEXT NOT NULL DEFAULT 'self',
  "verified_at"   TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "person_user_links_user_id_person_id_relation_role_key" UNIQUE ("user_id", "person_id", "relation_role")
);

CREATE INDEX "person_user_links_user_id_idx" ON "person_user_links"("user_id");
CREATE INDEX "person_user_links_person_id_idx" ON "person_user_links"("person_id");

ALTER TABLE "person_user_links"
  ADD CONSTRAINT "person_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_user_links"
  ADD CONSTRAINT "person_user_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 家庭关系变更历史表
CREATE TABLE "family_relation_changes" (
  "id"                BIGSERIAL PRIMARY KEY,
  "clan_id"           BIGINT NOT NULL,
  "person_id"         BIGINT NOT NULL,
  "operator_user_id"  TEXT NOT NULL,
  "change_type"       "RelationChangeType" NOT NULL,
  "previous_state"    JSONB,
  "current_state"     JSONB NOT NULL,
  "privacy_level"     "RelationPrivacyLevel" NOT NULL DEFAULT 'admin',
  "change_reason"     VARCHAR(200),
  "target_person_id"  BIGINT,
  "target_user_id"    TEXT,
  "status"            "RelationChangeStatus" NOT NULL DEFAULT 'auto_approved',
  "approved_by"       TEXT,
  "reviewed_at"       TIMESTAMP(3),
  "reject_reason"     TEXT,
  "needs_manual"      BOOLEAN NOT NULL DEFAULT FALSE,
  "is_disputed"       BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "family_relation_changes_person_id_created_at_idx" ON "family_relation_changes"("person_id", "created_at");
CREATE INDEX "family_relation_changes_clan_id_status_created_at_idx" ON "family_relation_changes"("clan_id", "status", "created_at");
CREATE INDEX "family_relation_changes_operator_user_id_idx" ON "family_relation_changes"("operator_user_id");

ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_target_person_id_fkey" FOREIGN KEY ("target_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "family_relation_changes"
  ADD CONSTRAINT "family_relation_changes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 婚姻历史时间线
CREATE TABLE "marriage_history" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "clan_id"             BIGINT NOT NULL,
  "person_id"           BIGINT NOT NULL,
  "spouse_id"           BIGINT NOT NULL,
  "external_spouse_name" VARCHAR(100),
  "marriage_type"       "MarriageType" NOT NULL DEFAULT 'first',
  "start_date"          TIMESTAMP(3),
  "end_date"            TIMESTAMP(3),
  "end_reason"          "MarriageEndReason",
  "is_current"          BOOLEAN NOT NULL DEFAULT FALSE,
  "family_unit_id"      BIGINT,
  "privacy_level"       "RelationPrivacyLevel" NOT NULL DEFAULT 'admin',
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "marriage_history_person_id_start_date_idx" ON "marriage_history"("person_id", "start_date");
CREATE INDEX "marriage_history_spouse_id_start_date_idx" ON "marriage_history"("spouse_id", "start_date");
CREATE INDEX "marriage_history_is_current_idx" ON "marriage_history"("is_current");

ALTER TABLE "marriage_history"
  ADD CONSTRAINT "marriage_history_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marriage_history"
  ADD CONSTRAINT "marriage_history_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marriage_history"
  ADD CONSTRAINT "marriage_history_spouse_id_fkey" FOREIGN KEY ("spouse_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 子女抚养关系记录
CREATE TABLE "child_custody_records" (
  "id"              BIGSERIAL PRIMARY KEY,
  "clan_id"         BIGINT NOT NULL,
  "child_id"        BIGINT NOT NULL,
  "parent_id"       BIGINT NOT NULL,
  "custody_status"  "CustodyStatus" NOT NULL DEFAULT 'joint',
  "is_biological"   BOOLEAN NOT NULL DEFAULT TRUE,
  "effective_from"  TIMESTAMP(3) NOT NULL,
  "effective_to"    TIMESTAMP(3),
  "dispute_flag"    BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by"      TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "child_custody_records_child_id_parent_id_effective_to_idx" ON "child_custody_records"("child_id", "parent_id", "effective_to");
CREATE INDEX "child_custody_records_parent_id_idx" ON "child_custody_records"("parent_id");

ALTER TABLE "child_custody_records"
  ADD CONSTRAINT "child_custody_records_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "child_custody_records"
  ADD CONSTRAINT "child_custody_records_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "child_custody_records"
  ADD CONSTRAINT "child_custody_records_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "child_custody_records"
  ADD CONSTRAINT "child_custody_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 用户级关系隐私设置
CREATE TABLE "relation_privacy_preferences" (
  "id"                          BIGSERIAL PRIMARY KEY,
  "user_id"                     TEXT NOT NULL UNIQUE,
  "share_marriage_history"      BOOLEAN NOT NULL DEFAULT FALSE,
  "share_custody_details"       BOOLEAN NOT NULL DEFAULT FALSE,
  "show_biological_status"      BOOLEAN NOT NULL DEFAULT FALSE,
  "enable_change_notifications" BOOLEAN NOT NULL DEFAULT TRUE,
  "updated_at"                  TIMESTAMP(3) NOT NULL
);

ALTER TABLE "relation_privacy_preferences"
  ADD CONSTRAINT "relation_privacy_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;