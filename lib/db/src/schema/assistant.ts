import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assistantProfilesTable = pgTable(
  "assistant_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    lineUserId: text("line_user_id"),
    lineDisplayName: text("line_display_name"),
    linkCode: text("link_code").notNull(),
    timezone: text("timezone").notNull().default("Asia/Tokyo"),
    reportHour: integer("report_hour").notNull().default(9),
    reportMinute: integer("report_minute").notNull().default(0),
    reportsEnabled: boolean("reports_enabled").notNull().default(true),
    reportTopics: text("report_topics").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdUnique: uniqueIndex("assistant_profiles_user_id_idx").on(table.userId),
    lineUserIdUnique: uniqueIndex("assistant_profiles_line_user_id_idx").on(table.lineUserId),
    linkCodeUnique: uniqueIndex("assistant_profiles_link_code_idx").on(table.linkCode),
  }),
);

export const assistantMessagesTable = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull().default("line"),
  role: text("role").notNull(),
  content: text("content").notNull(),
  lineMessageId: text("line_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lineMessageIdUnique: uniqueIndex("assistant_messages_line_message_id_idx").on(table.lineMessageId),
}));

export const assistantMemoriesTable = pgTable("assistant_memories", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull().default("general"),
  content: text("content").notNull(),
  source: text("source").notNull().default("line"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assistantNotesTable = pgTable("assistant_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull().default("temporary"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("line"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assistantTodosTable = pgTable("assistant_todos", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  source: text("source").notNull().default("line"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assistantReportsTable = pgTable(
  "assistant_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    reportDate: text("report_date").notNull(),
    status: text("status").notNull().default("running"),
    content: text("content"),
    sourceSummary: text("source_summary"),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userDateUnique: uniqueIndex("assistant_reports_user_date_idx").on(table.userId, table.reportDate),
  }),
);

export const assistantResearchItemsTable = pgTable("assistant_research_items", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => assistantReportsTable.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  snippet: text("snippet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssistantMemorySchema = createInsertSchema(assistantMemoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssistantTodoSchema = createInsertSchema(assistantTodosTable).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type AssistantProfile = typeof assistantProfilesTable.$inferSelect;
export type AssistantMessage = typeof assistantMessagesTable.$inferSelect;
export type AssistantMemory = typeof assistantMemoriesTable.$inferSelect;
export type AssistantNote = typeof assistantNotesTable.$inferSelect;
export type AssistantTodo = typeof assistantTodosTable.$inferSelect;
export type AssistantReport = typeof assistantReportsTable.$inferSelect;
export type AssistantResearchItem = typeof assistantResearchItemsTable.$inferSelect;
export type InsertAssistantMemory = z.infer<typeof insertAssistantMemorySchema>;
export type InsertAssistantTodo = z.infer<typeof insertAssistantTodoSchema>;