-- 认亲申请补申请方家族、支系根，并增加撤回状态。
-- 新列可空，不回填旧行。clan_id 仍是受理方。

ALTER TYPE "ApplicationStatus" ADD VALUE 'WITHDRAWN';

ALTER TABLE "merge_applications" ADD COLUMN "applicant_clan_id" BIGINT;
ALTER TABLE "merge_applications" ADD COLUMN "branch_root_person_id" BIGINT;

CREATE INDEX "merge_applications_applicant_clan_id_idx" ON "merge_applications"("applicant_clan_id");
CREATE INDEX "merge_applications_branch_root_person_id_idx" ON "merge_applications"("branch_root_person_id");

ALTER TABLE "merge_applications"
  ADD CONSTRAINT "merge_applications_applicant_clan_id_fkey"
  FOREIGN KEY ("applicant_clan_id") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "merge_applications"
  ADD CONSTRAINT "merge_applications_branch_root_person_id_fkey"
  FOREIGN KEY ("branch_root_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
