ALTER TABLE "email_logs"
  ADD COLUMN IF NOT EXISTS "to_email" text,
  ADD COLUMN IF NOT EXISTS "from_email" text,
  ADD COLUMN IF NOT EXISTS "from_name" text,
  ADD COLUMN IF NOT EXISTS "template_id" integer,
  ADD COLUMN IF NOT EXISTS "provider_message_id" text,
  ADD COLUMN IF NOT EXISTS "attempt" integer NOT NULL DEFAULT 1;

ALTER TABLE "cron_jobs"
  ADD COLUMN IF NOT EXISTS "run_status" text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS "last_result" text,
  ADD COLUMN IF NOT EXISTS "last_error" text,
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "finished_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "email_logs_provider_message_id_idx" ON "email_logs" ("provider_message_id");