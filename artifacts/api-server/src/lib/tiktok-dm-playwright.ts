import { chromium, type Browser, type BrowserContext } from "playwright";
import { logger } from "./logger";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randomSleep(minMs: number, maxMs: number) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

export interface DmCampaignOptions {
  minFollowers?: number;
  genderFilter?: "any" | "female" | "male";
}

interface ProfileInfo {
  followers: number;
  bio: string;
  displayName: string;
}

// 女性判定キーワード（日本語・英語）
const FEMALE_KEYWORDS = [
  "女性", "女の子", "ガール", "ママ", "主婦", "OL", "姫", "妻", "娘",
  "彼女", "レディ", "girl", "woman", "female", "she/her", "she ", "her ",
  "💄", "👗", "💅", "👑", "🌸", "🎀", "💕", "💖", "💗", "🌺",
];
const MALE_KEYWORDS = [
  "男性", "男の子", "パパ", "父", "息子", "彼氏", "夫",
  "boy", "man", "male", "he/him", "he ", "his ",
];
// 日本語の女性名の語尾（こ、み、な、え、か、り、ゆ、の、さ、あ など）
const FEMALE_NAME_ENDINGS = ["こ", "み", "な", "え", "か", "り", "ゆ", "の", "さ", "あ", "ほ", "ね"];

function detectGender(displayName: string, bio: string): "female" | "male" | "unknown" {
  const text = `${displayName} ${bio}`.toLowerCase();

  let femaleScore = 0;
  let maleScore = 0;

  for (const kw of FEMALE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) femaleScore += 2;
  }
  for (const kw of MALE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) maleScore += 2;
  }

  // 日本語名の語尾チェック（ひらがなで終わる名前）
  const nameOnly = displayName.trim();
  if (nameOnly.length > 0) {
    const lastChar = nameOnly[nameOnly.length - 1];
    if (FEMALE_NAME_ENDINGS.includes(lastChar)) femaleScore += 1;
  }

  if (femaleScore > maleScore && femaleScore >= 1) return "female";
  if (maleScore > femaleScore && maleScore >= 2) return "male";
  return "unknown";
}

function parseFollowers(text: string): number {
  if (!text) return 0;
  text = text.trim().replace(/,/g, "");
  // 万 = 10,000  K = 1,000  M = 1,000,000
  const manMatch = text.match(/([\d.]+)\s*万/);
  if (manMatch) return Math.floor(parseFloat(manMatch[1]) * 10000);
  const kMatch = text.match(/([\d.]+)\s*[Kk]/);
  if (kMatch) return Math.floor(parseFloat(kMatch[1]) * 1000);
  const mMatch = text.match(/([\d.]+)\s*[Mm]/);
  if (mMatch) return Math.floor(parseFloat(mMatch[1]) * 1000000);
  const numMatch = text.match(/[\d.]+/);
  if (numMatch) return Math.floor(parseFloat(numMatch[0]));
  return 0;
}

async function createBrowserContext(sessionCookie: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const proxyUrl = process.env.TIKTOK_PROXY;
  const browserOpts: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-dev-shm-usage",
    ],
  };
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    browserOpts.proxy = {
      server: `${u.protocol}//${u.host}`,
      username: u.username || undefined,
      password: u.password || undefined,
    };
    logger.info({ proxyHost: u.host }, "tiktok: using proxy");
  }
  const browser = await chromium.launch(browserOpts);

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  await context.addCookies([
    { name: "sessionid", value: sessionCookie, domain: ".tiktok.com", path: "/", httpOnly: true, secure: true, sameSite: "None" },
    { name: "sessionid_ss", value: sessionCookie, domain: ".tiktok.com", path: "/", httpOnly: true, secure: true, sameSite: "None" },
    { name: "ttwid", value: "1", domain: ".tiktok.com", path: "/" },
  ]);

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    (window as any).chrome = { runtime: {} };
  });

  return { browser, context };
}

