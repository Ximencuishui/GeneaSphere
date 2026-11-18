-- 设置子菜单投产：题库驳回原因、工具记录家族隔离、导出任务。
-- 不回填历史工具记录的 clan_id，避免把一人多家族的旧记录算进某个家族。

ALTER TABLE "local_memory_quizzes" ADD COLUMN "reject_reason" TEXT;

ALTER TABLE "tool_usage_logs" ADD COLUMN "clan_id" BIGINT;

CREATE INDEX "tool_usage_logs_clan_id_created_at_idx" ON "tool_usage_logs"("clan_id", "created_at");

ALTER TABLE "tool_usage_logs"
  ADD CONSTRAINT "tool_usage_logs_clan_id_fkey"
  FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clan_export_tasks" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "export_type" VARCHAR(32) NOT NULL,
  "format" VARCHAR(8) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "file_path" TEXT,
  "file_name" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clan_export_tasks_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clan_export_tasks_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "clan_export_tasks_clan_id_created_at_idx" ON "clan_export_tasks"("clan_id", "created_at");
CREATE INDEX "clan_export_tasks_expires_at_idx" ON "clan_export_tasks"("expires_at");
