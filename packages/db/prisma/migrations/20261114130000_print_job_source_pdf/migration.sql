-- 旧谱电子化原件也可以下单印刷。定稿 PDF 仍挂 document_id。
ALTER TABLE "genealogy_print_jobs" ALTER COLUMN "document_id" DROP NOT NULL;
ALTER TABLE "genealogy_print_jobs" ADD COLUMN "source_task_id" VARCHAR(40);
CREATE INDEX "genealogy_print_jobs_source_task_id_idx" ON "genealogy_print_jobs"("source_task_id");
