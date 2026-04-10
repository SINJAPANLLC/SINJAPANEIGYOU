import axios from "axios";
import * as cheerio from "cheerio";
import * as iconv from "iconv-lite";
import { logger } from "./logger";

const EXCLUDE_DOMAINS = [
  // Job boards
  "indeed.com", "recruit.co.jp", "doda.jp", "en-japan.com",
  "mynavi.jp", "rikunabi.com", "hellowork.mhlw.go.jp", "hurex.jp",
  // Info/search portals
  "kakaku.com", "wikipedia.org", "livedoor.com", "yahoo.co.jp", "google.com",
  // Company directories / aggregators
  "baseconnect.in", "salesnow.jp", "musubu.jp", "hnavi.co.jp",
  "my-vision.co.jp", "movin.co.jp", "jmsc.co.jp",
  // Social media
  "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com",
  // Blogs / media
  "note.com", "tech-camp.in", "qiita.com", "zenn.dev", "ameblo.jp",
  "nikkei.com", "chunichi.co.jp", "asahi.com", "yomiuri.co.jp",
  // Other directories
  "townpage.co.jp", "itp.ne.jp", "jcb.co.jp",
];

export function scoreUrl(url: string): number {
  let score = 0;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    // Exclude URLs with text fragments (article highlight links, not company pages)
    if (parsed.hash.includes(":~:text=")) return -99;

    for (const ex of EXCLUDE_DOMAINS) {
      if (host.includes(ex)) return -99;
    }

    // Penalize known content/blog patterns in path
    const path = parsed.pathname;
    if (path.includes("/blog/") || path.includes("/column/") || path.includes("/news/") ||
        path.includes("/article/") || path.includes("/posts/") || path.includes("/note/") ||
        path.includes("/column/") || path.includes("/ranking") || path.includes("/compare")) {
      score -= 5;
    }

    if (host.includes("recruit") || host.includes("job") || host.includes("work")) {
      score -= 5;
    }
    if (host.endsWith(".co.jp") || host.endsWith(".jp")) score += 2;
    if (!host.includes("www.") && host.split(".").length >= 2) score += 1;

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
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SalesBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 3,
      responseType: "arraybuffer",
    });

    // Detect encoding from Content-Type or meta charset
    const contentType: string = response.headers["content-type"] || "";
    let encoding = "utf-8";
    const ctMatch = contentType.match(/charset=([^\s;]+)/i);
    if (ctMatch) encoding = ctMatch[1].toLowerCase();

    // Convert buffer to string with detected encoding
    let html: string;
    if (encoding.includes("shift") || encoding.includes("sjis") || encoding === "x-sjis") {
      html = iconv.decode(Buffer.from(response.data), "Shift_JIS");
    } else if (encoding.includes("euc-jp") || encoding.includes("eucjp")) {
      html = iconv.decode(Buffer.from(response.data), "EUC-JP");
    } else {
      html = Buffer.from(response.data).toString("utf-8");
    }

    // Also check meta charset if still unknown
    const charsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i);
    if (charsetMatch && (encoding === "utf-8" || !ctMatch)) {
      const metaCharset = charsetMatch[1].toLowerCase();
      if (metaCharset.includes("shift") || metaCharset.includes("sjis")) {
        html = iconv.decode(Buffer.from(response.data), "Shift_JIS");
      } else if (metaCharset.includes("euc-jp")) {
        html = iconv.decode(Buffer.from(response.data), "EUC-JP");
      }
    }

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

    // Extract company name - prefer og:site_name, then title minus generic suffixes
    const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
    const pageTitle = $("title").text().trim();
    if (ogSiteName && ogSiteName.length > 3) {
      companyName = ogSiteName;
    } else if (pageTitle) {
      // Split on common separators and take the most meaningful part
      const parts = pageTitle.split(/[|｜－\-–—]/);
      // Filter out generic parts
      const genericParts = ["会社概要", "企業情報", "会社情報", "会社案内", "お問い合わせ", "トップ", "HOME", "TOP", "採用情報", "アクセス"];
      const meaningful = parts.map(p => p.trim()).find(p => !genericParts.includes(p) && p.length > 3);
      companyName = meaningful || parts[parts.length - 1].trim() || parts[0].trim();
    }

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
