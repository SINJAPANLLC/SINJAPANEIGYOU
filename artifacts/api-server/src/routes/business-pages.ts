import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  businessesTable,
  businessPagesTable,
  conversionEventsTable,
  lpInquiriesTable,
} from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";

const router: IRouter = Router();
const SAFE_EVENTS = new Set(["page_view", "cta_click", "contact_start", "contact_submit", "signup_complete"]);
const SAFE_STATUS = new Set(["draft", "review", "published"]);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: { get(name: string): string | undefined; ip?: string }) {
  return req.ip || "unknown";
}

function withinRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    if (rateBuckets.size > 10_000) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count++;
  return true;
}

function isSafePublicUrl(value: string) {
  if (value === "#contact") return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

function requestOrigin(req: { get(name: string): string | undefined; protocol: string }) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0].trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0].trim();
  return `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
}

function slugify(value: string, id: number) {
  const ascii = value.normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
  return `${ascii || "service"}-${id}`;
}

function draftForBusiness(business: typeof businessesTable.$inferSelect) {
  const company = business.companyName || business.name;
  return {
    businessId: business.id,
    slug: slugify(business.name, business.id),
    status: "draft",
    title: `${business.name}｜${company}`,
    description: `${company}が提供する「${business.name}」のサービス情報、特徴、相談窓口をご案内します。`,
    headline: `${business.name}で、次の一歩をわかりやすく`,
    subheadline: `${company}のサービス内容をご確認いただき、ご関心に合う場合はお気軽にご相談ください。`,
    targetAudience: "サービス内容を確認し、相談を検討している企業・担当者",
    painPoints: ["情報を比較しながら、自社に合う選択肢を確認したい", "相談前にサービス内容と運営会社を確認したい"],
    benefits: ["サービスの概要を一ページで確認", "公式の案内先から詳細を確認", "相談内容を整理して問い合わせ可能"],
    faq: [
      { question: "詳しいサービス内容はどこで確認できますか？", answer: "ページ内の案内ボタンから公式サービスページをご確認いただけます。" },
      { question: "相談する前に確認できますか？", answer: "はい。お問い合わせ内容を確認したうえで担当者からご案内します。" },
    ],
    ctaLabel: "サービスの詳細を見る",
    ctaUrl: business.serviceUrl && isSafePublicUrl(business.serviceUrl) ? business.serviceUrl : "#contact",
    approved: false,
  };
}

router.get("/public/business-pages", async (_req, res): Promise<void> => {
  const pages = await db.select({
    id: businessPagesTable.id,
    slug: businessPagesTable.slug,
    title: businessPagesTable.title,
    description: businessPagesTable.description,
    headline: businessPagesTable.headline,
    businessName: businessesTable.name,
  }).from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .where(and(eq(businessPagesTable.status, "published"), eq(businessPagesTable.approved, true)))
    .orderBy(desc(businessPagesTable.publishedAt));
  res.json(pages);
});

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const pages = await db.select({ slug: businessPagesTable.slug, updatedAt: businessPagesTable.updatedAt })
    .from(businessPagesTable)
    .where(and(eq(businessPagesTable.status, "published"), eq(businessPagesTable.approved, true)));
  const origin = requestOrigin(req);
  const urls = [
    `<url><loc>${escapeHtml(origin)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...pages.map((page) =>
      `<url><loc>${escapeHtml(origin)}/api/public/business-pages/${encodeURIComponent(page.slug)}/page</loc><lastmod>${page.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
  ];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
});

router.get("/public/business-pages/:slug/page", async (req, res): Promise<void> => {
  const [row] = await db.select({ page: businessPagesTable, business: businessesTable })
    .from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .where(and(
      eq(businessPagesTable.slug, req.params.slug),
      eq(businessPagesTable.status, "published"),
      eq(businessPagesTable.approved, true),
    ));
  if (!row) { res.status(404).type("text/plain").send("Page not found"); return; }
  const origin = requestOrigin(req);
  const canonical = `${origin}/api/public/business-pages/${encodeURIComponent(row.page.slug)}/page`;
  const title = escapeHtml(row.page.title);
  const description = escapeHtml(row.page.description);
  const headline = escapeHtml(row.page.headline);
  const subheadline = escapeHtml(row.page.subheadline);
  const company = escapeHtml(row.business.companyName || row.business.name);
  const ctaUrl = escapeHtml(isSafePublicUrl(row.page.ctaUrl) ? row.page.ctaUrl : "#contact");
  const ctaLabel = escapeHtml(row.page.ctaLabel);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: row.page.title,
    description: row.page.description,
    url: canonical,
    publisher: { "@type": "Organization", name: row.business.companyName || row.business.name },
  }).replace(/</g, "\\u003c");
  res.type("html").send(`<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:card" content="summary"><script type="application/ld+json">${jsonLd}</script></head><body><main><article><p>${company}</p><h1>${headline}</h1><p>${subheadline}</p><a href="${ctaUrl}" rel="noopener noreferrer">${ctaLabel}</a></article></main><footer><a href="${escapeHtml(origin)}/lp/${encodeURIComponent(row.page.slug)}">画面表示で詳しく見る</a></footer></body></html>`);
});

