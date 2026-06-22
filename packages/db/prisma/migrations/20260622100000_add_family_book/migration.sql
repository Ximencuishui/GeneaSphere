-- CreateEnum
CREATE TYPE "FamilyBookGrouping" AS ENUM ('family', 'branch', 'generation');

-- CreateEnum
CREATE TYPE "FamilyBookPageType" AS ENUM ('cover', 'toc', 'section', 'person', 'family', 'epilogue');

-- CreateEnum
CREATE TYPE "FamilyBookCoverTemplate" AS ENUM ('red', 'gold', 'green', 'ink', 'modern');

-- CreateEnum
CREATE TYPE "FamilyBookStatus" AS ENUM ('draft', 'preview', 'ordered');

-- CreateTable
CREATE TABLE "family_book_projects" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "start_person_id" BIGINT NOT NULL,
    "generations" INTEGER NOT NULL DEFAULT 3,
    "include_spouse" BOOLEAN NOT NULL DEFAULT true,
    "grouping" "FamilyBookGrouping" NOT NULL DEFAULT 'family',
    "selected_fields" TEXT[] NOT NULL DEFAULT ARRAY['name', 'photo', 'birth', 'bio']::TEXT[],
    "cover_template" "FamilyBookCoverTemplate" NOT NULL DEFAULT 'red',
    "title" VARCHAR(200) NOT NULL,
    "preface" TEXT,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "person_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "status" "FamilyBookStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_book_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_book_pages" (
    "id" BIGSERIAL NOT NULL,
    "project_id" BIGINT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "page_type" "FamilyBookPageType" NOT NULL DEFAULT 'person',
    "title" VARCHAR(200),
    "subtitle" VARCHAR(200),
    "body" TEXT,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_book_pages_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "print_orders" ADD COLUMN "family_book_project_id" BIGINT;

-- CreateIndex
CREATE INDEX "family_book_projects_user_id_status_idx" ON "family_book_projects"("user_id", "status");

-- CreateIndex
CREATE INDEX "family_book_projects_clan_id_idx" ON "family_book_projects"("clan_id");

-- CreateIndex
CREATE INDEX "family_book_projects_created_at_idx" ON "family_book_projects"("created_at");

-- CreateIndex
CREATE INDEX "family_book_pages_project_id_page_number_idx" ON "family_book_pages"("project_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "family_book_pages_project_id_page_number_key" ON "family_book_pages"("project_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "print_orders_family_book_project_id_key" ON "print_orders"("family_book_project_id");

-- AddForeignKey
ALTER TABLE "family_book_projects" ADD CONSTRAINT "family_book_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_book_projects" ADD CONSTRAINT "family_book_projects_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_book_projects" ADD CONSTRAINT "family_book_projects_start_person_id_fkey" FOREIGN KEY ("start_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_book_pages" ADD CONSTRAINT "family_book_pages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "family_book_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_orders" ADD CONSTRAINT "print_orders_family_book_project_id_fkey" FOREIGN KEY ("family_book_project_id") REFERENCES "family_book_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
