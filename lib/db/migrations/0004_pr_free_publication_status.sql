ALTER TABLE "pr_articles"
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "publication_url" text,
  ADD COLUMN IF NOT EXISTS "submission_message" text,
  ADD COLUMN IF NOT EXISTS "last_checked_at" timestamptz;

UPDATE "pr_articles"
SET
  "status" = 'submitted',
  "submitted_at" = COALESCE("submitted_at", "posted_at"),
  "posted_at" = NULL
WHERE "status" = 'posted';