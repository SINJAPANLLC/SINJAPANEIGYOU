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
  // Company directories / aggregators
  "baseconnect.in", "salesnow.jp", "musubu.jp", "hnavi.co.jp",
  "yumekake.com", "biz.ne.jp", "j-net21.smrj.go.jp",
  "tokyosyoko.or.jp", "hatarako.net", "minkabu.jp", "ullet.com",
  "osiete.biz", "nikkei.com",
  // Social media / blogs
  "facebook.com", "twitter.com", "x.com", "linkedin.com",
  "instagram.com", "tiktok.com", "youtube.com",
  "note.com", "qiita.com", "zenn.dev", "ameblo.jp", "wantedly.com",
  // News / media
  "asahi.com", "yomiuri.co.jp", "mainichi.jp",
  "sankei.com", "nhk.or.jp", "jiji.com",
  // E-commerce
  "amazon.co.jp", "rakuten.co.jp", "yahoo-shopping.jp",
  "mercari.com", "stores.jp", "shopify.com",
  // Government / public
  "go.jp", "lg.jp", "ed.jp", "ac.jp",
  // Other spam
  "townpage.co.jp", "itp.ne.jp",
];

const CONTACT_PAGE_PATTERNS = [
  "/contact", "/inquiry", "/form", "/mail", "/toiawase",
  "/contact.html", "/contact.php", "/inquiry.html", "/form.html",
  "お問い合わせ", "contact", "問い合わせ",
];

const COMPANY_PAGE_PATTERNS = [
  "/company", "/about", "/profile", "/overview", "/kaisha", "/corporate",
  "/company.html", "/about.html", "/profile.html",
  "会社概要", "企業情報", "会社情報",
];

const ALL_PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
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

    const badPaths = ["/blog/", "/column/", "/news/", "/article/", "/posts/",
      "/note/", "/ranking", "/compare", "/guide/", "/media/"];
    for (const bp of badPaths) {
      if (path.includes(bp)) { score -= 6; break; }
    }

    if (host.includes("recruit") || host.includes("saiyou")) score -= 3;

    if (host.endsWith(".co.jp")) score += 4;
    else if (host.endsWith(".jp")) score += 2;

    for (const p of CONTACT_PAGE_PATTERNS) {
      if (path.toLowerCase().includes(p)) { score += 4; break; }
    }
    for (const p of COMPANY_PAGE_PATTERNS) {
      if (path.toLowerCase().includes(p)) { score += 3; break; }
    }

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
    maxRedirects: 5,
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

// Normalize full-width characters to ASCII
function normalizeFullWidth(text: string): string {
  return text
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/＠/g, "@")
    .replace(/．/g, ".")
    .replace(/－/g, "-")
    .replace(/‐/g, "-");
}

// 画像拡張子・ファイル名をメールアドレスに誤認しないようにバリデーション
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|avif|heic)$/i;
const BAD_TLD = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|avif|heic|css|js|ts|json|xml|zip|pdf|txt|html|htm|php|asp|aspx|cgi|woff|woff2|ttf|eot|mp4|mp3|mov|avi|exe|dmg)$/i;
const BLOCKED_WORDS = ["example", "noreply", "no-reply", "webmaster", "postmaster", "sentry", "placeholder", "domain", "yourdomain", "test", "admin@admin", "user@user"];

function isValidEmail(e: string): boolean {
  if (!e || !e.includes("@")) return false;
  const lower = e.toLowerCase();
  if (BLOCKED_WORDS.some(w => lower.includes(w))) return false;
  // ドメイン部分が画像ファイル名になっていないか
  const domain = lower.split("@")[1] || "";
  if (IMAGE_EXTENSIONS.test(domain)) return false;
  if (BAD_TLD.test(lower)) return false;
  // ドメインにドットが必要
  if (!domain.includes(".")) return false;
  // 最低限の形式チェック（ローカル部 + @ + ドメイン）
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lower)) return false;
  return true;
}