async function scrapeProfileInfo(page: import("playwright").Page): Promise<ProfileInfo> {
  await randomSleep(2000, 3500);
  try {
    // フォロワー数
    const followerSelectors = [
      '[data-e2e="followers-count"]',
      '[data-e2e="followers_count"]',
      '[title*="フォロワー"]',
      '[class*="followers"] strong',
      '[class*="Followers"] strong',
    ];
    let followers = 0;
    for (const sel of followerSelectors) {
      const el = await page.$(sel);
      if (el) {
        const txt = await el.textContent() || "";
        followers = parseFollowers(txt);
        if (followers > 0) break;
      }
    }

    // 自己紹介文
    const bioSelectors = [
      '[data-e2e="user-bio"]',
      '[class*="UserBio"]',
      '[class*="user-bio"]',
      '[class*="bio"]',
    ];
    let bio = "";
    for (const sel of bioSelectors) {
      const el = await page.$(sel);
      if (el) { bio = (await el.textContent()) || ""; break; }
    }

    // 表示名
    const nameSelectors = [
      '[data-e2e="user-title"]',
      'h1[class*="title"]',
      'h2[class*="title"]',
    ];
    let displayName = "";
    for (const sel of nameSelectors) {
      const el = await page.$(sel);
      if (el) { displayName = (await el.textContent()) || ""; break; }
    }

    return { followers, bio: bio.trim(), displayName: displayName.trim() };
  } catch {
    return { followers: 0, bio: "", displayName: "" };
  }
}

export async function searchTikTokUsersPlaywright(
  sessionCookie: string,
  keyword: string,
  count = 10,
): Promise<{ username: string; displayName: string }[]> {
  const { browser, context } = await createBrowserContext(sessionCookie);
  const users: { username: string; displayName: string }[] = [];

  try {
    const page = await context.newPage();
    const searchUrl = `https://www.tiktok.com/search/user?q=${encodeURIComponent(keyword)}`;
    logger.info({ keyword, searchUrl }, "tiktok: navigating to user search");

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
      logger.warn({ keyword }, "tiktok: page load timeout, trying to extract content anyway");
    }
    await randomSleep(4000, 6000);

    // デバッグ: ページタイトルとURLを記録
    const pageTitle = await page.title();
    const pageUrl = page.url();
    logger.info({ keyword, pageTitle, pageUrl }, "tiktok: page loaded");

    // デバッグ用スクリーンショットを保存
    try {
      await page.screenshot({ path: "/tmp/tiktok-search-debug.png", fullPage: false });
      logger.info("tiktok: debug screenshot saved to /tmp/tiktok-search-debug.png");
    } catch { /* ignore */ }

    const selectors = [
      '[data-e2e="search-user-item"]',
      '[data-e2e="user-item"]',
      '[data-e2e="search-user-card"]',
      '[class*="UserCard"]',
      '[class*="user-card"]',
      '[class*="user-item"]',
      '[class*="UserItem"]',
      'div[class*="DivUserCard"]',
    ];

    let found = false;
    for (const sel of selectors) {
      const els = await page.$$(sel);
      if (els.length > 0) {
        logger.info({ selector: sel, count: els.length }, "tiktok: found user cards");
        found = true;
        for (const el of els.slice(0, count * 3)) {
          try {
            const linkEl = await el.$("a[href*='/@']");
            if (!linkEl) continue;
            const href = await linkEl.getAttribute("href") || "";
            const match = href.match(/\/@([^/?]+)/);
            if (!match) continue;
            const username = match[1];
            const nameEl = await el.$('[data-e2e="search-user-unique-id"], [class*="UniqueId"], [class*="username"]');
            const displayName = nameEl ? (await nameEl.textContent() || username) : username;
            if (username && !users.find(u => u.username === username)) {
              users.push({ username, displayName: displayName.replace(/^@/, "") });
            }
          } catch { continue; }
        }
        break;
      }
    }

    if (!found) {
      // フォールバック: ページ内の/@リンクを全て収集
      const links = await page.$$("a[href*='/@']");
      logger.info({ linkCount: links.length, keyword }, "tiktok: fallback link scan");
      const seen = new Set<string>();
      for (const link of links.slice(0, count * 3)) {
        const href = await link.getAttribute("href") || "";
        const match = href.match(/\/@([^/?]+)/);
        if (!match) continue;
        const username = match[1];
        if (seen.has(username) || username.length < 2) continue;
        seen.add(username);
        users.push({ username, displayName: username });
        if (users.length >= count * 2) break;
      }
    }

    logger.info({ keyword, found: users.length }, "tiktok: user search complete");
  } catch (err: any) {
    logger.error({ err: err?.message, keyword }, "tiktok: user search error");
  } finally {
    await browser.close();
  }

  return users;
}

