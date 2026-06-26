-- 族谱树优化迁移
-- 1. 为闭包表加索引（1000+ 节点族谱性能关键）
-- 2. FamilyUnit 加再婚/婚姻日期支持
-- 3. FamilyChild 加 child_type 区分亲生/继子/养子
-- 4. 替换原有 UNIQUE 约束为含 marriage_order 的复合约束
--
-- ⚠️ 兼容性说明：
-- 原有 family_units 表上可能有 UNIQUE(husband_id, wife_id) 约束（如有），
-- 本迁移先 DROP 再以新复合约束替代，允许同对夫妻多段婚姻（再婚）。

-- 1. PersonAncestry 闭包表索引
CREATE INDEX IF NOT EXISTS "person_ancestry_ancestor_id_depth_idx" ON "person_ancestry"("ancestor_id", "depth");
CREATE INDEX IF NOT EXISTS "person_ancestry_descendant_id_idx" ON "person_ancestry"("descendant_id");

-- 2. ChildRelationType 枚举
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChildRelationType') THEN
    CREATE TYPE "ChildRelationType" AS ENUM ('BIOLOGICAL', 'ADOPTED', 'STEP', 'FOSTER');
  END IF;
END $$;

-- 2b. MarriageEndReason 枚举（schema.prisma 中已定义；这里仅做幂等保护，
--     老库可能未创建，IF NOT EXISTS 防止重复 type error）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarriageEndReason') THEN
    CREATE TYPE "MarriageEndReason" AS ENUM ('divorce', 'widowed');
  END IF;
END $$;

-- 3. FamilyChild 新增 child_type 列（默认 BIOLOGICAL 兼容老数据）
ALTER TABLE "family_children" ADD COLUMN IF NOT EXISTS "child_type" "ChildRelationType" NOT NULL DEFAULT 'BIOLOGICAL';
CREATE INDEX IF NOT EXISTS "family_children_family_id_idx" ON "family_children"("family_id");
CREATE INDEX IF NOT EXISTS "family_children_child_id_idx" ON "family_children"("child_id");

-- 4. FamilyUnit 新增婚姻元数据列
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "marriage_date" TIMESTAMP(3);
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "marriage_order" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "divorce_date" TIMESTAMP(3);
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "end_reason" "MarriageEndReason";
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "is_current" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family_units" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- 5. 替换原有 UNIQUE 约束（兼容老库可能存在的 UNIQUE(husband_id, wife_id)）
DO $$
BEGIN
  -- 删除旧约束（如存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_units_husband_id_wife_id_key'
      AND conrelid = 'family_units'::regclass
  ) THEN
    ALTER TABLE "family_units" DROP CONSTRAINT "family_units_husband_id_wife_id_key";
  END IF;
END $$;

-- 6. 加新复合唯一约束（允许同对夫妻多段婚姻）
CREATE UNIQUE INDEX IF NOT EXISTS "family_units_husband_id_wife_id_marriage_order_key"
  ON "family_units"("husband_id", "wife_id", "marriage_order");

-- 7. FamilyUnit 索引
CREATE INDEX IF NOT EXISTS "family_units_clan_id_idx" ON "family_units"("clan_id");
CREATE INDEX IF NOT EXISTS "family_units_husband_id_idx" ON "family_units"("husband_id");
CREATE INDEX IF NOT EXISTS "family_units_wife_id_idx" ON "family_units"("wife_id");