function extractEmail(html: string, $: cheerio.CheerioAPI): string | null {
  // 1) mailto links (highest priority)
  let email: string | null = null;
  $("a[href^='mailto:']").each((_, el) => {
    if (email) return;
    const href = $(el).attr("href") || "";
    const e = href.replace("mailto:", "").split("?")[0].trim().toLowerCase();
    if (e && isValidEmail(e)) {
      email = e;
    }
  });
  if (email) return email;

  // 2) JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    if (email) return;
    try {
      const json = JSON.parse($(el).html() || "{}");
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        const candidate = entry.email || entry.contactPoint?.email;
        if (candidate && typeof candidate === "string" && isValidEmail(candidate)) {
          email = candidate.toLowerCase();
          return;
        }
      }
    } catch { /* ignore */ }
  });
  if (email) return email;

  // 3) footer / address elements first (most reliable location)
  const prioritySelectors = ["footer", "address", "#footer", ".footer", "#contact", ".contact"];
  for (const sel of prioritySelectors) {
    if (email) break;
    const el = $(sel);
    if (!el.length) continue;

    // mailto within priority area
    el.find("a[href^='mailto:']").each((__, a) => {
      if (email) return;
      const href = $(a).attr("href") || "";
      const e = href.replace("mailto:", "").split("?")[0].trim().toLowerCase();
      if (e && isValidEmail(e)) {
        email = e;
      }
    });
    if (email) break;

    // text scan within priority area
    const areaText = normalizeFullWidth(el.text());
    const m = areaText.match(/[\w.+-]+@[\w-]+\.(?:co\.jp|jp|com|net|org|biz)/i);
    if (m) { email = m[0].toLowerCase(); break; }
  }
  if (email) return email;

  // 4) Full page text scan
  const bodyText = normalizeFullWidth($("body").text());
  const emailPatterns = [
    /[\w.+-]+@[\w-]+\.(?:co\.jp|jp|com|net|org|biz)/gi,
    /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
  ];
  for (const pattern of emailPatterns) {
    const matches = bodyText.match(pattern);
    if (matches) {
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (isValidEmail(lower)) return lower;
      }
    }
  }

  // 5) Obfuscated email patterns
  const obfPatterns = [
    /[\w.+-]+ *[@＠] *[\w.-]+ *\. *(?:co\.jp|jp|com|net|biz)/i,
    /[\w.+-]+\s*\[at\]\s*[\w.-]+\s*\.\s*(?:co\.jp|jp|com|net)/i,
    /[\w.+-]+\s*\(at\)\s*[\w.-]+\s*\.\s*(?:co\.jp|jp|com|net)/i,
    /[\w.+-]+\s*【at】\s*[\w.-]+/i,
    /[\w.+-]+\s*◎\s*[\w.-]+\s*\.\s*(?:co\.jp|jp|com|net)/i,
  ];
  for (const p of obfPatterns) {
    const m = bodyText.match(p);
    if (m) {
      return m[0]
        .replace(/\s+/g, "")
        .replace(/＠/g, "@")
        .replace(/\[at\]/i, "@")
        .replace(/\(at\)/i, "@")
        .replace(/【at】/i, "@")
        .replace(/◎/g, "@")
        .toLowerCase();
    }
  }

  return null;
}

