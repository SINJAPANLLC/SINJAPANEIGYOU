import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, templatesTable, businessesTable, leadsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import {
  CreateTemplateBody,
  UpdateTemplateBody,
  UpdateTemplateParams,
  GetTemplateParams,
  DeleteTemplateParams,
  ListTemplatesQueryParams,
  GenerateAiEmailParams,
  GenerateAiEmailBody,
} from "@workspace/api-zod";
import { generateSalesEmail, generateEmailTemplate } from "../lib/ai";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

router.post("/email/generate", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { leadId, businessId } = req.body;
  if (!leadId || !businessId) {
    res.status(400).json({ error: "leadId and businessId are required" });
    return;
  }
  const [business] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, Number(businessId)), eq(businessesTable.userId, userId))
  );
  if (!business) { res.status(403).json({ error: "Forbidden" }); return; }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, Number(leadId)));
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }

  const companyName = lead.companyName || "御社";
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
  });
  try {
    const prompt = `あなたは日本語のBtoB営業メールの専門家です。以下の情報を使って自然な日本語の営業メールを生成してください。

送信先企業: ${companyName}
自社サービス名: ${business.name}
自社サービスURL: ${business.serviceUrl || ""}
送信者名: ${business.senderName || ""}

要件:
- スパムに見えない、誠実で価値提案が明確なメール
- 件名は開封率が高い簡潔なもの
- 本文はHTML形式（<p>タグなど使用可）
- 押しつけがましくなく、相手の状況に寄り添う内容

以下のJSON形式で返してください:
{"subject": "件名", "html": "<p>HTML本文</p>"}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    res.json({ subject: parsed.subject || `${companyName}様へのご提案`, html: parsed.html || `<p>${companyName}様、はじめまして。</p>` });
  } catch (err: any) {
    // fallback
    res.json({
      subject: `${companyName}様へのご提案`,
      html: `<p>${companyName}様</p>\n<p>はじめまして。${business.name}の${business.senderName || "担当"}と申します。</p>\n<p>この度、貴社のご発展に貢献できるサービスをご提案したくご連絡いたしました。</p>\n<p>ご興味がございましたら、お気軽にご返信ください。</p>`,
    });
  }
});

router.post("/ai/generate-template", requireAuth, async (req, res): Promise<void> => {
  const { description } = req.body;
  if (!description || typeof description !== "string" || description.trim().length < 5) {
    res.status(400).json({ error: "説明文を入力してください" });
    return;
  }

  const result = await generateEmailTemplate({ description: description.trim() });
  if (!result) {
    res.status(500).json({ error: "AI生成に失敗しました。しばらくしてから再試行してください。" });
    return;
  }

  res.json(result);
});

router.get("/templates", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const queryParams = ListTemplatesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let query = db
    .select({ template: templatesTable })
    .from(templatesTable)
    .innerJoin(businessesTable, eq(templatesTable.businessId, businessesTable.id))
    .where(eq(businessesTable.userId, userId));

  const rows = await query.orderBy(templatesTable.createdAt);
  let result = rows.map((r) => r.template);

  if (queryParams.data.businessId != null) {
    result = result.filter((t) => t.businessId === queryParams.data.businessId);
  }

  res.json(result);
});

router.post("/templates", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ownsBusiness(userId, parsed.data.businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [template] = await db.insert(templatesTable).values(parsed.data).returning();
  res.status(201).json(template);
});

router.get("/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ template: templatesTable })
    .from(templatesTable)
    .innerJoin(businessesTable, eq(templatesTable.businessId, businessesTable.id))
    .where(and(eq(templatesTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(row.template);
});

router.patch("/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = UpdateTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select({ template: templatesTable })
    .from(templatesTable)
    .innerJoin(businessesTable, eq(templatesTable.businessId, businessesTable.id))
    .where(and(eq(templatesTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const [template] = await db
    .update(templatesTable)
    .set(parsed.data)
    .where(eq(templatesTable.id, params.data.id))
    .returning();
  res.json(template);
});

router.delete("/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ template: templatesTable })
    .from(templatesTable)
    .innerJoin(businessesTable, eq(templatesTable.businessId, businessesTable.id))
    .where(and(eq(templatesTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  await db.delete(templatesTable).where(eq(templatesTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/templates/:id/generate-ai", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GenerateAiEmailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = GenerateAiEmailBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [templateRow] = await db
    .select({ template: templatesTable, business: businessesTable })
    .from(templatesTable)
    .innerJoin(businessesTable, eq(templatesTable.businessId, businessesTable.id))
    .where(and(eq(templatesTable.id, params.data.id), eq(businessesTable.userId, userId)));
  if (!templateRow) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [leadRow] = await db.select().from(leadsTable).where(eq(leadsTable.id, body.data.leadId));
  if (!leadRow) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const { template, business } = templateRow;
  const generated = await generateSalesEmail({
    companyName: leadRow.companyName || "御社",
    serviceName: business.name,
    serviceUrl: business.serviceUrl || "",
    subjectTemplate: template.subjectTemplate,
    htmlTemplate: template.htmlTemplate,
  });

  if (!generated) {
    // Fallback: simple variable substitution
    const subject = template.subjectTemplate
      .replace("{{company_name}}", leadRow.companyName || "御社")
      .replace("{{service_name}}", business.name)
      .replace("{{service_url}}", business.serviceUrl || "");
    const html = template.htmlTemplate
      .replace(/{{company_name}}/g, leadRow.companyName || "御社")
      .replace(/{{service_name}}/g, business.name)
      .replace(/{{service_url}}/g, business.serviceUrl || "");
    res.json({ subject, html });
    return;
  }

  res.json(generated);
});

export default router;
