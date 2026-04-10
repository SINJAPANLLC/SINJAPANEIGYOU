import axios from "axios";
import * as cheerio from "cheerio";
import * as iconv from "iconv-lite";
import { logger } from "./logger";

const EXCLUDE_DOMAINS = [
  // Job boards
  "indeed.com", "recruit.co.jp", "doda.jp", "en-japan.com",
  "mynavi.jp", "rikunabi.com", "hellowork.mhlw.go.jp",
  "baitoru.com", "townwork.net", "an.co.jp", "type.jp",
  // Info / search portals
  "kakaku.com", "wikipedia.org", "yahoo.co.jp", "google.com", "bing.com",
  "duckduckgo.com", "livedoor.com", "excite.co.jp",
  // Company directories / aggregators (not actual company pages)
  "baseconnect.in", "salesnow.jp", "musubu.jp", "hnavi.co.jp",
  "yumekake.com", "biz.ne.jp", "j-net21.smrj.go.jp",
  "tokyosyoko.or.jp", "hatarako.net",
  // Social media / blogs
  "facebook.com", "twitter.com", "x.com", "linkedin.com",
  "instagram.com", "tiktok.com", "youtube.com",
  "note.com", "qiita.com", "zenn.dev", "ameblo.jp", "wantedly.com",
  // News / media
  "nikkei.com", "asahi.com", "yomiuri.co.jp", "mainichi.jp",
  "sankei.com", "nhk.or.jp", "jiji.com",
  // E-commerce
  "amazon.co.jp", "rakuten.co.jp", "yahoo-shopping.jp",
  "mercari.com", "stores.jp", "shopify.com",
  // Government / public
  "go.jp", "lg.jp", "ed.jp", "ac.jp",
  // Other spam
  "townpage.co.jp", "itp.ne.jp",
];

// Large company indicators - SMEs shouldn't have these
const LARGE_COMPANY_INDICATORS = [
  "東証プライム", "東証スタンダード", "東証グロース", "上場企業",
  "グループ会社", "子会社", "連結子会社",
  "従業員数 [0-9,]+ 名".replace("名", ""),
];

const CONTACT_PAGE_PATTERNS = [
  "/contact", "/inquiry", "/form", "/mail",
  "/お問い合わせ", "/toiawase", "/contact.html",
  "/contact.php", "/inquiry.html", "/form.html",
];

const COMPANY_PAGE_PATTERNS = [
  "/company", "/about", "/profile", "/overview",
  "/会社概要", "/kaisha", "/corporate", "/company.html",
  "/about.html", "/profile.html",
];

export function scoreUrl(url: string): number {
  let score = 0;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;

    if (parsed.hash.includes(":~:text=")) return -99;

    for (const ex of EXCLUDE_DOMAINS) {
      if (host.includes(ex)) return -99;
    }

    // Penalize content/blog/ranking pages
    const badPaths = ["/blog/", "/column/", "/news/", "/article/", "/posts/",
      "/note/", "/ranking", "/compare", "/guide/", "/media/"];
    for (const bp of badPaths) {
      if (path.includes(bp)) { score -= 6; break; }
    }

    // Penalize recruitment-focused hostnames
    if (host.includes("recruit") || host.includes("saiyou")) score -= 3;

    // Prefer Japanese corporate domains
    if (host.endsWith(".co.jp")) score += 4;
    else if (host.endsWith(".jp")) score += 2;

    // Favor company / contact pages
    for (const p of CONTACT_PAGE_PATTERNS) {
      if (path.toLowerCase().includes(p)) { score += 4; break; }
    }
    for (const p of COMPANY_PAGE_PATTERNS) {
      if (path.toLowerCase().includes(p)) { score += 3; break; }
    }

    // Root or shallow paths preferred
    if (path === "/" || path === "") score += 2;
    else if (path.split("/").length <= 3) score += 1;

  } catch {
    return 0;
  }
  return score;
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string> {
  const response = await axios.get(url, {
    timeout: timeoutMs,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
    maxRedirects: 4,
    responseType: "arraybuffer",
  });

  const contentType: string = response.headers["content-type"] || "";
  const ctMatch = contentType.match(/charset=([^\s;]+)/i);
  let encoding = ctMatch ? ctMatch[1].toLowerCase() : "utf-8";

  let html: string;
  if (encoding.includes("shift") || encoding.includes("sjis") || encoding === "x-sjis") {
    html = iconv.decode(Buffer.from(response.data), "Shift_JIS");
  } else if (encoding.includes("euc-jp") || encoding.includes("eucjp")) {
    html = iconv.decode(Buffer.from(response.data), "EUC-JP");
  } else {
    html = Buffer.from(response.data).toString("utf-8");
  }

  // Re-check meta charset
  const metaMatch = html.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i);
  if (metaMatch && !ctMatch) {
    const mc = metaMatch[1].toLowerCase();
    if (mc.includes("shift") || mc.includes("sjis")) {
      html = iconv.decode(Buffer.from(response.data), "Shift_JIS");
    } else if (mc.includes("euc-jp")) {
      html = iconv.decode(Buffer.from(response.data), "EUC-JP");
    }
  }

  return html;
}

