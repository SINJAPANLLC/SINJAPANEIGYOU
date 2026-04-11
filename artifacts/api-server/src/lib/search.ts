import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger";
import { crawlWebsite, scoreUrl } from "./crawler";

export type LeadResult = {
  websiteUrl: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactUrl?: string | null;
  score: number;
};

interface SearchResult {
  url: string;
  title?: string;
  snippet?: string;
}

// =============================================
//  ペルソナ別クエリ定義
//  persona は cron config の "persona" フィールドで指定
//  未指定の場合は keyword から自動推定
// =============================================
export type PersonaType =
  | "lightfreight_shipper"    // 軽貨物案件獲得（荷主を探す）
  | "lightfreight_carrier"    // 軽貨物協力会社獲得（運送業者を探す）
  | "freight_shipper"         // 一般貨物案件獲得（荷主を探す）
  | "freight_carrier"         // 一般貨物協力会社獲得（運送業者を探す）
  | "staffing_client"         // 人材案件獲得（採用企業を探す）
  | "staffing_agency"         // 人材協力会社獲得（派遣会社を探す）
  | "default";

export function detectPersona(keyword: string, businessName?: string): PersonaType {
  const kw = keyword + (businessName || "");
  if (kw.includes("軽貨物")) {
    return kw.includes("協力") ? "lightfreight_carrier" : "lightfreight_shipper";
  }
  if (kw.includes("一般貨物")) {
    return kw.includes("協力") ? "freight_carrier" : "freight_shipper";
  }
  if (kw.includes("人材")) {
    return kw.includes("協力") ? "staffing_agency" : "staffing_client";
  }
  return "default";
}

