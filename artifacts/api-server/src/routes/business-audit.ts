import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, businessesTable, templatesTable, leadsTable, cronJobsTable } from "@workspace/db";
import { getUserId, requireAuth } from "../lib/auth";
import { hasUnsupportedEmailClaims } from "../lib/email-content-policy";
import { getSalesProfile } from "../lib/sales-profiles";
import { getSmtpReadiness } from "../lib/mailer";

const router: IRouter = Router();
const PLACEHOLDER = /{{\s*([^}]+)\s*}}/g;
const ALLOWED = new Set(["company_name", "service_name", "service_url", "unsubscribe_url"]);

function auditTemplate(template: typeof templatesTable.$inferSelect, business: typeof businessesTable.$inferSelect, companyName: string) {
  const issues: Array<{ level: "error" | "warning"; message: string }> = [];
  const source = `${template.subjectTemplate}\n${template.htmlTemplate}`;
  const placeholders = [...source.matchAll(PLACEHOLDER)].map((m) => m[1].trim());
  const unknown = [...new Set(placeholders.filter((p) => !ALLOWED.has(p)))];
  if (unknown.length) issues.push({ level: "error", message: `未対応の変数: ${unknown.join(", ")}` });
  if (!template.htmlTemplate.includes("{{unsubscribe_url}}") && !template.htmlTemplate.includes("#unsubscribe")) {
    issues.push({ level: "warning", message: "配信停止リンクの指定がありません" });
  }
  if (!business.serviceUrl && source.includes("{{service_url}}")) issues.push({ level: "error", message: "サービスURLが未設定です" });
  if (hasUnsupportedEmailClaims([source])) issues.push({ level: "error", message: "確認できない実績・料金・保証・効果表現が含まれています" });
  const replace = (value: string) => value
    .replace(/{{company_name}}/g, companyName)
    .replace(/{{service_name}}/g, business.name)
    .replace(/{{service_url}}/g, business.serviceUrl || "【URL未設定】")
    .replace(/{{unsubscribe_url}}/g, "https://example.invalid/unsubscribe-preview");
  return { issues, preview: { subject: replace(template.subjectTemplate), html: replace(template.htmlTemplate) } };
}

router.get("/business-audit", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId));
  const ids = businesses.map((b) => b.id);
  if (!ids.length) { res.json([]); return; }
  const [templates, leads, jobs, smtp] = await Promise.all([
    db.select().from(templatesTable).where(inArray(templatesTable.businessId, ids)),
    db.select().from(leadsTable).where(inArray(leadsTable.businessId, ids)),
    db.select().from(cronJobsTable).where(inArray(cronJobsTable.businessId, ids)),
    getSmtpReadiness(),
  ]);
  const hasGlobalSender = Boolean(process.env.SMTP_USER);
  res.json(businesses.map((business) => {
    const businessTemplates = templates.filter((t) => t.businessId === business.id);
    const businessLeads = leads.filter((l) => l.businessId === business.id);
    const sampleLead = businessLeads.find((l) => l.companyName);
    const businessJobs = jobs.filter((j) => j.businessId === business.id);
    const activeSearchJobs = businessJobs.filter((j) => j.isActive && (j.type === "lead_search" || j.type === "lead_search_and_send"));
    const activeSendJobs = businessJobs.filter((j) => j.isActive && (j.type === "email_send" || j.type === "lead_search_and_send"));
    const profile = getSalesProfile(business.name);
    const checks: Array<{ level: "error" | "warning"; message: string }> = [];
    if (!business.companyName) checks.push({ level: "warning", message: "正式な会社名が未設定です" });
    if (!business.serviceUrl) checks.push({ level: "error", message: "サービスURLが未設定です" });
    if (!business.senderName) checks.push({ level: "error", message: "送信者名が未設定です" });
    if (!business.senderEmail && !hasGlobalSender) checks.push({ level: "error", message: "送信者メールが未設定です" });
    if (!business.signatureHtml) checks.push({ level: "warning", message: "メール署名が未設定です" });
    if (!businessTemplates.length) checks.push({ level: "error", message: "テンプレートがありません" });
    if (!profile) checks.push({ level: "error", message: "法人向け収集条件が未設定です" });
    if (!activeSearchJobs.length) checks.push({ level: "error", message: "リスト収集スケジュールがありません" });
    if (!activeSendJobs.length) checks.push({ level: "error", message: "メール送信スケジュールがありません" });
    if (!smtp.ready) checks.push({ level: "warning", message: "SMTPが利用できないため、メール送信は安全に停止中です" });
    const auditedTemplates = businessTemplates.map((template) => ({
      ...template,
      ...auditTemplate(template, business, sampleLead?.companyName || "サンプル株式会社"),
    }));
    checks.push(...auditedTemplates.flatMap((t) => t.issues));
    return {
      business,
      checks,
      status: checks.some((c) => c.level === "error") ? "blocked" : checks.length ? "review" : "ready",
      templates: auditedTemplates,
      sampleLead: sampleLead ? { id: sampleLead.id, companyName: sampleLead.companyName, email: sampleLead.email } : null,
      schedules: businessJobs,
      readiness: {
        collection: Boolean(profile && activeSearchJobs.length),
        sending: Boolean(businessTemplates.length && business.serviceUrl && business.senderName && (business.senderEmail || hasGlobalSender) && activeSendJobs.length && smtp.ready),
        smtp,
        leadCount: businessLeads.length,
        emailCount: businessLeads.filter((l) => l.email).length,
        unsentEmailCount: businessLeads.filter((l) => l.email && l.status === "unsent").length,
        profile: profile ? { keyword: profile.keyword, persona: profile.persona } : null,
      },
    };
  }));
});

export default router;