router.get("/public/business-pages/:slug", async (req, res): Promise<void> => {
  const [row] = await db.select({ page: businessPagesTable, business: businessesTable })
    .from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .where(and(
      eq(businessPagesTable.slug, req.params.slug),
      eq(businessPagesTable.status, "published"),
      eq(businessPagesTable.approved, true),
    ));
  if (!row) { res.status(404).json({ error: "Page not found" }); return; }
  res.json({
    page: {
      ...row.page,
      ctaUrl: isSafePublicUrl(row.page.ctaUrl) ? row.page.ctaUrl : null,
      ogImageUrl: row.page.ogImageUrl && isSafePublicUrl(row.page.ogImageUrl) ? row.page.ogImageUrl : null,
    },
    business: {
      name: row.business.name,
      companyName: row.business.companyName,
      serviceUrl: row.business.serviceUrl && isSafePublicUrl(row.business.serviceUrl) ? row.business.serviceUrl : null,
    },
  });
});

router.post("/public/business-pages/:slug/events", async (req, res): Promise<void> => {
  if (!withinRateLimit(`event:${clientIp(req)}`, 120, 60_000)) {
    res.status(429).json({ error: "Too many requests" }); return;
  }
  const { eventType, path, referrer, utmSource, utmMedium, utmCampaign, sessionId } = req.body ?? {};
  if (!SAFE_EVENTS.has(String(eventType))) { res.status(400).json({ error: "Invalid event" }); return; }
  const [page] = await db.select().from(businessPagesTable)
    .where(and(eq(businessPagesTable.slug, req.params.slug), eq(businessPagesTable.status, "published"), eq(businessPagesTable.approved, true)));
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }
  await db.insert(conversionEventsTable).values({
    businessPageId: page.id,
    eventType: String(eventType),
    path: path ? String(path).slice(0, 500) : null,
    referrer: referrer ? String(referrer).slice(0, 500) : null,
    utmSource: utmSource ? String(utmSource).slice(0, 100) : null,
    utmMedium: utmMedium ? String(utmMedium).slice(0, 100) : null,
    utmCampaign: utmCampaign ? String(utmCampaign).slice(0, 100) : null,
    sessionId: sessionId ? String(sessionId).slice(0, 100) : null,
  });
  res.status(202).json({ ok: true });
});

