-- 册谱二期：批注表（BookAnnotation）
-- 依据：《册谱数据模型决策清单》§G（anchor 规则：世录条目=person:<id>，文档段落=para:<序号>）
-- 幂等：老库重复执行不报错

CREATE TABLE IF NOT EXISTS "book_annotations" (
    "id" BIGSERIAL NOT NULL,
    "volume_id" BIGINT NOT NULL,
    "anchor" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_annotations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "book_annotations_volume_id_anchor_idx" ON "book_annotations"("volume_id", "anchor");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_annotations_volume_id_fkey') THEN
    ALTER TABLE "book_annotations" ADD CONSTRAINT "book_annotations_volume_id_fkey"
      FOREIGN KEY ("volume_id") REFERENCES "book_volumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
