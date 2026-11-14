DO $$ BEGIN
  CREATE TYPE "GenealogyPrintJobStatus" AS ENUM ('PENDING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "genealogy_print_jobs" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "document_id" BIGINT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "GenealogyPrintJobStatus" NOT NULL DEFAULT 'PENDING',
  "layout_params" JSONB NOT NULL,
  "document_generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "genealogy_print_jobs_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "genealogy_print_jobs_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "genealogy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "genealogy_print_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "genealogy_print_jobs_clan_id_created_at_idx"
  ON "genealogy_print_jobs"("clan_id", "created_at");
CREATE INDEX IF NOT EXISTS "genealogy_print_jobs_document_id_idx"
  ON "genealogy_print_jobs"("document_id");
