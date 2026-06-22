-- ========== 扫描件PDF导入：限免与计费策略 v1.0 ==========
-- 扩展 user_credits 表：新增 OCR 月度免费额度追踪字段
ALTER TABLE "user_credits"
  ADD COLUMN "ocr_pages_used" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ocr_chars_used" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ocr_reset_date" DATE NOT NULL DEFAULT CURRENT_DATE;

-- 新增 OCR 使用记录表
CREATE TABLE "ocr_usage_logs" (
  "id"              BIGSERIAL PRIMARY KEY,
  "user_id"         TEXT NOT NULL,
  "task_id"         TEXT,
  "pages_total"     INTEGER NOT NULL,
  "chars_total"     INTEGER NOT NULL,
  "free_pages_used" INTEGER NOT NULL,
  "free_chars_used" INTEGER NOT NULL,
  "charged_pages"   INTEGER NOT NULL,
  "charged_chars"   INTEGER NOT NULL,
  "fee_amount"      DECIMAL(10, 2) NOT NULL,
  "fee_source"      TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'completed',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ocr_usage_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "ocr_usage_logs_user_id_idx" ON "ocr_usage_logs"("user_id");
CREATE INDEX "ocr_usage_logs_created_at_idx" ON "ocr_usage_logs"("created_at");