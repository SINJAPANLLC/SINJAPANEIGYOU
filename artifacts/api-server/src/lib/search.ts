import axios from "axios";
import { logger } from "./logger";
import { crawlWebsite, scoreUrl } from "./crawler";

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
}

export async function searchGoogle(query: string, count = 10): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) {
    logger.warn("GOOGLE_API_KEY or GOOGLE_SEARCH_ENGINE_ID not set, returning empty results");
    return [];
  }

  const results: SearchResult[] = [];
  const perPage = Math.min(count, 10);
  const pages = Math.ceil(count / 10);

  try {
    for (let page = 0; page < pages && results.length < count; page++) {
      const start = page * 10 + 1;
      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: { key: apiKey, cx, q: query, num: perPage, start },
        timeout: 10000,
      });

      const items = response.data?.items || [];
      for (const item of items) {
        if (results.length >= count) break;
        results.push({
          url: item.link,
          title: item.title,
          description: item.snippet,
        });
      }
    }
  } catch (err: any) {
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
    logger.error({ err: detail }, "Google search failed");
  }

  return results;
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

    const searchResults = await searchGoogle(query, 10);
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
