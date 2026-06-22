-- ========== PDF 族谱导入：日志表与临时数据表（v1.0）==========
-- 依据 PDF族谱文档导入功能需求文档 v1.0 §5 数据库设计
-- 验收脚本 verify_pdf_ocr.js 发现：原 schema.prisma 未定义 PdfImportLog/PdfParseTemp 模型

-- PDF 导入记录表
CREATE TABLE "pdf_import_logs" (
    "id" BIGSERIAL NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_path" TEXT,
    "parse_mode" TEXT NOT NULL,
    "total_pages" INTEGER NOT NULL DEFAULT 0,
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "success_records" INTEGER NOT NULL DEFAULT 0,
    "failed_records" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "pdf_import_logs_pkey" PRIMARY KEY ("id")
);

-- PDF 解析临时数据表
CREATE TABLE "pdf_parse_temp" (
    "id" BIGSERIAL NOT NULL,
    "import_log_id" BIGINT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "generation" INTEGER,
    "birth_date" TIMESTAMP(3),
    "death_date" TIMESTAMP(3),
    "is_living" BOOLEAN NOT NULL DEFAULT true,
    "parent_name" TEXT,
    "spouse_name" TEXT,
    "biography" TEXT,
    "burial_place" TEXT,
    "notes" TEXT,
    "confidence_score" DECIMAL(5,2),
    "original_text" TEXT,
    "is_corrected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdf_parse_temp_pkey" PRIMARY KEY ("id")
);

-- pdf_import_logs 索引（按需求文档 §5.1）
CREATE UNIQUE INDEX "pdf_import_logs_task_id_key" ON "pdf_import_logs"("task_id");
CREATE INDEX "pdf_import_logs_user_id_idx" ON "pdf_import_logs"("user_id");
CREATE INDEX "pdf_import_logs_clan_id_idx" ON "pdf_import_logs"("clan_id");
CREATE INDEX "pdf_import_logs_status_idx" ON "pdf_import_logs"("status");
CREATE INDEX "pdf_import_logs_created_at_idx" ON "pdf_import_logs"("created_at");

-- pdf_parse_temp 索引（按需求文档 §5.2）
CREATE INDEX "pdf_parse_temp_import_log_id_idx" ON "pdf_parse_temp"("import_log_id");
CREATE INDEX "pdf_parse_temp_confidence_score_idx" ON "pdf_parse_temp"("confidence_score");

-- 外键约束
ALTER TABLE "pdf_import_logs"
    ADD CONSTRAINT "pdf_import_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdf_import_logs"
    ADD CONSTRAINT "pdf_import_logs_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdf_parse_temp"
    ADD CONSTRAINT "pdf_parse_temp_import_log_id_fkey"
    FOREIGN KEY ("import_log_id") REFERENCES "pdf_import_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;