router.post("/public/business-pages/:slug/inquiries", async (req, res): Promise<void> => {
  if (!withinRateLimit(`inquiry:${clientIp(req)}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "時間をおいてから再度お試しください" }); return;
  }
  const { companyName, name, email, message, consent } = req.body ?? {};
  if (!name || !email || !message || consent !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    res.status(400).json({ error: "必須項目と同意内容をご確認ください" }); return;
  }
  const [page] = await db.select().from(businessPagesTable)
    .where(and(eq(businessPagesTable.slug, req.params.slug), eq(businessPagesTable.status, "published"), eq(businessPagesTable.approved, true)));
  if (!page) { res.status(404).json({ error: "Page not found" }); return; }
  await db.insert(lpInquiriesTable).values({
    businessPageId: page.id,
    companyName: companyName ? String(companyName).slice(0, 200) : null,
    name: String(name).slice(0, 100),
    email: String(email).slice(0, 320),
    message: String(message).slice(0, 5000),
    consent: true,
  });
  await db.insert(conversionEventsTable).values({ businessPageId: page.id, eventType: "contact_submit", path: `/lp/${page.slug}` });
  res.status(201).json({ ok: true });
});

router.get("/business-pages", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const rows = await db.select({
    page: businessPagesTable,
    businessName: businessesTable.name,
    views: sql<number>`count(${conversionEventsTable.id}) filter (where ${conversionEventsTable.eventType} = 'page_view')`,
    ctaClicks: sql<number>`count(${conversionEventsTable.id}) filter (where ${conversionEventsTable.eventType} = 'cta_click')`,
  }).from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .leftJoin(conversionEventsTable, eq(conversionEventsTable.businessPageId, businessPagesTable.id))
    .where(eq(businessesTable.userId, userId))
    .groupBy(businessPagesTable.id, businessesTable.name)
    .orderBy(businessesTable.name);
  res.json(rows);
});

router.post("/business-pages/generate-all", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId));
  let created = 0;
  for (const business of businesses) {
    const existing = await db.select({ id: businessPagesTable.id }).from(businessPagesTable).where(eq(businessPagesTable.businessId, business.id));
    if (existing.length) continue;
    await db.insert(businessPagesTable).values(draftForBusiness(business));
    created++;
  }
  res.json({ created, total: businesses.length });
});

router.patch("/business-pages/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const [owned] = await db.select({ page: businessPagesTable })
    .from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .where(and(eq(businessPagesTable.id, id), eq(businessesTable.userId, userId)));
  if (!owned) { res.status(404).json({ error: "Page not found" }); return; }
  const body = req.body ?? {};
  const status = body.status !== undefined ? String(body.status) : undefined;
  if (status && !SAFE_STATUS.has(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  if (body.ctaUrl !== undefined && !isSafePublicUrl(String(body.ctaUrl))) {
    res.status(400).json({ error: "CTA URLはHTTPSまたは / で始まる同一サイト内パスのみ利用できます" }); return;
  }
  if (body.ogImageUrl !== undefined && body.ogImageUrl !== null && body.ogImageUrl !== "" && !isSafePublicUrl(String(body.ogImageUrl))) {
    res.status(400).json({ error: "OG画像URLはHTTPSまたは / で始まる同一サイト内パスのみ利用できます" }); return;
  }
  const effectiveCtaUrl = body.ctaUrl !== undefined ? String(body.ctaUrl) : owned.page.ctaUrl;
  if (status === "published" && !isSafePublicUrl(effectiveCtaUrl)) {
    res.status(409).json({ error: "安全なCTA URLを設定してから公開してください" }); return;
  }
  if (status === "published" && body.approved !== true && !owned.page.approved) {
    res.status(409).json({ error: "公開前に確認済みにしてください" }); return;
  }
  const values: Partial<typeof businessPagesTable.$inferInsert> = {};
  for (const key of ["slug", "title", "description", "headline", "subheadline", "targetAudience", "ctaLabel", "ctaUrl", "ogImageUrl"] as const) {
    if (body[key] !== undefined) values[key] = String(body[key]).slice(0, key === "description" || key === "subheadline" ? 1000 : 300);
  }
  if (Array.isArray(body.painPoints)) values.painPoints = body.painPoints.map(String).slice(0, 8);
  if (Array.isArray(body.benefits)) values.benefits = body.benefits.map(String).slice(0, 8);
  if (Array.isArray(body.faq)) values.faq = body.faq.slice(0, 10);
  if (body.approved !== undefined) values.approved = body.approved === true;
  if (status) {
    values.status = status;
    values.publishedAt = status === "published" ? new Date() : null;
  }
  const [updated] = await db.update(businessPagesTable).set(values).where(eq(businessPagesTable.id, id)).returning();
  res.json(updated);
});

router.get("/business-pages/:id/preview", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const [row] = await db.select({ page: businessPagesTable, business: businessesTable })
    .from(businessPagesTable)
    .innerJoin(businessesTable, eq(businessPagesTable.businessId, businessesTable.id))
    .where(and(eq(businessPagesTable.id, Number(req.params.id)), eq(businessesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Page not found" }); return; }
  res.json(row);
});

export default router;