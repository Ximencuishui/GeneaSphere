-- 册谱批注属于家族卷宗。删除后进回收站，不再直接抹掉。

ALTER TABLE "book_annotations" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "book_annotations" ADD COLUMN "deleted_by" TEXT;

CREATE INDEX "book_annotations_volume_id_deleted_at_idx" ON "book_annotations"("volume_id", "deleted_at");
