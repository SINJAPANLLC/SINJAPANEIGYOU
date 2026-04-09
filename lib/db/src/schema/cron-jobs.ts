import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const cronJobsTable = pgTable("cron_jobs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "lead_search" | "email_send"
  cronExpression: text("cron_expression").notNull(), // e.g. "0 9 * * 1"
  config: text("config").notNull().default("{}"), // JSON string
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCronJobSchema = createInsertSchema(cronJobsTable).omit({ id: true, createdAt: true, updatedAt: true, lastRunAt: true, nextRunAt: true });
export type InsertCronJob = z.infer<typeof insertCronJobSchema>;
export type CronJob = typeof cronJobsTable.$inferSelect;
