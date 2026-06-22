-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateTable
CREATE TABLE "persons" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "birth_date" TIMESTAMP(3),
    "death_date" TIMESTAMP(3),
    "is_living" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_units" (
    "id" BIGSERIAL NOT NULL,
    "clan_id" BIGINT NOT NULL,
    "husband_id" BIGINT,
    "wife_id" BIGINT,

    CONSTRAINT "family_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_children" (
    "id" BIGSERIAL NOT NULL,
    "family_id" BIGINT NOT NULL,
    "child_id" BIGINT NOT NULL,
    "birth_order" INTEGER NOT NULL,

    CONSTRAINT "family_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_ancestry" (
    "ancestor_id" BIGINT NOT NULL,
    "descendant_id" BIGINT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "person_ancestry_pkey" PRIMARY KEY ("ancestor_id","descendant_id")
);

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_units" ADD CONSTRAINT "family_units_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_units" ADD CONSTRAINT "family_units_husband_id_fkey" FOREIGN KEY ("husband_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_units" ADD CONSTRAINT "family_units_wife_id_fkey" FOREIGN KEY ("wife_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_ancestry" ADD CONSTRAINT "person_ancestry_ancestor_id_fkey" FOREIGN KEY ("ancestor_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_ancestry" ADD CONSTRAINT "person_ancestry_descendant_id_fkey" FOREIGN KEY ("descendant_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
