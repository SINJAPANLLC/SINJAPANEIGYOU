import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const jimotySettingsTable = pgTable("jimoty_settings", {
  id: serial("id").primaryKey(),
  area: text("area").notNull().default("osaka-fu"),
  cronExpression: text("cron_expression").notNull().default("0 2 * * *"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type JimotySettings = typeof jimotySettingsTable.$inferSelect;
