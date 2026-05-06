import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logger } from "./logger";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function randomSleep(minMs: number, maxMs: number) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

async function createBrowserContext(sessionCookie: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });

  await context.addCookies([
    {
      name: "sessionid",
      value: sessionCookie,
      domain: ".tiktok.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
    {
      name: "sessionid_ss",
      value: sessionCookie,
      domain: ".tiktok.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
    {
      name: "ttwid",
      value: "1",
      domain: ".tiktok.com",
      path: "/",
    },
  ]);

  // WebDriverフラグを隠す
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    (window as any).chrome = { runtime: {} };
  });

  return { browser, context };
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

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomSleep(3000, 5000);

    // ユーザーカードを探す
    const selectors = [
      '[data-e2e="search-user-item"]',
      '[data-e2e="user-item"]',
      '.tiktok-1qb12g8-DivUserCard',
      '[class*="UserCard"]',
      '[class*="user-item"]',
    ];

    let found = false;
    for (const sel of selectors) {
      const els = await page.$$(sel);
      if (els.length > 0) {
        logger.info({ selector: sel, count: els.length }, "tiktok: found user cards");
        found = true;
        for (const el of els.slice(0, count)) {
          try {
            // ユーザー名を取得（@から始まるリンク or テキスト）
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
          } catch {
            continue;
          }
        }
        break;
      }
    }

    if (!found) {
      // フォールバック: hrefでユーザーリンクを探す
      const links = await page.$$("a[href*='/@']");
      const seen = new Set<string>();
      for (const link of links.slice(0, count * 3)) {
        const href = await link.getAttribute("href") || "";
        const match = href.match(/\/@([^/?]+)/);
        if (!match) continue;
        const username = match[1];
        if (seen.has(username) || username.length < 2) continue;
        seen.add(username);
        users.push({ username, displayName: username });
        if (users.length >= count) break;
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
): Promise<{ ok: boolean; error?: string }> {
  const { browser, context } = await createBrowserContext(sessionCookie);

  try {
    const page = await context.newPage();

    // プロフィールページへ移動
    const profileUrl = `https://www.tiktok.com/@${username}`;
    logger.info({ username, profileUrl }, "tiktok: navigating to profile");
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomSleep(3000, 5000);

    // ログイン状態確認
    const loginBtn = await page.$('[data-e2e="top-login-button"]');
    if (loginBtn) {
      return { ok: false, error: "セッションが無効です（ログインが必要）" };
    }

    // メッセージボタンを探してクリック
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
        if (btn) {
          await btn.click();
          logger.info({ username, selector: sel }, "tiktok: clicked message button");
          clicked = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!clicked) {
      // スクリーンショットでデバッグ情報を記録
      const title = await page.title();
      logger.warn({ username, title }, "tiktok: message button not found");
      return { ok: false, error: `メッセージボタンが見つかりません（ページ: ${title}）` };
    }

    await randomSleep(2000, 4000);

    // メッセージ入力欄を探す
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
      if (inputEl) {
        logger.info({ username, selector: sel }, "tiktok: found message input");
        break;
      }
    }

    if (!inputEl) {
      logger.warn({ username }, "tiktok: message input not found");
      return { ok: false, error: "メッセージ入力欄が見つかりません" };
    }

    // メッセージを入力
    await inputEl.click();
    await randomSleep(500, 1000);
    await inputEl.fill(message);
    await randomSleep(1000, 2000);

    // 送信ボタンまたはEnterキー
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
        if (btn) {
          await btn.click();
          sent = true;
          logger.info({ username, selector: sel }, "tiktok: clicked send button");
          break;
        }
      } catch {
        continue;
      }
    }

    if (!sent) {
      // Enterキーで送信を試みる
      await inputEl.press("Enter");
      sent = true;
      logger.info({ username }, "tiktok: sent via Enter key");
    }

    await randomSleep(2000, 3000);
    return { ok: true };
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
  onResult: (username: string, ok: boolean, error?: string) => Promise<void>,
): Promise<number> {
  logger.info({ keyword, maxCount }, "tiktok: starting DM campaign");

  const users = await searchTikTokUsersPlaywright(sessionCookie, keyword, maxCount);
  logger.info({ found: users.length, keyword }, "tiktok: users found for DM campaign");

  let sent = 0;
  for (const user of users) {
    if (sent >= maxCount) break;
    const message = messageTemplate.replace(/\{\{username\}\}/g, `@${user.username}`);
    const result = await sendTikTokDmPlaywright(sessionCookie, user.username, message);
    await onResult(user.username, result.ok, result.error || undefined);
    if (result.ok) sent++;

    // 送信間隔：5〜10秒（BAN回避）
    await randomSleep(5000, 10000);
  }

  logger.info({ sent, total: users.length }, "tiktok: DM campaign complete");
  return sent;
}
