import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger";
import { crawlWebsite, scoreUrl } from "./crawler";

interface SearchResult {
  url: string;
  title?: string;
  snippet?: string;
}

const SEARCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Yahoo Japan scraping - support multiple pages
export async function searchYahooJapan(
  query: string,
  count = 20,
  page = 1,
): Promise<SearchResult[]> {
  logger.info({ query, count, page }, "searchYahooJapan start");
  try {
    await sleep(600 + Math.random() * 800);

    // Yahoo Japan paging: b=1,21,41...
    const b = (page - 1) * 20 + 1;
    const url = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}&n=20&b=${b}`;

    const response = await axios.get(url, {
      headers: SEARCH_HEADERS,
      timeout: 18000,
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Primary: .sw-Card anchor links
    $(".sw-Card a").each((_, el): false | void => {
      if (results.length >= count) return false;
      const href = $(el).attr("href") || "";
      const h3Title = $(el).find("h3").text().trim();
      const fullText = $(el).text().trim();
      const title = h3Title || fullText.split("\n")[0].trim();
      const snippet = $(el).find("p, .sw-Card__abstractText").text().trim();

      if (
        href.startsWith("http") &&
        !href.includes("yahoo") &&
        !href.includes("google") &&
        title.length > 3 &&
        !seen.has(href)
      ) {
        seen.add(href);
        results.push({ url: href, title, snippet });
      }
      return undefined;
    });

    // Fallback: broader anchor scan
    if (results.length < 3) {
      $("a[href^='http']").each((_, el): false | void => {
        if (results.length >= count) return false;
        const href = $(el).attr("href") || "";
        const title = $(el).text().trim().split("\n")[0].trim();
        if (
          !href.includes("yahoo") &&
          !href.includes("google") &&
          !href.includes("bing.com") &&
          title.length > 5 &&
          !seen.has(href)
        ) {
          seen.add(href);
          results.push({ url: href, title });
        }
        return undefined;
      });
    }

    logger.info({ count: results.length, query, page }, "searchYahooJapan done");
    return results;
  } catch (err: any) {
    logger.error({ err: err?.message, query, page }, "Yahoo Japan search failed");
    return [];
  }
}

// Build SME-focused query variations
function buildSmeQueries(keyword: string, location: string | null): string[] {
  const loc = location ? ` ${location}` : "";
  return [
    `${keyword}${loc} 中小企業 お問い合わせ メール`,
    `${keyword}${loc} 株式会社 会社概要 連絡先`,
    `${keyword}${loc} 有限会社 合同会社 問い合わせ`,
    `${keyword}${loc} 企業 メールアドレス contact`,
    `${keyword}${loc} 荷主 案件 会社 email`,
    `${keyword}${loc} site:co.jp 会社概要`,
    `${keyword}${loc} 中小 企業 電話番号 会社`,
    `${keyword}${loc} 業者 会社 問い合わせ先`,
  ];
}

// Retry wrapper
async function crawlWithRetry(url: string, retries = 2): Promise<Awaited<ReturnType<typeof crawlWebsite>>> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await crawlWebsite(url);
    } catch (err: any) {
      if (i < retries) {
        await sleep(1500 * (i + 1));
        logger.warn({ url, attempt: i + 1 }, "Retrying crawl");
      }
    }
  }
  return { score: Math.max(0, scoreUrl(url)) };
}

// Parallel crawl with concurrency cap
async function crawlBatch(
  items: SearchResult[],
  seen: Set<string>,
  maxResults: number,
  concurrency = 4,
): Promise<Array<{
  websiteUrl: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactUrl?: string | null;
  score: number;
}>> {
  type Lead = {
    websiteUrl: string;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    contactUrl?: string | null;
    score: number;
  };

  const results: Lead[] = [];
  const queue = [...items];

  async function worker() {
    while (queue.length > 0 && results.length < maxResults) {
      const item = queue.shift();
      if (!item) break;

      const urlScore = scoreUrl(item.url);
      if (urlScore < 0 || seen.has(item.url)) continue;
      seen.add(item.url);

      await sleep(300 + Math.random() * 400);

      const crawled = await crawlWithRetry(item.url);

      if (results.length < maxResults) {
        results.push({
          websiteUrl: item.url,
          companyName: crawled.companyName || item.title || null,
          email: crawled.email || null,
          phone: crawled.phone || null,
          address: crawled.address || null,
          contactUrl: crawled.contactUrl || null,
          score: Math.max(crawled.score, urlScore + 3),
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.allSettled(workers);
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
  const queries = buildSmeQueries(keyword, location ?? null);
  const seen = new Set<string>();
  const allSearchResults: SearchResult[] = [];

  // Collect from all query variations, up to 2 pages each
  for (const query of queries) {
    if (allSearchResults.length >= maxResults * 8) break;

    // Page 1
    try {
      const res = await searchYahooJapan(query, 20, 1);
      let added = 0;
      for (const r of res) {
        if (scoreUrl(r.url) >= 0 && !seen.has(r.url)) {
          allSearchResults.push(r);
          seen.add(r.url);
          added++;
        }
      }
      logger.info({ query, page: 1, added, total: allSearchResults.length }, "Query p1 complete");
      await sleep(500 + Math.random() * 400);
    } catch (err: any) {
      logger.warn({ query, err: err?.message }, "Search query p1 failed");
    }

    // Page 2 (only if still need more candidates)
    if (allSearchResults.length < maxResults * 5) {
      try {
        const res2 = await searchYahooJapan(query, 20, 2);
        let added2 = 0;
        for (const r of res2) {
          if (scoreUrl(r.url) >= 0 && !seen.has(r.url)) {
            allSearchResults.push(r);
            seen.add(r.url);
            added2++;
          }
        }
        logger.info({ query, page: 2, added: added2, total: allSearchResults.length }, "Query p2 complete");
        await sleep(400 + Math.random() * 400);
      } catch (err: any) {
        logger.warn({ query, err: err?.message }, "Search query p2 failed");
      }
    }
  }

  logger.info({ total: allSearchResults.length, maxResults }, "Starting parallel crawl");

  seen.clear();
  return crawlBatch(allSearchResults, seen, maxResults, 4);
}
