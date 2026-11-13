-- PDF 导入任务表：任务状态以本表为准，替代进程内 Map，支持重启后恢复
CREATE TABLE "pdf_import_tasks" (
    "id" TEXT NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_url" TEXT,
    "parse_mode" TEXT NOT NULL DEFAULT 'text',
    "total_pages" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "ocr_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdf_import_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pdf_import_tasks_clan_id_idx" ON "pdf_import_tasks"("clan_id");
CREATE INDEX "pdf_import_tasks_user_id_idx" ON "pdf_import_tasks"("user_id");
CREATE INDEX "pdf_import_tasks_status_idx" ON "pdf_import_tasks"("status");
CREATE INDEX "pdf_import_tasks_created_at_idx" ON "pdf_import_tasks"("created_at");

ALTER TABLE "pdf_import_tasks"
    ADD CONSTRAINT "pdf_import_tasks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdf_import_tasks"
    ADD CONSTRAINT "pdf_import_tasks_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
