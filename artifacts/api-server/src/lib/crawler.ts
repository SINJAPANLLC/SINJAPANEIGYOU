import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger";

const EXCLUDE_DOMAINS = [
  "indeed.com", "recruit.co.jp", "doda.jp", "en-japan.com",
  "mynavi.jp", "rikunabi.com", "hellowork.mhlw.go.jp",
  "kakaku.com", "価格.com", "ranking", "compare", "portal",
  "wikipedia.org", "livedoor.com", "yahoo.co.jp", "google.com",
];

export function scoreUrl(url: string): number {
  let score = 0;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    for (const ex of EXCLUDE_DOMAINS) {
      if (host.includes(ex)) return -99;
    }

    if (host.includes("recruit") || host.includes("job") || host.includes("work")) {
      score -= 5;
    }
    if (host.endsWith(".co.jp") || host.endsWith(".jp")) score += 2;
    if (!host.includes("www.") && host.split(".").length >= 2) score += 3;

    const path = parsed.pathname;
    if (path.includes("/contact") || path.includes("/inquiry") || path.includes("/form")) score += 3;
    if (path.includes("/company") || path.includes("/about") || path.includes("/profile")) score += 3;
  } catch {
    return 0;
  }
  return score;
}

export async function crawlWebsite(url: string): Promise<{
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  address?: string | null;
  contactUrl?: string | null;
  score: number;
}> {
  const baseScore = scoreUrl(url);

  try {
    const { data: html } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SalesBot/1.0)",
      },
      maxRedirects: 3,
    });

    const $ = cheerio.load(html);

    let email: string | null = null;
    let phone: string | null = null;
    let companyName: string | null = null;
    let address: string | null = null;
    let contactUrl: string | null = null;

    // Extract email from mailto links
    $("a[href^='mailto:']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const extracted = href.replace("mailto:", "").split("?")[0].trim();
      if (extracted && extracted.includes("@") && !email) {
        email = extracted;
      }
    });

    // Extract email from text content
    if (!email) {
      const bodyText = $("body").text();
      const emailMatch = bodyText.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) email = emailMatch[0];
    }

    // Extract phone
    const bodyText = $("body").text();
    const phoneMatch = bodyText.match(/0[\d-]{9,12}/);
    if (phoneMatch) phone = phoneMatch[0];

    // Extract company name
    const title = $("title").text().trim();
    if (title) companyName = title.split(/[|－\-–]/)[0].trim();

    // Look for contact page link
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().toLowerCase();
      if ((href.includes("/contact") || href.includes("/inquiry") || text.includes("問い合わせ") || text.includes("お問い合わせ")) && !contactUrl) {
        try {
          contactUrl = new URL(href, url).href;
        } catch {
          contactUrl = href;
        }
      }
    });

    // Additional score based on what we found
    let additionalScore = 0;
    if (contactUrl) additionalScore += 3;
    if (email) additionalScore += 2;

    return { email, phone, companyName, address, contactUrl, score: baseScore + additionalScore };
  } catch (err: any) {
    logger.warn({ url, err: err?.message }, "Failed to crawl website");
    return { score: baseScore };
  }
}