function extractPhone(html: string, $: cheerio.CheerioAPI): string | null {
  // tel: links first
  let phone: string | null = null;
  $("a[href^='tel:']").each((_, el) => {
    if (phone) return;
    const href = $(el).attr("href") || "";
    phone = href.replace("tel:", "").trim();
  });
  if (phone) return phone;

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    if (phone) return;
    try {
      const json = JSON.parse($(el).html() || "{}");
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        const tel = entry.telephone || entry.contactPoint?.telephone;
        if (tel && typeof tel === "string") { phone = tel; return; }
      }
    } catch { /* ignore */ }
  });
  if (phone) return phone;

  const text = normalizeFullWidth($("body").text());
  const patterns = [
    /0\d{1,4}[-–\-]\d{1,4}[-–\-]\d{3,4}/,
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
  // 1) JSON-LD structured data
  let address: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (address) return;
    try {
      const json = JSON.parse($(el).html() || "{}");
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        const addr = entry.address;
        if (addr) {
          if (typeof addr === "string") { address = addr; return; }
          if (typeof addr === "object") {
            const parts = [addr.addressRegion, addr.addressLocality, addr.streetAddress]
              .filter(Boolean).join(" ");
            if (parts) { address = parts; return; }
          }
        }
      }
    } catch { /* ignore */ }
  });
  if (address) return address;

  // 2) <address> element
  const addrEl = $("address").first().text().trim();
  if (addrEl && addrEl.length > 5) return addrEl.slice(0, 100);

  const text = $("body").text();

  // 3) Postal code pattern
  const postalMatch = text.match(/〒\s*\d{3}[-–]\d{4}[^\n]{5,60}/);
  if (postalMatch) return postalMatch[0].trim().slice(0, 100);

  // 4) Prefecture-based extraction (all 47 prefectures)
  for (const pref of ALL_PREFECTURES) {
    const idx = text.indexOf(pref);
    if (idx !== -1) {
      return text.slice(idx, idx + 60).split("\n")[0].trim();
    }
  }
  return null;
}

function extractCompanyName($: cheerio.CheerioAPI): string | null {
  // 1) JSON-LD organization name
  let name: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (name) return;
    try {
      const json = JSON.parse($(el).html() || "{}");
      const entries = Array.isArray(json) ? json : [json];
      for (const entry of entries) {
        if (["Organization", "LocalBusiness", "Corporation", "Store"].includes(entry["@type"])) {
          if (entry.name && typeof entry.name === "string" && entry.name.length > 2) {
            name = entry.name;
            return;
          }
        }
      }
    } catch { /* ignore */ }
  });
  if (name) return name;

  // 2) og:site_name
  const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (ogSiteName && ogSiteName.length > 2 && ogSiteName.length < 60) return ogSiteName;

  // 3) Body text: look for 株式会社/有限会社/合同会社 patterns
  const bodyText = $("body").text();
  const corpMatch = bodyText.match(/(株式会社|有限会社|合同会社|一般社団法人|一般財団法人)[^\s　\n]{1,20}/);
  if (corpMatch) return corpMatch[0].trim();
  const corpMatchPost = bodyText.match(/[^\s　\n]{1,20}(株式会社|有限会社|合同会社)/);
  if (corpMatchPost) return corpMatchPost[0].trim();

  // 4) Page title
  const pageTitle = $("title").text().trim();
  if (pageTitle) {
    const parts = pageTitle.split(/[|｜－\-–—・]/);
    const genericParts = ["会社概要", "企業情報", "会社情報", "会社案内", "お問い合わせ",
      "トップ", "HOME", "TOP", "採用情報", "アクセス", "CONTACT", "ホーム",
      "サービス", "事業内容"];
    const meaningful = parts.map(p => p.trim())
      .find(p => !genericParts.some(g => p.includes(g)) && p.length > 2 && p.length < 50);
    if (meaningful) return meaningful;
    const clean = parts[0].trim();
    if (clean.length > 2 && clean.length < 50) return clean;
  }
  return null;
}

