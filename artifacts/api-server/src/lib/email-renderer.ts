export type EmailRenderValues = {
  companyName: string;
  serviceName: string;
  serviceUrl: string;
  unsubscribeUrl: string;
};

export type EmailAudit = { valid: boolean; errors: string[] };

const dangerousClaims = [
  /導入実績|利用実績|導入社数|顧客数|満足度|No\.?\s*1/i,
  /無料(?!.*(?:場合|相談|お試し))|最安|必ず|絶対|確実|保証/,
  /提携(?:先|済|しています)|パートナー(?:企業|提携)/,
];

/** Replaces every supported placeholder in both subject and HTML. */
export function renderEmail(
  subjectTemplate: string,
  htmlTemplate: string,
  values: EmailRenderValues,
): { subject: string; html: string } {
  const safeAbsoluteUrl = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  };
  const subjectValues: Record<string, string> = {
    company_name: values.companyName.replace(/[\r\n]+/g, " "),
    service_name: values.serviceName.replace(/[\r\n]+/g, " "),
    service_url: safeAbsoluteUrl(values.serviceUrl.replace(/[\r\n]+/g, "")),
    unsubscribe_url: safeAbsoluteUrl(values.unsubscribeUrl.replace(/[\r\n]+/g, "")),
  };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
  const htmlValues = Object.fromEntries(
    Object.entries(subjectValues).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const replace = (source: string, replacements: Record<string, string>) =>
    source.replace(/{{\s*(company_name|service_name|service_url|unsubscribe_url)\s*}}/g,
      (_, key: string) => replacements[key]);
  return {
    subject: replace(subjectTemplate, subjectValues),
    html: replace(htmlTemplate, htmlValues),
  };
}

/** Audits a completed message before it is handed to a mail provider. */
export function auditEmail(subject: string, html: string): EmailAudit {
  const errors: string[] = [];
  const combined = `${subject}\n${html}`;
  if (/{{\s*[^}]+\s*}}/.test(combined)) errors.push("未置換のテンプレート変数があります");
  if (!/https?:\/\/[^\s"'<>]+/i.test(combined)) errors.push("本文にURLがありません");
  if (!/https?:\/\/[^\s"'<>]+\/api\/unsubscribe\//i.test(html)) errors.push("配信停止URLがありません");
  if (dangerousClaims.some((pattern) => pattern.test(combined))) {
    errors.push("未確認の実績・料金・提携等につながる危険な表現があります");
  }
  return { valid: errors.length === 0, errors };
}