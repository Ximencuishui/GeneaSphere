-- CreateEnum
CREATE TYPE "MemoryQuizStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "local_memory_quizzes" (
    "id" BIGSERIAL NOT NULL,
    "location" TEXT NOT NULL,
    "region" TEXT,
    "decade" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "MemoryQuizStatus" NOT NULL DEFAULT 'PENDING',
    "creator_id" TEXT NOT NULL,
    "tags" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_memory_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_memory_answers" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "endorsements" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_memory_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_badges" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_type" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_verified_locations" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "decade" INTEGER NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_verified_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "local_memory_quizzes_location_decade_idx" ON "local_memory_quizzes"("location", "decade");
CREATE INDEX "local_memory_quizzes_status_idx" ON "local_memory_quizzes"("status");
CREATE INDEX "local_memory_quizzes_creator_id_idx" ON "local_memory_quizzes"("creator_id");
CREATE INDEX "local_memory_answers_quiz_id_idx" ON "local_memory_answers"("quiz_id");
CREATE INDEX "local_memory_answers_user_id_idx" ON "local_memory_answers"("user_id");
CREATE INDEX "local_memory_answers_endorsements_idx" ON "local_memory_answers"("endorsements");
CREATE INDEX "memory_badges_user_id_idx" ON "memory_badges"("user_id");
CREATE INDEX "memory_badges_badge_type_idx" ON "memory_badges"("badge_type");
CREATE INDEX "user_verified_locations_user_id_idx" ON "user_verified_locations"("user_id");

-- CreateUniqueConstraint
CREATE UNIQUE INDEX "user_verified_locations_user_id_location_decade_key" ON "user_verified_locations"("user_id", "location", "decade");

-- AddForeignKey
ALTER TABLE "local_memory_quizzes" ADD CONSTRAINT "local_memory_quizzes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_memory_answers" ADD CONSTRAINT "local_memory_answers_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "local_memory_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_memory_answers" ADD CONSTRAINT "local_memory_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_badges" ADD CONSTRAINT "memory_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_verified_locations" ADD CONSTRAINT "user_verified_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
