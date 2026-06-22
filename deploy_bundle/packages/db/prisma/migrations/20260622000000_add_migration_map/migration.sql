-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "birth_lat" DOUBLE PRECISION,
ADD COLUMN     "birth_lng" DOUBLE PRECISION,
ADD COLUMN     "birth_place" TEXT,
ADD COLUMN     "death_lat" DOUBLE PRECISION,
ADD COLUMN     "death_lng" DOUBLE PRECISION,
ADD COLUMN     "death_place" TEXT,
ADD COLUMN     "migration_branch" TEXT;

-- CreateTable
CREATE TABLE "migration_events" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "person_id" BIGINT,
    "branch" TEXT,
    "from_location" TEXT NOT NULL,
    "from_lat" DOUBLE PRECISION,
    "from_lng" DOUBLE PRECISION,
    "to_location" TEXT NOT NULL,
    "to_lat" DOUBLE PRECISION,
    "to_lng" DOUBLE PRECISION,
    "event_year" INTEGER NOT NULL,
    "reason" TEXT,
    "description" TEXT,
    "creator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_location_media" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "location_name" TEXT NOT NULL,
    "media_id" BIGINT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "linked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_location_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_dynasties" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "end_year" INTEGER NOT NULL,
    "geojson_url" TEXT,
    "description" TEXT,
    "color" TEXT,
    "fill_opacity" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "label_position" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_dynasties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_events_clan_id_event_year_idx" ON "migration_events"("clan_id", "event_year");

-- CreateIndex
CREATE INDEX "migration_events_clan_id_branch_idx" ON "migration_events"("clan_id", "branch");

-- CreateIndex
CREATE INDEX "migration_location_media_clan_id_location_name_idx" ON "migration_location_media"("clan_id", "location_name");

-- CreateIndex
CREATE INDEX "migration_location_media_media_id_idx" ON "migration_location_media"("media_id");

-- CreateIndex
CREATE INDEX "historical_dynasties_start_year_end_year_idx" ON "historical_dynasties"("start_year", "end_year");

-- CreateIndex
CREATE INDEX "persons_clan_id_migration_branch_idx" ON "persons"("clan_id", "migration_branch");

-- AddForeignKey
ALTER TABLE "migration_events" ADD CONSTRAINT "migration_events_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_events" ADD CONSTRAINT "migration_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_events" ADD CONSTRAINT "migration_events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_location_media" ADD CONSTRAINT "migration_location_media_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_location_media" ADD CONSTRAINT "migration_location_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_location_media" ADD CONSTRAINT "migration_location_media_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

