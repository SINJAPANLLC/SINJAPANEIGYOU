ALTER TABLE "sin_japan_unlinked_group_reports"
  ADD COLUMN IF NOT EXISTS "delivery_reserved_at" timestamp with time zone;

UPDATE "sin_japan_unlinked_group_reports"
SET "status" = 'delivery_unknown'
WHERE "status" IN ('sending', 'batch_sending')
  AND "admin_notified_at" IS NULL;