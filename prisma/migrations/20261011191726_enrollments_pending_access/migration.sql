-- Roster rows without an official student email are enrolled without an account
-- ("pending access"); they are linked to an account later, matched by student ID.
ALTER TABLE "enrollments" ALTER COLUMN "student_profile_id" DROP NOT NULL;

-- A pending-access enrollment must carry the student ID it is identified by.
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_pending_requires_student_id"
  CHECK ("student_profile_id" IS NOT NULL OR "source_student_id" IS NOT NULL);

-- One pending-access enrollment per student ID per offering.
CREATE UNIQUE INDEX "enrollments_pending_offering_student_id_key"
  ON "enrollments" ("offering_id", "source_student_id") WHERE "student_profile_id" IS NULL;
