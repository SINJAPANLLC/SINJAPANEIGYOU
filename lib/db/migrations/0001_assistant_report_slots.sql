ALTER TABLE "assistant_reports"
  ADD COLUMN IF NOT EXISTS "report_slot" text;

UPDATE "assistant_reports"
SET "report_slot" = 'morning'
WHERE "report_slot" IS NULL;

ALTER TABLE "assistant_reports"
  ALTER COLUMN "report_slot" SET DEFAULT 'morning',
  ALTER COLUMN "report_slot" SET NOT NULL;

ALTER TABLE "assistant_reports"
  ADD COLUMN IF NOT EXISTS "generation_token" text;

DROP INDEX IF EXISTS "assistant_reports_user_date_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_reports_user_date_slot_idx"
  ON "assistant_reports" ("user_id", "report_date", "report_slot");