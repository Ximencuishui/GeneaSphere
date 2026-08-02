-- I-1：族谱树首屏查询热路径索引
-- 索引均使用 IF NOT EXISTS，兼容已通过 db push 或手工建索引的环境。

CREATE INDEX IF NOT EXISTS "person_ancestry_descendant_id_depth_idx"
  ON "person_ancestry"("descendant_id", "depth");

CREATE INDEX IF NOT EXISTS "family_units_clan_id_husband_id_idx"
  ON "family_units"("clan_id", "husband_id");

CREATE INDEX IF NOT EXISTS "family_units_clan_id_wife_id_idx"
  ON "family_units"("clan_id", "wife_id");

CREATE INDEX IF NOT EXISTS "media_person_links_person_id_idx"
  ON "media_person_links"("person_id");
