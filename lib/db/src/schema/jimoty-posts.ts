import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const jimotyPostsTable = pgTable("jimoty_posts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => businessesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  errorMsg: text("error_msg"),
  jimotyUrl: text("jimoty_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJimotyPostSchema = createInsertSchema(jimotyPostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJimotyPost = z.infer<typeof insertJimotyPostSchema>;
export type JimotyPost = typeof jimotyPostsTable.$inferSelect;
