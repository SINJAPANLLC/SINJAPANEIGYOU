import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";

export const unsubscribesTable = pgTable("unsubscribes", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUnsubscribeSchema = createInsertSchema(unsubscribesTable).omit({ id: true, createdAt: true });
export type InsertUnsubscribe = z.infer<typeof insertUnsubscribeSchema>;
export type Unsubscribe = typeof unsubscribesTable.$inferSelect;
