/*
  Warnings:

  - Made the column `created_at` on table `search_posts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `search_posts` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "idx_search_posts_xipai_keywords";

-- AlterTable
ALTER TABLE "search_posts" ALTER COLUMN "origin_place" SET DATA TYPE TEXT,
ALTER COLUMN "created_by" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "media_archives" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "taken_year" INTEGER,
    "taken_location" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_person_links" (
    "media_id" BIGINT NOT NULL,
    "person_id" BIGINT NOT NULL,

    CONSTRAINT "media_person_links_pkey" PRIMARY KEY ("media_id","person_id")
);

-- CreateIndex
CREATE INDEX "search_posts_xipai_keywords_idx" ON "search_posts"("xipai_keywords");

-- AddForeignKey
ALTER TABLE "media_archives" ADD CONSTRAINT "media_archives_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_archives" ADD CONSTRAINT "media_archives_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_person_links" ADD CONSTRAINT "media_person_links_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_person_links" ADD CONSTRAINT "media_person_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_search_posts_origin_place" RENAME TO "search_posts_origin_place_idx";
