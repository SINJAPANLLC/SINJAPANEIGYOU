import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { campaignsTable } from "./campaigns";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull().default("sent"),
  toEmail: text("to_email"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  templateId: integer("template_id"),
  providerMessageId: text("provider_message_id"),
  attempt: integer("attempt").notNull().default(1),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogsTable).omit({ id: true, createdAt: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogsTable.$inferSelect;
