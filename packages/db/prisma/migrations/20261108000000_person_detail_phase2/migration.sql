-- 人物详情第二期：person_bios 补列、person_events、子女关系增加出继
-- 幂等：重复执行不报错

ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "taboo_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "art_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "posthumous_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "infant_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "alias_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "former_name" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "ethnicity" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "education" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "occupation" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "job_title" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "alma_mater" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "employer" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "lunar_birth" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "lunar_death" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "religion" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "blood_type" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "epitaph" TEXT;
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "source_note" TEXT;

CREATE TABLE IF NOT EXISTS "person_events" (
    "id" BIGSERIAL NOT NULL,
    "person_id" BIGINT NOT NULL,
    "event_year" INTEGER,
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "person_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "person_events_person_id_sort_order_idx"
  ON "person_events"("person_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_events_person_id_fkey') THEN
    ALTER TABLE "person_events" ADD CONSTRAINT "person_events_person_id_fkey"
      FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ChildRelationType' AND e.enumlabel = 'ADOPTED_OUT'
  ) THEN
    ALTER TYPE "ChildRelationType" ADD VALUE 'ADOPTED_OUT';
  END IF;
END $$;
