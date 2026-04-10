import OpenAI from "openai";
import { logger } from "./logger";

function getClient() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

export async function generateEmailTemplate(opts: {
  description: string;
}): Promise<{ name: string; subjectTemplate: string; htmlTemplate: string } | null> {
  const client = getClient();
  if (!client) {
    logger.warn("No OpenAI API key available");
    return null;
  }

  try {
    const prompt = `あなたは営業メールのプロです。以下の説明に基づいて、日本語の営業メールテンプレートを作成してください。

説明: ${opts.description}

以下のルールに従ってください:
- テンプレートは{{company_name}}（相手企業名）、{{service_name}}（自社サービス名）、{{service_url}}（自社URL）というプレースホルダーを使用できます
- HTMLは完結したメール本文のみ（<html>/<body>タグ不要）
- 件名は簡潔で開封率が高いものに
- 本文はスパムに見えない、自然な日本語で
- 価値提案が明確で、CTA（行動喚起）を含める

以下のJSON形式で返してください:
{
  "name": "テンプレート名（簡潔な識別名）",
  "subjectTemplate": "メール件名（プレースホルダー使用可）",
  "htmlTemplate": "<p>HTML本文（プレースホルダー使用可）</p>"
}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      name: parsed.name,
      subjectTemplate: parsed.subjectTemplate,
      htmlTemplate: parsed.htmlTemplate,
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI template generation failed");
    return null;
  }
}

export async function generateSalesEmail(opts: {
  companyName: string;
  serviceName: string;
  serviceUrl: string;
  subjectTemplate: string;
  htmlTemplate: string;
}): Promise<{ subject: string; html: string } | null> {
  const client = getClient();
  if (!client) {
    logger.warn("No OpenAI API key available, skipping AI generation");
    return null;
  }

  try {
    const prompt = `
以下の情報を使って、自然で営業感のある営業メールを日本語で生成してください。

相手企業名: ${opts.companyName}
自社サービス名: ${opts.serviceName}
自社サービスURL: ${opts.serviceUrl}

件名テンプレート: ${opts.subjectTemplate}
本文テンプレート: ${opts.htmlTemplate}

テンプレートの {{company_name}}, {{service_name}}, {{service_url}} を実際の値に置き換え、
自然で読みやすい営業メールのHTML本文を生成してください。
スパムにならないよう、押しつけがましくなく、価値提案が明確な文章にしてください。

以下のJSON形式で返してください:
{
  "subject": "件名",
  "html": "<p>HTML本文</p>"
}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return { subject: parsed.subject, html: parsed.html };
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI email generation failed");
    return null;
  }
}
