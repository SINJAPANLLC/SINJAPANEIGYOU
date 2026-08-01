import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const teleapoCampaignsTable = pgTable("teleapo_campaigns", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  firstMessage: text("first_message").notNull().default(""),
  targetNumbers: text("target_numbers").notNull().default("[]"),   // JSON string[]
  excludeNumbers: text("exclude_numbers").notNull().default("[]"), // JSON string[]
  maxCallsPerDay: integer("max_calls_per_day").notNull().default(10),
  scheduleStart: text("schedule_start").notNull().default("09:00"),
  scheduleEnd: text("schedule_end").notNull().default("18:00"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const teleapoCallsTable = pgTable("teleapo_calls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => teleapoCampaignsTable.id, { onDelete: "set null" }),
  userId: text("user_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  twilioCallSid: text("twilio_call_sid"),
  // pending | dialing | in-progress | completed | failed | no-answer | busy
  status: text("status").notNull().default("pending"),
  // interested | not-interested | appointment | no-answer | rejected | callback | unknown
  outcome: text("outcome"),
  callbackAt: timestamp("callback_at", { withTimezone: true }),
  transcript: text("transcript").notNull().default("[]"), // JSON {role,text,ts}[]
  summary: text("summary"),
  durationSec: integer("duration_sec"),
  avgLatencyMs: integer("avg_latency_ms"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