function extractEmail(html: string, $: cheerio.CheerioAPI): string | null {
  // mailto links first
  let email: string | null = null;
  $("a[href^='mailto:']").each((_, el) => {
    if (email) return;
    const href = $(el).attr("href") || "";
    const e = href.replace("mailto:", "").split("?")[0].trim().toLowerCase();
    if (e && e.includes("@") && !e.includes("example") && !e.includes("noreply")) {
      email = e;
    }
  });
  if (email) return email;

  // Text extraction with a regex
  const bodyText = $("body").text();
  const emailPatterns = [
    /[\w.+-]+@[\w-]+\.(?:co\.jp|jp|com|net|org|biz)/gi,
    /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
  ];
  for (const pattern of emailPatterns) {
    const matches = bodyText.match(pattern);
    if (matches) {
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (!lower.includes("example") && !lower.includes("noreply") &&
            !lower.includes("webmaster") && !lower.includes("postmaster")) {
          return m;
        }
      }
    }
  }

  // Obfuscated emails (with spaces or [at])
  const obfMatch = bodyText.match(/[\w.+-]+ *[@＠\[at\]] *[\w.-]+ *\. *(?:co\.jp|jp|com|net)/i);
  if (obfMatch) {
    return obfMatch[0].replace(/\s+/g, "").replace(/＠/, "@").replace(/\[at\]/i, "@");
  }

  return null;
}

