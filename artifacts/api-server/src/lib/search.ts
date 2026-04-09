import axios from "axios";
import { logger } from "./logger";
import { crawlWebsite, scoreUrl } from "./crawler";

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
}

export async function searchBrave(query: string, count = 10): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    logger.warn("BRAVE_API_KEY not set, returning empty results");
    return [];
  }

  try {
    const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
      params: { q: query, count },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      timeout: 10000,
    });

    const results = response.data?.web?.results || [];
    return results.map((r: any) => ({
      url: r.url,
      title: r.title,
      description: r.description,
    }));
  } catch (err: any) {
    logger.error({ err: err?.message }, "Brave search failed");
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
  const queries = [
    `"会社概要" ${keyword}${location ? " " + location : ""}`,
    `"お問い合わせ" ${keyword}${location ? " " + location : ""}`,
    `"会社情報" ${keyword}${location ? " " + location : ""}`,
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

    const searchResults = await searchBrave(query, 10);
    for (const r of searchResults) {
      if (results.length >= maxResults) break;
      if (seen.has(r.url)) continue;

      const score = scoreUrl(r.url);
      if (score < 0) continue;

      seen.add(r.url);

      try {
        const crawled = await crawlWebsite(r.url);
        if (crawled.score >= 5) {
          results.push({
            websiteUrl: r.url,
            companyName: crawled.companyName || r.title || null,
            email: crawled.email || null,
            phone: crawled.phone || null,
            address: crawled.address || null,
            contactUrl: crawled.contactUrl || null,
            score: crawled.score,
          });
        }
      } catch {
        // Skip failed crawls
      }
    }
  }

  return results;
}
