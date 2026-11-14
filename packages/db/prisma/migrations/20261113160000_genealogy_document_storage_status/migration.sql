-- 册谱 PDF 对象存储失败时保留文档行，不把文件写进 file_url。
DO $$ BEGIN
  CREATE TYPE "GenealogyDocumentStorageStatus" AS ENUM ('READY', 'GENERATION_STORAGE_FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "genealogy_documents"
  ADD COLUMN IF NOT EXISTS "storage_status" "GenealogyDocumentStorageStatus" NOT NULL DEFAULT 'READY';
