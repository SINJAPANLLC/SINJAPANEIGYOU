import OpenAI from "openai";
import { logger } from "./logger";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
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
    logger.warn("OPENAI_API_KEY not set, skipping AI generation");
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
      temperature: 0.7,
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
