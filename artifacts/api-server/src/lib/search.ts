import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger";
import { crawlWebsite, scoreUrl } from "./crawler";

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
}

export async function searchYahooJapan(query: string, count = 10): Promise<SearchResult[]> {
  logger.info({ query, count }, "searchYahooJapan start");
  try {
    const response = await axios.get(
      `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}&n=20`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        },
        timeout: 15000,
      }
    );

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Yahoo Japan result links use .sw-Card a selector; h3 inside has the clean title
    $(".sw-Card a").each((_, el) => {
      if (results.length >= count) return false;
      const href = $(el).attr("href") || "";
      // Use h3 text for clean title, fallback to first line of full text
      const h3Title = $(el).find("h3").text().trim();
      const fullText = $(el).text().trim();
      const title = h3Title || fullText.split("\n")[0].trim();

      if (
        href.startsWith("http") &&
        !href.includes("yahoo") &&
        !href.includes("google") &&
        title.length > 5 &&
        !seen.has(href)
      ) {
        seen.add(href);
        results.push({ url: href, title });
      }
    });

    // Fallback: look for any external anchor tags
    if (results.length === 0) {
      $("a").each((_, el) => {
        if (results.length >= count) return false;
        const href = $(el).attr("href") || "";
        const title = $(el).text().trim();
        if (
          href.startsWith("http") &&
          !href.includes("yahoo") &&
          !href.includes("google") &&
          title.length > 5 &&
          !seen.has(href)
        ) {
          seen.add(href);
          results.push({ url: href, title });
        }
      });
    }

    logger.info({ count: results.length, query }, "searchYahooJapan done");
    return results;
  } catch (err: any) {
    logger.error({ err: err?.message, query }, "Yahoo Japan search failed");
    return [];
  }
}

export async function searchAndCrawlLeads(
  keyword: string,
  location: string | null | undefined,
  maxResults: number,
): Promise<Array<{
  websiteUrl: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactUrl?: string | null;
  score: number;
}>> {
  const loc = location ? ` ${location}` : "";
  const queries = [
    `${keyword}${loc} 会社概要`,
    `${keyword}${loc} お問い合わせ 株式会社`,
    `${keyword}${loc} 企業 採用`,
  ];

  const seen = new Set<string>();
  const results: Array<{
    websiteUrl: string;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    contactUrl?: string | null;
    score: number;
  }> = [];

  for (const query of queries) {
    if (results.length >= maxResults) break;

    const searchResults = await searchYahooJapan(query, 10);
    for (const r of searchResults) {
      if (results.length >= maxResults) break;
      if (seen.has(r.url)) continue;

      const score = scoreUrl(r.url);
      if (score < 0) continue;

      seen.add(r.url);

      try {
        const crawled = await crawlWebsite(r.url);
        results.push({
          websiteUrl: r.url,
          companyName: crawled.companyName || r.title || null,
          email: crawled.email || null,
          phone: crawled.phone || null,
          address: crawled.address || null,
          contactUrl: crawled.contactUrl || null,
          score: Math.max(crawled.score, score + 3),
        });
      } catch {
        results.push({
          websiteUrl: r.url,
          companyName: r.title || null,
          email: null,
          phone: null,
          address: null,
          contactUrl: null,
          score: score + 3,
        });
      }
    }
  }

  return results;
}
