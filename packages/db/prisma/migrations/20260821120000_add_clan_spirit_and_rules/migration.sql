-- 家族概况新增字段：家族精神（spirit）、家规（rules）
ALTER TABLE "clans" ADD COLUMN "spirit" TEXT;
ALTER TABLE "clans" ADD COLUMN "rules" TEXT;