function buildPersonaQueries(keyword: string, location: string | null, persona: PersonaType): string[] {
  const loc = location ? ` ${location}` : "";

  switch (persona) {
    case "lightfreight_shipper":
      // 小口・ラストワンマイル配送を発注したい荷主企業
      return [
        `小口配送${loc} 発注 荷主 お問い合わせ 会社`,
        `ラストワンマイル${loc} 配送委託 問い合わせ 株式会社`,
        `宅配 軽貨物 外注${loc} 会社概要 メール`,
        `ネット通販 物流 外注${loc} 中小企業 連絡先`,
        `配送業者 募集${loc} 荷主 site:co.jp`,
        `軽貨物 業者 探している${loc} 会社 問い合わせ`,
        `個建て 配送 発注${loc} 会社概要`,
        `EC 物流 配送 外注${loc} 中小企業 メール`,
      ];

    case "lightfreight_carrier":
      // 軽貨物運送の協力会社・サブコン
      return [
        `軽貨物運送${loc} 会社概要 お問い合わせ`,
        `軽トラック 配送${loc} 株式会社 メールアドレス`,
        `宅配 ドライバー 業者${loc} 合同会社 問い合わせ`,
        `軽貨物 サブコン 協力${loc} 会社 連絡先`,
        `配送会社 軽貨物${loc} site:co.jp 会社概要`,
        `軽貨物 フリーランス 法人${loc} メール`,
        `軽配送 運送会社${loc} 中小企業 お問い合わせ`,
        `ヤマト 佐川 個人事業${loc} 配送 会社`,
      ];

    case "freight_shipper":
      // 一般貨物・トラック輸送を発注したい荷主
      return [
        `一般貨物 輸送 発注${loc} 荷主 お問い合わせ`,
        `トラック輸送 外注${loc} 株式会社 会社概要`,
        `物流 運送 委託${loc} 中小企業 連絡先`,
        `製造業 運送 外注${loc} 荷主 メール`,
        `卸売 配送 外注${loc} 会社 問い合わせ`,
        `3PL 物流 発注${loc} site:co.jp`,
        `陸送 輸送 発注${loc} 会社 問い合わせ先`,
        `工場 物流 外注${loc} 中小 会社概要`,
      ];

    case "freight_carrier":
      // 一般貨物運送会社・協力会社
      return [
        `一般貨物 運送会社${loc} 会社概要 お問い合わせ`,
        `トラック運送${loc} 株式会社 メールアドレス`,
        `運送業者${loc} 合同会社 問い合わせ 連絡先`,
        `物流会社 運送${loc} site:co.jp 会社概要`,
        `陸運 運送${loc} 中小企業 メール`,
        `チャーター 貸切 輸送${loc} 会社 問い合わせ`,
        `トラック 輸送会社${loc} 協力 問い合わせ`,
        `ドライバー 法人 運送${loc} 会社概要`,
      ];

    case "staffing_client":
      // 人材を必要としている企業（採用・派遣利用企業）
      return [
        `人材 採用 お問い合わせ${loc} 株式会社`,
        `人材派遣 導入${loc} 中小企業 会社概要`,
        `IT人材 採用${loc} 会社 メールアドレス`,
        `エンジニア 採用 外注${loc} 会社 問い合わせ`,
        `IT企業 採用担当${loc} site:co.jp`,
        `業務委託 フリーランス 採用${loc} 会社 連絡先`,
        `システム開発 発注${loc} 中小企業 お問い合わせ`,
        `ベンチャー 人材確保${loc} 会社概要 メール`,
      ];

    case "staffing_agency":
      // 人材派遣・紹介会社・協力会社
      return [
        `人材派遣会社${loc} 会社概要 お問い合わせ`,
        `人材紹介${loc} 株式会社 メールアドレス`,
        `派遣会社${loc} 合同会社 問い合わせ`,
        `人材会社${loc} site:co.jp 会社概要`,
        `フリーランス エージェント${loc} 会社 連絡先`,
        `ITエンジニア 紹介${loc} 会社 メール`,
        `業務委託 エージェント${loc} 中小企業 問い合わせ`,
        `エンジニア 派遣${loc} 会社概要 お問い合わせ`,
      ];

    default:
      return [
        `${keyword}${loc} 中小企業 お問い合わせ メール`,
        `${keyword}${loc} 株式会社 会社概要 連絡先`,
        `${keyword}${loc} 有限会社 合同会社 問い合わせ`,
        `${keyword}${loc} 企業 メールアドレス contact`,
        `${keyword}${loc} 案件 会社 email`,
        `${keyword}${loc} site:co.jp 会社概要`,
        `${keyword}${loc} 中小 企業 電話番号`,
        `${keyword}${loc} 業者 会社 問い合わせ先`,
      ];
  }
}

const SEARCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function searchYahooJapan(
  query: string,
  count = 20,
  page = 1,
): Promise<SearchResult[]> {
  logger.info({ query, count, page }, "searchYahooJapan start");
  try {
    await sleep(600 + Math.random() * 800);
    const b = (page - 1) * 20 + 1;
    const url = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}&n=20&b=${b}`;

    const response = await axios.get(url, { headers: SEARCH_HEADERS, timeout: 18000 });
    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    $(".sw-Card a").each((_, el): false | void => {
      if (results.length >= count) return false;
      const href = $(el).attr("href") || "";
      const h3Title = $(el).find("h3").text().trim();
      const fullText = $(el).text().trim();
      const title = h3Title || fullText.split("\n")[0].trim();
      const snippet = $(el).find("p, .sw-Card__abstractText").text().trim();

      if (href.startsWith("http") && !href.includes("yahoo") && !href.includes("google") && title.length > 3 && !seen.has(href)) {
        seen.add(href);
        results.push({ url: href, title, snippet });
      }
      return undefined;
    });

    if (results.length < 3) {
      $("a[href^='http']").each((_, el): false | void => {
        if (results.length >= count) return false;
        const href = $(el).attr("href") || "";
        const title = $(el).text().trim().split("\n")[0].trim();
        if (!href.includes("yahoo") && !href.includes("google") && !href.includes("bing.com") && title.length > 5 && !seen.has(href)) {
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

async function crawlBatch(
  items: SearchResult[],
  seen: Set<string>,
  maxResults: number,
  concurrency = 4,
): Promise<LeadResult[]> {
  const results: LeadResult[] = [];
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

// Gather search results across queries and pages
async function gatherSearchResults(
  queries: string[],
  seen: Set<string>,
  targetCount: number,
  maxPages = 2,
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  for (const query of queries) {
    if (allResults.length >= targetCount) break;

    for (let page = 1; page <= maxPages; page++) {
      if (allResults.length >= targetCount) break;
      try {
        const res = await searchYahooJapan(query, 20, page);
        let added = 0;
        for (const r of res) {
          if (scoreUrl(r.url) >= 0 && !seen.has(r.url)) {
            allResults.push(r);
            seen.add(r.url);
            added++;
          }
        }
        logger.info({ query, page, added, total: allResults.length }, "Search query complete");
        await sleep(500 + Math.random() * 400);
      } catch (err: any) {
        logger.warn({ query, page, err: err?.message }, "Search query failed");
      }
    }
  }

  return allResults;
}

/**
 * Search and crawl leads, keeping going until targetEmailCount leads WITH emails are found.
 * maxRounds: max crawl rounds to prevent infinite loop (default 4)
 */
export async function searchAndCrawlLeads(
  keyword: string,
  location: string | null | undefined,
  maxResults: number,
  persona?: PersonaType | string,
  targetEmailCount?: number,
): Promise<LeadResult[]> {
  const loc = location ?? null;

  // Determine persona
  const resolvedPersona: PersonaType = (persona as PersonaType) || detectPersona(keyword);
  const emailTarget = targetEmailCount ?? maxResults;

  logger.info({ keyword, loc, maxResults, persona: resolvedPersona, emailTarget }, "searchAndCrawlLeads start");

  const queries = buildPersonaQueries(keyword, loc, resolvedPersona);
  const globalSeen = new Set<string>();
  const allLeads: LeadResult[] = [];
  let round = 0;
  const maxRounds = 4;

  while (round < maxRounds) {
    round++;
    const emailsFound = allLeads.filter(l => l.email).length;

    if (emailsFound >= emailTarget) {
      logger.info({ round, emailsFound, emailTarget }, "Email target reached, stopping");
      break;
    }

    const needed = emailTarget - emailsFound;
    // Gather more candidates than needed (×6 buffer since many sites have no email)
    const candidateTarget = needed * 6;

    const searchSeen = new Set<string>([...globalSeen]);
    const candidates = await gatherSearchResults(queries, searchSeen, candidateTarget, round <= 2 ? 4 : 6);

    if (candidates.length === 0) {
      logger.info({ round }, "No more candidates, stopping early");
      break;
    }

    // Update globalSeen with newly discovered URLs
    for (const c of candidates) globalSeen.add(c.url);

    const crawlSeen = new Set<string>();
    const batchLeads = await crawlBatch(candidates, crawlSeen, candidates.length, 4);

    for (const lead of batchLeads) {
      // Avoid duplicates from previous rounds
      if (!allLeads.some(l => l.websiteUrl === lead.websiteUrl)) {
        allLeads.push(lead);
      }
    }

    const emailsNow = allLeads.filter(l => l.email).length;
    logger.info({ round, totalLeads: allLeads.length, emailsNow, emailTarget }, "Round complete");
  }

  // Return up to maxResults, prioritize leads with email
  const withEmail = allLeads.filter(l => l.email);
  const withoutEmail = allLeads.filter(l => !l.email);
  const combined = [...withEmail, ...withoutEmail].slice(0, maxResults);

  logger.info({
    total: combined.length,
    withEmail: withEmail.length,
    withoutEmail: withoutEmail.length,
  }, "searchAndCrawlLeads done");

  return combined;
}
