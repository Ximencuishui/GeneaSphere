-- 定稿快照与修谱稿分离。只加表和可空列，不回填、不改现有行的正文。

ALTER TABLE "book_volumes" ADD COLUMN IF NOT EXISTS "catalog_slot" VARCHAR(40);
CREATE INDEX IF NOT EXISTS "book_volumes_clan_id_catalog_slot_idx" ON "book_volumes"("clan_id", "catalog_slot");

ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "generation_char" VARCHAR(20);
ALTER TABLE "person_bios" ADD COLUMN IF NOT EXISTS "contact_phone" VARCHAR(40);

ALTER TABLE "person_modification_requests" ALTER COLUMN "person_id" DROP NOT NULL;
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "target_kind" VARCHAR(20) NOT NULL DEFAULT 'person';
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "target_ref" VARCHAR(80);
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "catalog_slot" VARCHAR(40);
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "filed_edition_id" BIGINT;
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "revision_edition_id" BIGINT;
ALTER TABLE "person_modification_requests" ADD COLUMN IF NOT EXISTS "applied_at" TIMESTAMP(3);

CREATE TYPE "GenealogyEditionStatus" AS ENUM ('draft', 'published', 'superseded', 'backup');

CREATE TABLE IF NOT EXISTS "genealogy_editions" (
  "id" BIGSERIAL PRIMARY KEY,
  "clan_id" BIGINT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "version_name" VARCHAR(200) NOT NULL,
  "status" "GenealogyEditionStatus" NOT NULL,
  "based_on_edition_id" BIGINT,
  "genealogy_document_id" BIGINT,
  "book_profile" VARCHAR(20) NOT NULL DEFAULT 'compact',
  "rules_text" TEXT,
  "cover_json" JSONB,
  "content_hash" VARCHAR(64) NOT NULL DEFAULT '',
  "diverged" BOOLEAN NOT NULL DEFAULT false,
  "project_submitted_at" TIMESTAMP(3),
  "digitize_confirmed_at" TIMESTAMP(3),
  "review_confirmed_at" TIMESTAMP(3),
  "revise_confirmed_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "opened_by" TEXT,
  "published_at" TIMESTAMP(3),
  "published_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "genealogy_editions_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "genealogy_editions_based_on_edition_id_fkey" FOREIGN KEY ("based_on_edition_id") REFERENCES "genealogy_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "genealogy_editions_genealogy_document_id_fkey" FOREIGN KEY ("genealogy_document_id") REFERENCES "genealogy_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "genealogy_editions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "genealogy_editions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "genealogy_editions_clan_id_status_idx" ON "genealogy_editions"("clan_id", "status");
CREATE INDEX IF NOT EXISTS "genealogy_editions_clan_id_version_number_idx" ON "genealogy_editions"("clan_id", "version_number");
CREATE UNIQUE INDEX IF NOT EXISTS "genealogy_editions_one_draft" ON "genealogy_editions"("clan_id") WHERE "status" = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS "genealogy_editions_one_published" ON "genealogy_editions"("clan_id") WHERE "status" = 'published';

CREATE TABLE IF NOT EXISTS "genealogy_edition_volumes" (
  "id" BIGSERIAL PRIMARY KEY,
  "edition_id" BIGINT NOT NULL,
  "catalog_slot" VARCHAR(40),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "title" VARCHAR(200) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "content" TEXT,
  "config" JSONB,
  "source_volume_id" BIGINT,
  CONSTRAINT "genealogy_edition_volumes_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "genealogy_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genealogy_edition_volumes_edition_id_sort_order_idx" ON "genealogy_edition_volumes"("edition_id", "sort_order");

CREATE TABLE IF NOT EXISTS "genealogy_edition_persons" (
  "id" BIGSERIAL PRIMARY KEY,
  "edition_id" BIGINT NOT NULL,
  "source_person_id" BIGINT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "genealogy_edition_persons_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "genealogy_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "genealogy_edition_persons_edition_id_source_person_id_key" ON "genealogy_edition_persons"("edition_id", "source_person_id");

CREATE TABLE IF NOT EXISTS "genealogy_edition_links" (
  "id" BIGSERIAL PRIMARY KEY,
  "edition_id" BIGINT NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "left_person_id" BIGINT NOT NULL,
  "right_person_id" BIGINT NOT NULL,
  "family_key" VARCHAR(40),
  "birth_order" INTEGER,
  "child_type" VARCHAR(20),
  "marriage_order" INTEGER,
  "union_type" VARCHAR(20),
  CONSTRAINT "genealogy_edition_links_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "genealogy_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genealogy_edition_links_edition_id_kind_idx" ON "genealogy_edition_links"("edition_id", "kind");

CREATE TABLE IF NOT EXISTS "genealogy_edition_xipai" (
  "id" BIGSERIAL PRIMARY KEY,
  "edition_id" BIGINT NOT NULL,
  "generation" INTEGER NOT NULL,
  "character" VARCHAR(20) NOT NULL,
  "note" TEXT,
  CONSTRAINT "genealogy_edition_xipai_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "genealogy_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "genealogy_edition_xipai_edition_id_generation_key" ON "genealogy_edition_xipai"("edition_id", "generation");
