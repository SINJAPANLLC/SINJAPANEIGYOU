CREATE TABLE IF NOT EXISTS "business_pages" (
  "id" serial PRIMARY KEY,
  "business_id" integer NOT NULL UNIQUE REFERENCES "businesses"("id") ON DELETE CASCADE,
  "slug" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "description" text NOT NULL,
  "headline" text NOT NULL,
  "subheadline" text NOT NULL,
  "target_audience" text,
  "pain_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "benefits" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "faq" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cta_label" text NOT NULL DEFAULT '詳しく見る',
  "cta_url" text NOT NULL,
  "og_image_url" text,
  "approved" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "conversion_events" (
  "id" serial PRIMARY KEY,
  "business_page_id" integer NOT NULL REFERENCES "business_pages"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "path" text,
  "referrer" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "session_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversion_events_page_created_idx"
  ON "conversion_events" ("business_page_id", "created_at");

CREATE TABLE IF NOT EXISTS "lp_inquiries" (
  "id" serial PRIMARY KEY,
  "business_page_id" integer NOT NULL REFERENCES "business_pages"("id") ON DELETE CASCADE,
  "company_name" text,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "message" text NOT NULL,
  "consent" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'new',
  "created_at" timestamptz NOT NULL DEFAULT now()
);