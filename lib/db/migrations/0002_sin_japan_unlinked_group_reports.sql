CREATE TABLE IF NOT EXISTS "sin_japan_unlinked_group_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "group_id" text NOT NULL,
  "source_user_id" text,
  "line_message_id" text,
  "report_type" text DEFAULT 'question' NOT NULL,
  "urgency" text DEFAULT 'normal' NOT NULL,
  "content" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "admin_notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sin_japan_unlinked_group_reports_line_message_id_idx"
  ON "sin_japan_unlinked_group_reports" ("line_message_id");

ALTER TABLE "sin_japan_unlinked_group_reports"
  ALTER COLUMN "status" SET DEFAULT 'pending';