function isSme($: cheerio.CheerioAPI): boolean {
  const bodyText = $("body").text();
  const largeSigns = [
    "東証プライム", "東証スタンダード", "東証グロース", "東証一部", "東証二部",
    "上場企業", "連結子会社",
  ];
  for (const sign of largeSigns) {
    if (bodyText.includes(sign)) return false;
  }
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
    const text = $(el).text();
    const hrefLower = href.toLowerCase();

    const isContact =
      CONTACT_PAGE_PATTERNS.some(p => hrefLower.includes(p.toLowerCase())) ||
      text.includes("お問い合わせ") ||
      text.includes("問い合わせ") ||
      text.includes("contact") ||
      text.includes("メールする") ||
      text.includes("メールで問い合わせ");

    if (isContact && href && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("#")) {
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
    const text = $(el).text();
    const hrefLower = href.toLowerCase();
    const isCompany =
      COMPANY_PAGE_PATTERNS.some(p => hrefLower.includes(p.toLowerCase())) ||
      text.includes("会社概要") ||
      text.includes("企業情報") ||
      text.includes("会社情報");
    if (isCompany && href && !href.startsWith("#")) {
      try { companyLink = new URL(href, baseUrl).href; } catch { companyLink = href.startsWith("http") ? href : null; }
    }
  });
  return companyLink;
}

// Try sitemap.xml to discover contact/company pages
async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
  const discovered: string[] = [];
  try {
    const origin = new URL(baseUrl).origin;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const response = await axios.get(sitemapUrl, {
      timeout: 6000,
      headers: { "User-Agent": "Mozilla/5.0" },
      responseType: "text",
    });
    const $ = cheerio.load(response.data, { xmlMode: true });
    $("loc").each((_, el) => {
      const loc = $(el).text().trim();
      const locLower = loc.toLowerCase();
      if (
        CONTACT_PAGE_PATTERNS.some(p => locLower.includes(p.toLowerCase())) ||
        COMPANY_PAGE_PATTERNS.some(p => locLower.includes(p.toLowerCase()))
      ) {
        discovered.push(loc);
      }
    });
  } catch { /* sitemap not found or parse error - ignore */ }
  return discovered;
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

    if (!isSme($)) smePenalty = -10;

    // Deep crawl layer 1: contact page
    if (!email && contactUrl) {
      try {
        const contactHtml = await fetchHtml(contactUrl, 10000);
        const $c = cheerio.load(contactHtml);
        email = extractEmail(contactHtml, $c);
        if (!address) address = extractAddress($c);
        if (!phone) phone = extractPhone(contactHtml, $c);
      } catch { /* ignore */ }
    }

    // Deep crawl layer 2: company overview page
    if (!address || !companyName || !email) {
      const companyLink = await findCompanyLink(url, $);
      if (companyLink && companyLink !== contactUrl) {
        try {
          const companyHtml = await fetchHtml(companyLink, 10000);
          const $co = cheerio.load(companyHtml);
          if (!email) email = extractEmail(companyHtml, $co);
          if (!address) address = extractAddress($co);
          if (!companyName) companyName = extractCompanyName($co);
          if (!phone) phone = extractPhone(companyHtml, $co);
        } catch { /* ignore */ }
      }
    }

    // Deep crawl layer 3: sitemap discovery (only if still missing email)
    if (!email) {
      const sitemapPages = await discoverFromSitemap(url);
      for (const pageUrl of sitemapPages.slice(0, 3)) {
        if (email) break;
        if (pageUrl === contactUrl) continue;
        try {
          const smHtml = await fetchHtml(pageUrl, 8000);
          const $sm = cheerio.load(smHtml);
          if (!email) email = extractEmail(smHtml, $sm);
          if (!address) address = extractAddress($sm);
          if (!phone) phone = extractPhone(smHtml, $sm);
        } catch { /* ignore */ }
      }
    }

    let bonus = 0;
    if (email) bonus += 6;
    if (phone) bonus += 3;
    if (address) bonus += 2;
    if (contactUrl) bonus += 2;
    if (companyName) bonus += 1;

    return { email, phone, companyName, address, contactUrl, score: baseScore + bonus + smePenalty };

  } catch (err: any) {
    logger.warn({ url, err: err?.message?.slice(0, 80) }, "crawlWebsite failed");
    return { score: Math.max(0, baseScore) };
  }
}
