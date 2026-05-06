import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const tiktokAccountsTable = pgTable("tiktok_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default(""),
  username: text("username"),
  sessionCookie: text("session_cookie"),
  isConnected: boolean("is_connected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tiktokDmRulesTable = pgTable("tiktok_dm_rules", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => tiktokAccountsTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  targetHashtag: text("target_hashtag").notNull().default(""),
  targetKeyword: text("target_keyword").notNull().default(""),
  messageTemplate: text("message_template").notNull().default(""),
  dailyLimit: integer("daily_limit").notNull().default(20),
  executedToday: integer("executed_today").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  scheduleTimes: text("schedule_times").notNull().default(""),
  minFollowers: integer("min_followers").notNull().default(0),
  genderFilter: text("gender_filter").notNull().default("any"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tiktokDmLogsTable = pgTable("tiktok_dm_logs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => tiktokAccountsTable.id, { onDelete: "cascade" }),
  targetUsername: text("target_username"),
  targetUserId: text("target_user_id"),
  message: text("message"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
