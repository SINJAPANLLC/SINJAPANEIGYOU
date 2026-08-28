import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { businessesTable } from "./businesses";

export const businessPagesTable = pgTable("business_pages", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().unique().references(() => businessesTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  headline: text("headline").notNull(),
  subheadline: text("subheadline").notNull(),
  targetAudience: text("target_audience"),
  painPoints: jsonb("pain_points").$type<string[]>().notNull().default([]),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
  faq: jsonb("faq").$type<Array<{ question: string; answer: string }>>().notNull().default([]),
  ctaLabel: text("cta_label").notNull().default("詳しく見る"),
  ctaUrl: text("cta_url").notNull(),
  ogImageUrl: text("og_image_url"),
  approved: boolean("approved").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const conversionEventsTable = pgTable("conversion_events", {
  id: serial("id").primaryKey(),
  businessPageId: integer("business_page_id").notNull().references(() => businessPagesTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  path: text("path"),
  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lpInquiriesTable = pgTable("lp_inquiries", {
  id: serial("id").primaryKey(),
  businessPageId: integer("business_page_id").notNull().references(() => businessPagesTable.id, { onDelete: "cascade" }),
  companyName: text("company_name"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  consent: boolean("consent").notNull().default(false),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
