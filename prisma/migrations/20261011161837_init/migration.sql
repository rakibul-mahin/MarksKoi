-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'FACULTY', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('SPRING', 'SUMMER', 'FALL');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "FacultyRole" AS ENUM ('OWNER', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('UNVERIFIED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('REGULAR', 'OFFICIAL_TOTAL', 'OFFICIAL_GRADE');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('NUMERIC', 'TEXT');

-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('SCORED', 'MISSING', 'PENDING', 'EXCUSED', 'ABSENT');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'CONFIG_CHANGE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'VALIDATION_FAILED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMPTZ(6),
    "name" TEXT,
    "image" TEXT,
    "student_id" TEXT,
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimed_at" TIMESTAMPTZ(6),
    "last_sign_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,
    "reason" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "season" "Season" NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_offerings" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "OfferingStatus" NOT NULL DEFAULT 'ACTIVE',
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_sync" BOOLEAN NOT NULL DEFAULT true,
    "sync_lease_token" TEXT,
    "sync_lease_until" TIMESTAMPTZ(6),
    "last_sync_attempt_at" TIMESTAMPTZ(6),
    "last_sync_success_at" TIMESTAMPTZ(6),
    "last_sync_status" "SyncStatus",
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_faculty" (
    "offering_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "FacultyRole" NOT NULL DEFAULT 'INSTRUCTOR',
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_faculty_pkey" PRIMARY KEY ("offering_id","profile_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "source_student_id" TEXT,
    "source_email" TEXT,
    "source_name" TEXT,
    "source_row" INTEGER,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_sources" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "spreadsheet_title" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "last_verified_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "connected_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sheet_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_worksheets" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "google_sheet_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_roster" BOOLEAN NOT NULL DEFAULT false,
    "header_row" INTEGER NOT NULL DEFAULT 1,
    "student_id_header" TEXT,
    "email_header" TEXT,
    "name_header" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sheet_worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_groups" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(8,2),
    "value_type" "ValueType" NOT NULL DEFAULT 'NUMERIC',
    "kind" "AssessmentKind" NOT NULL DEFAULT 'REGULAR',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_columns" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "worksheet_id" UUID NOT NULL,
    "header" TEXT NOT NULL,
    "normalized_header" TEXT NOT NULL,
    "last_column_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessment_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "triggered_by_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "students_matched" INTEGER NOT NULL DEFAULT 0,
    "enrollments_added" INTEGER NOT NULL DEFAULT 0,
    "enrollments_removed" INTEGER NOT NULL DEFAULT 0,
    "marks_created" INTEGER NOT NULL DEFAULT 0,
    "marks_updated" INTEGER NOT NULL DEFAULT 0,
    "marks_unchanged" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error_code" TEXT,
    "auto_published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_errors" (
    "id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "worksheet_title" TEXT,
    "row_number" INTEGER,
    "column_header" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "status" "MarkStatus" NOT NULL,
    "score" DECIMAL(8,2),
    "text_value" TEXT,
    "raw_value" TEXT,
    "source_sync_run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_snapshots" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "published_by_id" UUID,
    "source_sync_run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),
    "withdrawn_by_id" UUID,

    CONSTRAINT "publication_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_assessments" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "group_order" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL,
    "max_score" DECIMAL(8,2),
    "value_type" "ValueType" NOT NULL,
    "kind" "AssessmentKind" NOT NULL,

    CONSTRAINT "published_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_marks" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "status" "MarkStatus" NOT NULL,
    "score" DECIMAL(8,2),
    "text_value" TEXT,

    CONSTRAINT "published_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "offering_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_student_id_key" ON "profiles"("student_id");

-- CreateIndex
CREATE INDEX "accounts_profile_id_idx" ON "accounts"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_profile_id_idx" ON "sessions"("profile_id");

-- CreateIndex
CREATE INDEX "user_roles_role_idx" ON "user_roles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_profile_id_role_key" ON "user_roles"("profile_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_season_year_key" ON "semesters"("season", "year");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "course_offerings_semester_id_idx" ON "course_offerings"("semester_id");

-- CreateIndex
CREATE INDEX "course_offerings_status_scheduled_sync_idx" ON "course_offerings"("status", "scheduled_sync");

-- CreateIndex
CREATE UNIQUE INDEX "course_offerings_course_id_semester_id_section_key" ON "course_offerings"("course_id", "semester_id", "section");

-- CreateIndex
CREATE INDEX "course_faculty_profile_id_idx" ON "course_faculty"("profile_id");

-- CreateIndex
CREATE INDEX "enrollments_student_profile_id_status_idx" ON "enrollments"("student_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_offering_id_student_profile_id_key" ON "enrollments"("offering_id", "student_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_sources_offering_id_key" ON "sheet_sources"("offering_id");

-- CreateIndex
CREATE INDEX "sheet_sources_spreadsheet_id_idx" ON "sheet_sources"("spreadsheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_worksheets_source_id_google_sheet_id_key" ON "sheet_worksheets"("source_id", "google_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_groups_offering_id_name_key" ON "assessment_groups"("offering_id", "name");

-- CreateIndex
CREATE INDEX "assessments_group_id_idx" ON "assessments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_offering_id_name_key" ON "assessments"("offering_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_columns_assessment_id_worksheet_id_key" ON "assessment_columns"("assessment_id", "worksheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_columns_worksheet_id_normalized_header_key" ON "assessment_columns"("worksheet_id", "normalized_header");

-- CreateIndex
CREATE INDEX "sync_runs_offering_id_started_at_idx" ON "sync_runs"("offering_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "sync_runs_status_started_at_idx" ON "sync_runs"("status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "sync_errors_sync_run_id_severity_idx" ON "sync_errors"("sync_run_id", "severity");

-- CreateIndex
CREATE INDEX "marks_offering_id_idx" ON "marks"("offering_id");

-- CreateIndex
CREATE INDEX "marks_assessment_id_idx" ON "marks"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "marks_enrollment_id_assessment_id_key" ON "marks"("enrollment_id", "assessment_id");

-- CreateIndex
CREATE INDEX "publication_snapshots_offering_id_status_idx" ON "publication_snapshots"("offering_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "publication_snapshots_offering_id_version_key" ON "publication_snapshots"("offering_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "published_assessments_snapshot_id_assessment_id_key" ON "published_assessments"("snapshot_id", "assessment_id");

-- CreateIndex
CREATE INDEX "published_marks_enrollment_id_idx" ON "published_marks"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "published_marks_snapshot_id_enrollment_id_assessment_id_key" ON "published_marks"("snapshot_id", "enrollment_id", "assessment_id");

-- CreateIndex
CREATE INDEX "audit_logs_offering_id_created_at_idx" ON "audit_logs"("offering_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_faculty" ADD CONSTRAINT "course_faculty_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_faculty" ADD CONSTRAINT "course_faculty_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_faculty" ADD CONSTRAINT "course_faculty_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_sources" ADD CONSTRAINT "sheet_sources_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_sources" ADD CONSTRAINT "sheet_sources_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_worksheets" ADD CONSTRAINT "sheet_worksheets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sheet_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_groups" ADD CONSTRAINT "assessment_groups_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "assessment_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_columns" ADD CONSTRAINT "assessment_columns_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_columns" ADD CONSTRAINT "assessment_columns_worksheet_id_fkey" FOREIGN KEY ("worksheet_id") REFERENCES "sheet_worksheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_source_sync_run_id_fkey" FOREIGN KEY ("source_sync_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_snapshots" ADD CONSTRAINT "publication_snapshots_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_snapshots" ADD CONSTRAINT "publication_snapshots_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_snapshots" ADD CONSTRAINT "publication_snapshots_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_snapshots" ADD CONSTRAINT "publication_snapshots_source_sync_run_id_fkey" FOREIGN KEY ("source_sync_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_assessments" ADD CONSTRAINT "published_assessments_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "publication_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_assessments" ADD CONSTRAINT "published_assessments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_marks" ADD CONSTRAINT "published_marks_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "publication_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_marks" ADD CONSTRAINT "published_marks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_marks" ADD CONSTRAINT "published_marks_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written integrity constraints (not expressible in the Prisma schema)
-- ─────────────────────────────────────────────────────────────────────────────

-- Emails are canonicalized to lower case by the application; enforce it.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_student_id_not_blank" CHECK ("student_id" IS NULL OR length(btrim("student_id")) > 0);

ALTER TABLE "courses" ADD CONSTRAINT "courses_code_upper" CHECK ("code" = upper("code") AND length("code") > 0);
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_year_range" CHECK ("year" BETWEEN 2000 AND 2100);

ALTER TABLE "sheet_worksheets" ADD CONSTRAINT "sheet_worksheets_header_row_positive" CHECK ("header_row" >= 1);

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_max_score_positive" CHECK ("max_score" IS NULL OR "max_score" > 0);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_numeric_requires_max" CHECK ("value_type" <> 'NUMERIC' OR "max_score" IS NOT NULL);

-- A SCORED mark must carry exactly one value; other states carry none.
ALTER TABLE "marks" ADD CONSTRAINT "marks_value_matches_status" CHECK (
  ("status" = 'SCORED' AND (("score" IS NOT NULL) <> ("text_value" IS NOT NULL)))
  OR ("status" <> 'SCORED' AND "score" IS NULL AND "text_value" IS NULL)
);
ALTER TABLE "marks" ADD CONSTRAINT "marks_score_non_negative" CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "published_marks" ADD CONSTRAINT "published_marks_value_matches_status" CHECK (
  ("status" = 'SCORED' AND (("score" IS NOT NULL) <> ("text_value" IS NOT NULL)))
  OR ("status" <> 'SCORED' AND "score" IS NULL AND "text_value" IS NULL)
);

-- At most one ACTIVE publication snapshot per offering.
CREATE UNIQUE INDEX "publication_snapshots_one_active_per_offering"
  ON "publication_snapshots" ("offering_id") WHERE "status" = 'ACTIVE';

-- At most one roster worksheet per spreadsheet source.
CREATE UNIQUE INDEX "sheet_worksheets_one_roster_per_source"
  ON "sheet_worksheets" ("source_id") WHERE "is_roster" = true;

-- At most one RUNNING sync per offering (second line of defence behind the lease).
CREATE UNIQUE INDEX "sync_runs_one_running_per_offering"
  ON "sync_runs" ("offering_id") WHERE "status" = 'RUNNING';

-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase hardening. The application connects as the database owner through Prisma and
-- enforces authorization in the server layer. Supabase also exposes the `public` schema through
-- its Data API to the `anon` and `authenticated` roles; enable RLS with no policies and revoke
-- privileges so those roles can never read academic data. On plain PostgreSQL (local/tests)
-- those roles do not exist and the revokes are skipped.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$$;
