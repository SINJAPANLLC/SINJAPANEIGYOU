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
import { generateSalesEmail } from "../lib/ai";

const router: IRouter = Router();

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db.select().from(businessesTable).where(
    and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
  );
  return b;
}

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
