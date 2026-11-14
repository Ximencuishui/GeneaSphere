-- 生卒事件去重草稿。只加可空 person_id、外键和部分唯一索引。
-- 不回填 person_id，不删除已有行。
--
-- 已有行没有 person_id，新列全是 NULL。部分唯一索引不覆盖这些行，
-- 所以表里现有的同名诞辰/逝世重复不会让本迁移失败。
-- 这些重复仍然在。按姓名回填之前必须先清理，语句不要放进本文件。
--
-- 已提交的 migrations 里没有 family_events 的建表语句。
-- 本草稿假定该表已经存在（与当前 schema 一致）。

ALTER TABLE "family_events" ADD COLUMN IF NOT EXISTS "person_id" BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'family_events_person_id_fkey'
  ) THEN
    ALTER TABLE "family_events"
      ADD CONSTRAINT "family_events_person_id_fkey"
      FOREIGN KEY ("person_id") REFERENCES "persons"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "family_events_person_id_idx"
  ON "family_events"("person_id");

-- 一人一条诞辰、一条逝世。聚会/修谱等 event_type 不在谓词里，person_id 为空的行也不进索引。
CREATE UNIQUE INDEX IF NOT EXISTS "family_events_life_person_type_key"
  ON "family_events"("person_id", "event_type")
  WHERE "person_id" IS NOT NULL
    AND "event_type" IN ('birth'::"FamilyEventType", 'death'::"FamilyEventType");
