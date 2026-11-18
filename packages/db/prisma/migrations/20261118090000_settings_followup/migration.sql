-- 设置后续：题库归属家族，公告软删除后可进回收站。

ALTER TABLE "local_memory_quizzes" ADD COLUMN "clan_id" BIGINT;

CREATE INDEX "local_memory_quizzes_clan_id_status_idx" ON "local_memory_quizzes"("clan_id", "status");

ALTER TABLE "local_memory_quizzes"
  ADD CONSTRAINT "local_memory_quizzes_clan_id_fkey"
  FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clan_announcements" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "clan_announcements" ADD COLUMN "deleted_by" TEXT;

CREATE INDEX "clan_announcements_clan_id_deleted_at_idx" ON "clan_announcements"("clan_id", "deleted_at");

-- 创建者只属于一个家族的旧题归到该家族。同时属于多个家族的仍留空，避免两边都能审。
UPDATE "local_memory_quizzes" AS q
SET "clan_id" = only_one.clan_id
FROM (
  SELECT "user_id", MIN("clan_id") AS clan_id
  FROM "clan_members"
  GROUP BY "user_id"
  HAVING COUNT(DISTINCT "clan_id") = 1
) AS only_one
WHERE q."clan_id" IS NULL
  AND q."creator_id" = only_one."user_id";
