import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const xAccountsTable = pgTable("x_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default(""),
  username: text("username"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  accessToken: text("access_token"),
  accessTokenSecret: text("access_token_secret"),
  bearerToken: text("bearer_token"),
  isConnected: boolean("is_connected").notNull().default(false),
  persona: text("persona"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const xAutomationRulesTable = pgTable("x_automation_rules", {
  id: serial("id").primaryKey(),
  xAccountId: integer("x_account_id").notNull().references(() => xAccountsTable.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  keywords: text("keywords").notNull().default(""),
  dailyLimit: integer("daily_limit").notNull().default(30),
  intervalSeconds: integer("interval_seconds").notNull().default(120),
  replyTemplate: text("reply_template"),
  executedToday: integer("executed_today").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const xAutomationLogsTable = pgTable("x_automation_logs", {
  id: serial("id").primaryKey(),
  xAccountId: integer("x_account_id").notNull().references(() => xAccountsTable.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  targetTweetId: text("target_tweet_id"),
  targetUserId: text("target_user_id"),
  targetUsername: text("target_username"),
  tweetContent: text("tweet_content"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
