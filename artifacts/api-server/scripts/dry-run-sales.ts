import { eq } from "drizzle-orm";
import {
  businessesTable,
  cronJobsTable,
  db,
  templatesTable,
} from "@workspace/db";
import { renderEmail, auditEmail } from "../src/lib/email-renderer";
import { getSalesProfile } from "../src/lib/sales-profiles";

async function main() {
const businesses = await db.select().from(businessesTable);
const templates = await db.select().from(templatesTable);
const jobs = await db.select().from(cronJobsTable).where(eq(cronJobsTable.isActive, true));

const failures: string[] = [];
let messagesChecked = 0;

if (businesses.length !== 18) failures.push(`ビジネス数が18件ではありません: ${businesses.length}`);

for (const business of businesses) {
  const profile = getSalesProfile(business.name);
  const businessTemplates = templates.filter((template) => template.businessId === business.id);
  const businessJobs = jobs.filter((job) => job.businessId === business.id);
  const searchJobs = businessJobs.filter((job) => job.type === "lead_search");
  const sendJobs = businessJobs.filter((job) => job.type === "email_send");

  if (!profile) failures.push(`${business.name}: 法人向け収集条件なし`);
  if (!business.serviceUrl) failures.push(`${business.name}: サービスURLなし`);
  if (!business.senderName) failures.push(`${business.name}: 送信者名なし`);
  if (!businessTemplates.length) failures.push(`${business.name}: テンプレートなし`);
  if (searchJobs.length !== 1) failures.push(`${business.name}: 有効な収集ジョブが${searchJobs.length}件`);
  if (sendJobs.length !== 1) failures.push(`${business.name}: 有効な送信ジョブが${sendJobs.length}件`);

  for (const template of businessTemplates) {
    const rendered = renderEmail(template.subjectTemplate, template.htmlTemplate, {
      companyName: "株式会社テスト法人",
      serviceName: business.name,
      serviceUrl: business.serviceUrl || "",
      unsubscribeUrl: "https://example.com/api/unsubscribe/dry-run-token",
    });
    const audit = auditEmail(rendered.subject, rendered.html);
    messagesChecked++;
    if (!audit.valid) failures.push(`${business.name} / ${template.name}: ${audit.errors.join("、")}`);
    if (!rendered.html.includes("株式会社テスト法人")) failures.push(`${business.name} / ${template.name}: 法人名差し込み失敗`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, businesses: businesses.length, messagesChecked, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  businesses: businesses.length,
  messagesChecked,
  activeSearchJobs: jobs.filter((job) => job.type === "lead_search").length,
  activeSendJobs: jobs.filter((job) => job.type === "email_send").length,
  externalSearches: 0,
  externalEmailsSent: 0,
}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});