function extractPhone(html: string, $: cheerio.CheerioAPI): string | null {
  const text = $("body").text();
  const patterns = [
    /0\d{1,4}[-–]\d{1,4}[-–]\d{3,4}/,
    /0\d{9,10}/,
    /\+81[-–]?\d{1,4}[-–]?\d{1,4}[-–]?\d{3,4}/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function extractAddress($: cheerio.CheerioAPI): string | null {
  const text = $("body").text();
  // Japanese postal code pattern
  const postalMatch = text.match(/〒\s*\d{3}[-–]\d{4}[^\n]{5,60}/);
  if (postalMatch) return postalMatch[0].trim().slice(0, 80);
  // Address-like patterns (prefecture + city)
  const prefList = ["東京都", "大阪府", "神奈川県", "愛知県", "福岡県", "北海道",
    "埼玉県", "千葉県", "兵庫県", "静岡県", "茨城県", "広島県", "京都府",
    "宮城県", "新潟県", "長野県", "岐阜県", "群馬県", "栃木県", "岡山県"];
  for (const pref of prefList) {
    const idx = text.indexOf(pref);
    if (idx !== -1) {
      return text.slice(idx, idx + 60).split("\n")[0].trim();
    }
  }
  return null;
}

function extractCompanyName($: cheerio.CheerioAPI): string | null {
  const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (ogSiteName && ogSiteName.length > 3 && ogSiteName.length < 60) return ogSiteName;

  const pageTitle = $("title").text().trim();
  if (pageTitle) {
    const parts = pageTitle.split(/[|｜－\-–—・]/);
    const genericParts = ["会社概要", "企業情報", "会社情報", "会社案内", "お問い合わせ",
      "トップ", "HOME", "TOP", "採用情報", "アクセス", "CONTACT", "ホーム",
      "サービス", "事業内容"];
    const meaningful = parts.map(p => p.trim())
      .find(p => !genericParts.some(g => p.includes(g)) && p.length > 3 && p.length < 50);
    if (meaningful) return meaningful;
    const clean = parts[0].trim();
    if (clean.length > 3 && clean.length < 50) return clean;
  }
  return null;
}

function isSme($: cheerio.CheerioAPI): boolean {
  const bodyText = $("body").text();
  // Large company warning signs
  const largeSigns = [
    "東証プライム", "東証スタンダード", "東証グロース", "東証一部", "東証二部",
    "上場企業", "連結子会社",
  ];
  for (const sign of largeSigns) {
    if (bodyText.includes(sign)) return false;
  }
  // Employee count > 500 suggests large company
  const empMatch = bodyText.match(/従業員[数人]\s*[：:]\s*([0-9,]+)\s*名/);
  if (empMatch) {
    const count = parseInt(empMatch[1].replace(/,/g, ""), 10);
    if (count > 500) return false;
  }
  return true;
}

async function findContactLink(baseUrl: string, $: cheerio.CheerioAPI): Promise<string | null> {
  let contactLink: string | null = null;

  $("a").each((_, el) => {
    if (contactLink) return;
    const href = $(el).attr("href") || "";
    const text = $(el).text().toLowerCase();
    const hrefLower = href.toLowerCase();

    const isContact =
      CONTACT_PAGE_PATTERNS.some(p => hrefLower.includes(p)) ||
      text.includes("お問い合わせ") ||
      text.includes("問い合わせ") ||
      text.includes("contact");

    if (isContact && href && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      try {
        contactLink = new URL(href, baseUrl).href;
      } catch {
        if (href.startsWith("http")) contactLink = href;
      }
    }
  });
  return contactLink;
}

async function findCompanyLink(baseUrl: string, $: cheerio.CheerioAPI): Promise<string | null> {
  let companyLink: string | null = null;
  $("a").each((_, el) => {
    if (companyLink) return;
    const href = $(el).attr("href") || "";
    const hrefLower = href.toLowerCase();
    if (COMPANY_PAGE_PATTERNS.some(p => hrefLower.includes(p))) {
      try { companyLink = new URL(href, baseUrl).href; } catch { companyLink = href.startsWith("http") ? href : null; }
    }
  });
  return companyLink;
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

  let email: string | null = null;
  let phone: string | null = null;
  let companyName: string | null = null;
  let address: string | null = null;
  let contactUrl: string | null = null;
  let smePenalty = 0;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    email = extractEmail(html, $);
    phone = extractPhone(html, $);
    companyName = extractCompanyName($);
    address = extractAddress($);
    contactUrl = await findContactLink(url, $);

    // Check if SME
    if (!isSme($)) smePenalty = -10;

    // Deep crawl: try contact page for email if not found
    if (!email && contactUrl) {
      try {
        const contactHtml = await fetchHtml(contactUrl, 10000);
        const $c = cheerio.load(contactHtml);
        email = extractEmail(contactHtml, $c);
        if (!address) address = extractAddress($c);
      } catch { /* ignore contact crawl failure */ }
    }

    // Deep crawl: try company overview page for address/info
    if (!address || !companyName) {
      const companyLink = await findCompanyLink(url, $);
      if (companyLink && companyLink !== contactUrl) {
        try {
          const companyHtml = await fetchHtml(companyLink, 10000);
          const $co = cheerio.load(companyHtml);
          if (!email) email = extractEmail(companyHtml, $co);
          if (!address) address = extractAddress($co);
          if (!companyName) companyName = extractCompanyName($co);
        } catch { /* ignore */ }
      }
    }

    let bonus = 0;
    if (email) bonus += 5;
    if (phone) bonus += 2;
    if (address) bonus += 2;
    if (contactUrl) bonus += 2;

    return { email, phone, companyName, address, contactUrl, score: baseScore + bonus + smePenalty };

  } catch (err: any) {
    logger.warn({ url, err: err?.message?.slice(0, 80) }, "crawlWebsite failed");
    return { score: Math.max(0, baseScore) };
  }
}
