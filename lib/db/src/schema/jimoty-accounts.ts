import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jimotyAccountsTable = pgTable("jimoty_accounts", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  accountType: text("account_type").notNull().default("business"),
  defaultArea: text("default_area"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJimotyAccountSchema = createInsertSchema(jimotyAccountsTable).omit({ id: true, createdAt: true });
export type InsertJimotyAccount = z.infer<typeof insertJimotyAccountSchema>;
export type JimotyAccount = typeof jimotyAccountsTable.$inferSelect;