export async function sendTikTokDmPlaywright(
  sessionCookie: string,
  username: string,
  message: string,
  opts: DmCampaignOptions = {},
): Promise<{ ok: boolean; error?: string; skipped?: boolean; followers?: number; gender?: string }> {
  const { browser, context } = await createBrowserContext(sessionCookie);

  try {
    const page = await context.newPage();
    const profileUrl = `https://www.tiktok.com/@${username}`;
    logger.info({ username, profileUrl }, "tiktok: navigating to profile");
    try {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
      logger.warn({ username }, "tiktok: profile page load timeout, trying to continue");
    }

    // ログイン状態確認
    const loginBtn = await page.$('[data-e2e="top-login-button"]');
    if (loginBtn) return { ok: false, error: "セッションが無効です（ログインが必要）" };

    // プロフィール情報取得（フォロワー数・性別）
    const profile = await scrapeProfileInfo(page);
    const gender = detectGender(profile.displayName || username, profile.bio);

    logger.info({ username, followers: profile.followers, gender, bio: profile.bio.slice(0, 50) }, "tiktok: profile scraped");

    // フォロワー数フィルター
    if (opts.minFollowers && opts.minFollowers > 0 && profile.followers < opts.minFollowers) {
      logger.info({ username, followers: profile.followers, minFollowers: opts.minFollowers }, "tiktok: skip - not enough followers");
      return { ok: false, skipped: true, error: `フォロワー不足（${profile.followers.toLocaleString()}人）`, followers: profile.followers, gender };
    }

    // 性別フィルター
    if (opts.genderFilter === "female" && gender === "male") {
      logger.info({ username, gender }, "tiktok: skip - gender mismatch (male detected)");
      return { ok: false, skipped: true, error: "性別フィルター（男性と判定）", followers: profile.followers, gender };
    }
    if (opts.genderFilter === "male" && gender === "female") {
      return { ok: false, skipped: true, error: "性別フィルター（女性と判定）", followers: profile.followers, gender };
    }

    // メッセージボタンをクリック
    const msgSelectors = [
      '[data-e2e="message-button"]',
      '[data-e2e="dm-button"]',
      'button[class*="message"]',
      'button[class*="Message"]',
      'button:has-text("メッセージ")',
      'button:has-text("Message")',
      'button:has-text("DM")',
    ];

    let clicked = false;
    for (const sel of msgSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); clicked = true; break; }
      } catch { continue; }
    }

    if (!clicked) {
      const title = await page.title();
      return { ok: false, error: `メッセージボタンが見つかりません（${title}）`, followers: profile.followers, gender };
    }

    await randomSleep(2000, 4000);

    // メッセージ入力欄
    const inputSelectors = [
      '[data-e2e="message-input"]',
      '[contenteditable="true"]',
      'textarea[placeholder*="メッセージ"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]',
      'input[type="text"]',
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = await page.$(sel);
      if (inputEl) break;
    }

    if (!inputEl) return { ok: false, error: "メッセージ入力欄が見つかりません", followers: profile.followers, gender };

    await inputEl.click();
    await randomSleep(500, 1000);
    await inputEl.fill(message);
    await randomSleep(1000, 2000);

    const sendSelectors = [
      '[data-e2e="send-button"]',
      'button[type="submit"]',
      'button:has-text("送信")',
      'button:has-text("Send")',
      '[class*="send"]',
      '[class*="Send"]',
    ];

    let sent = false;
    for (const sel of sendSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); sent = true; break; }
      } catch { continue; }
    }
    if (!sent) { await inputEl.press("Enter"); sent = true; }

    await randomSleep(2000, 3000);
    return { ok: true, followers: profile.followers, gender };
  } catch (err: any) {
    logger.error({ err: err?.message, username }, "tiktok: DM send error");
    return { ok: false, error: err?.message || "不明なエラー" };
  } finally {
    await browser.close();
  }
}

export async function runTikTokDmCampaign(
  sessionCookie: string,
  keyword: string,
  messageTemplate: string,
  maxCount: number,
  onResult: (username: string, ok: boolean, skipped: boolean, error?: string, followers?: number, gender?: string) => Promise<void>,
  opts: DmCampaignOptions = {},
): Promise<number> {
  logger.info({ keyword, maxCount, opts }, "tiktok: starting DM campaign");

  // 候補を多めに取得（フィルターで弾かれる分を考慮）
  const fetchCount = Math.min(maxCount * 5, 50);
  const users = await searchTikTokUsersPlaywright(sessionCookie, keyword, fetchCount);
  logger.info({ found: users.length, keyword }, "tiktok: users found for DM campaign");

  let sent = 0;
  for (const user of users) {
    if (sent >= maxCount) break;
    const message = messageTemplate.replace(/\{\{username\}\}/g, `@${user.username}`);
    const result = await sendTikTokDmPlaywright(sessionCookie, user.username, message, opts);
    await onResult(user.username, result.ok, result.skipped ?? false, result.error, result.followers, result.gender);
    if (result.ok) sent++;
    await randomSleep(5000, 10000);
  }

  logger.info({ sent, total: users.length }, "tiktok: DM campaign complete");
  return sent;
}
