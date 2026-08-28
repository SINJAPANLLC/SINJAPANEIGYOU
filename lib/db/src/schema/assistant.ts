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
    airtableBaseId: text("airtable_base_id"),
    airtableTables: text("airtable_tables").notNull().default("[]"),
    airtableEnabled: boolean("airtable_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdUnique: uniqueIndex("assistant_profiles_user_id_idx").on(table.userId),
    lineUserIdUnique: uniqueIndex("assistant_profiles_line_user_id_idx").on(table.lineUserId),
    linkCodeUnique: uniqueIndex("assistant_profiles_link_code_idx").on(table.linkCode),
  }),
);

export const sinJapanDriversTable = pgTable(
  "sin_japan_drivers",
  {
    id: serial("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    airtableLookupKey: text("airtable_lookup_key").notNull(),
    airtableRecordId: text("airtable_record_id"),
    airtableTableName: text("airtable_table_name"),
    registrationFormUrl: text("registration_form_url"),
    lineUserId: text("line_user_id"),
    status: text("status").notNull().default("active"),
    workflowStatus: text("workflow_status").notNull().default("hired"),
    amazonAccountStatus: text("amazon_account_status").notNull().default("not_required"),
    appsStatus: text("apps_status").notNull().default("pending"),
    contractUrl: text("contract_url"),
    contractStatus: text("contract_status").notNull().default("not_sent"),
    contractSentAt: timestamp("contract_sent_at", { withTimezone: true }),
    contractConfirmedAt: timestamp("contract_confirmed_at", { withTimezone: true }),
    trainingGuidance: text("training_guidance"),
    vehiclePreparationGuidance: text("vehicle_preparation_guidance"),
    firstOperationDate: text("first_operation_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    ownerLineUnique: uniqueIndex("sin_japan_drivers_owner_line_idx").on(table.ownerUserId, table.lineUserId),
  }),
);

export const sinJapanDriverGroupsTable = pgTable(
  "sin_japan_driver_groups",
  {
    id: serial("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    driverId: integer("driver_id").notNull().references(() => sinJapanDriversTable.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull(),
    groupType: text("group_type").notNull().default("onboarding"),
    status: text("status").notNull().default("active"),
    onboardingGuideSentAt: timestamp("onboarding_guide_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    groupIdUnique: uniqueIndex("sin_japan_driver_groups_group_id_idx").on(table.groupId),
    driverTypeUnique: uniqueIndex("sin_japan_driver_groups_driver_type_idx").on(table.driverId, table.groupType),
  }),
);

export const sinJapanDriverLinkCodesTable = pgTable(
  "sin_japan_driver_link_codes",
  {
    id: serial("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    driverId: integer("driver_id").notNull().references(() => sinJapanDriversTable.id, { onDelete: "cascade" }),
    groupType: text("group_type").notNull().default("onboarding"),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("sin_japan_driver_link_codes_code_idx").on(table.code),
  }),
);

export const sinJapanDriverReportsTable = pgTable("sin_japan_driver_reports", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  driverId: integer("driver_id").notNull().references(() => sinJapanDriversTable.id, { onDelete: "cascade" }),
  groupId: text("group_id"),
  lineMessageId: text("line_message_id"),
  reportType: text("report_type").notNull().default("question"),
  urgency: text("urgency").notNull().default("normal"),
  content: text("content").notNull(),
  status: text("status").notNull().default("received"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lineMessageIdUnique: uniqueIndex("sin_japan_driver_reports_line_message_id_idx").on(table.lineMessageId),
}));

export const sinJapanUnlinkedGroupReportsTable = pgTable("sin_japan_unlinked_group_reports", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  groupId: text("group_id").notNull(),
  groupName: text("group_name"),
  sourceUserId: text("source_user_id"),
  lineMessageId: text("line_message_id"),
  reportType: text("report_type").notNull().default("question"),
  urgency: text("urgency").notNull().default("normal"),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"),
  deliveryReservedAt: timestamp("delivery_reserved_at", { withTimezone: true }),
  adminNotifiedAt: timestamp("admin_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lineMessageIdUnique: uniqueIndex("sin_japan_unlinked_group_reports_line_message_id_idx").on(table.lineMessageId),
}));

export const sinJapanEscalationsTable = pgTable("sin_japan_escalations", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  driverId: integer("driver_id").notNull().references(() => sinJapanDriversTable.id, { onDelete: "cascade" }),
  groupId: text("group_id"),
  category: text("category").notNull(),
  urgency: text("urgency").notNull().default("normal"),
  summary: text("summary").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  managerNotifiedAt: timestamp("manager_notified_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sinJapanResourcesTable = pgTable("sin_japan_resources", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  phase: text("phase").notNull().default("onboarding"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sinJapanDailyReportsTable = pgTable(
  "sin_japan_daily_reports",
  {
    id: serial("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    reportDate: text("report_date").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userDateUnique: uniqueIndex("sin_japan_daily_reports_user_date_idx").on(table.ownerUserId, table.reportDate),
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
    reportSlot: text("report_slot").notNull().default("morning"),
    generationToken: text("generation_token"),
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
    userDateSlotUnique: uniqueIndex("assistant_reports_user_date_slot_idx").on(table.userId, table.reportDate, table.reportSlot),
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
export const insertSinJapanDriverSchema = createInsertSchema(sinJapanDriversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type AssistantProfile = typeof assistantProfilesTable.$inferSelect;
export type SinJapanDriver = typeof sinJapanDriversTable.$inferSelect;
export type SinJapanDriverGroup = typeof sinJapanDriverGroupsTable.$inferSelect;
export type SinJapanDriverLinkCode = typeof sinJapanDriverLinkCodesTable.$inferSelect;
export type SinJapanDriverReport = typeof sinJapanDriverReportsTable.$inferSelect;
export type SinJapanEscalation = typeof sinJapanEscalationsTable.$inferSelect;
export type SinJapanResource = typeof sinJapanResourcesTable.$inferSelect;
export type SinJapanDailyReport = typeof sinJapanDailyReportsTable.$inferSelect;
export type AssistantMessage = typeof assistantMessagesTable.$inferSelect;
export type AssistantMemory = typeof assistantMemoriesTable.$inferSelect;
export type AssistantNote = typeof assistantNotesTable.$inferSelect;
export type AssistantTodo = typeof assistantTodosTable.$inferSelect;
export type AssistantReport = typeof assistantReportsTable.$inferSelect;
export type AssistantResearchItem = typeof assistantResearchItemsTable.$inferSelect;
export type InsertAssistantMemory = z.infer<typeof insertAssistantMemorySchema>;
export type InsertAssistantTodo = z.infer<typeof insertAssistantTodoSchema>;
export type InsertSinJapanDriver = z.infer<typeof insertSinJapanDriverSchema>;