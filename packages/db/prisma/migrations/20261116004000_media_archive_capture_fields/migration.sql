-- 历史影像补拍摄日、分辨率、原始文件名和经纬度。
-- 只加可空列，不回填旧数据，不删除 taken_year / taken_location。

ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "taken_on" TIMESTAMP(3);
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "original_filename" VARCHAR(255);
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "media_archives" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
