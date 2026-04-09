import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, businessesTable, leadsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  SearchLeadsBody,
  CrawlWebsiteBody,
} from "@workspace/api-zod";
import { searchAndCrawlLeads } from "../lib/search";
import { crawlWebsite } from "../lib/crawler";

const router: IRouter = Router();

router.post("/search/leads", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = SearchLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [business] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, parsed.data.businessId), eq(businessesTable.userId, userId))
  );
  if (!business) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const maxResults = parsed.data.maxResults ?? 10;
  const results = await searchAndCrawlLeads(parsed.data.keyword, parsed.data.location ?? null, maxResults);

  const savedLeads = [];
  for (const r of results) {
    // Avoid duplicates by URL
    if (r.websiteUrl) {
      const existing = await db.select().from(leadsTable).where(
        and(eq(leadsTable.businessId, parsed.data.businessId), eq(leadsTable.websiteUrl, r.websiteUrl))
      );
      if (existing.length > 0) continue;
    }

    const [lead] = await db.insert(leadsTable).values({
      businessId: parsed.data.businessId,
      companyName: r.companyName ?? null,
      websiteUrl: r.websiteUrl,
      email: r.email ?? null,
      contactUrl: r.contactUrl ?? null,
      phone: r.phone ?? null,
      address: r.address ?? null,
      status: "unsent",
      score: r.score,
    }).returning();

    savedLeads.push(lead);
  }

  res.json({ found: results.length, saved: savedLeads.length, leads: savedLeads });
});

router.post("/search/crawl", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CrawlWebsiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await crawlWebsite(parsed.data.url);

  // If leadId provided, update the lead
  if (parsed.data.leadId) {
    const [existing] = await db
      .select({ lead: leadsTable })
      .from(leadsTable)
      .innerJoin(businessesTable, eq(leadsTable.businessId, businessesTable.id))
      .where(and(eq(leadsTable.id, parsed.data.leadId), eq(businessesTable.userId, userId)));

    if (existing) {
      await db.update(leadsTable).set({
        email: result.email ?? undefined,
        phone: result.phone ?? undefined,
        companyName: result.companyName ?? undefined,
        address: result.address ?? undefined,
        contactUrl: result.contactUrl ?? undefined,
        score: result.score,
      }).where(eq(leadsTable.id, parsed.data.leadId));
    }
  }

  res.json(result);
});

export default router;
