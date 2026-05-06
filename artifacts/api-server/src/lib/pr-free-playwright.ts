import { chromium } from "playwright";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGO_PATH = join(__dirname, "sinjapan-logo.jpg");
const PR_FREE_URL = "https://pr-free.jp/prform/";

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function humanType(page: import("playwright").Page, selector: string, text: string) {
  await page.click(selector);
  await sleep(rand(200, 500));
  for (const char of text) {
    await page.type(selector, char, { delay: rand(40, 120) });
    if (Math.random() < 0.03) await sleep(rand(300, 800));
  }
  await sleep(rand(300, 700));
}

export interface PrFreePostOptions {
  teamname: string;
  name: string;
  email: string;
  url: string;
  category: string;
  companyname: string;
  title: string;
  subtitle: string;
  content: string;
}

export async function postToPrFreePlaywright(
  options: PrFreePostOptions,
): Promise<{ success: boolean; message: string }> {
  logger.info({ url: options.url, category: options.category }, "pr-free-playwright: launch");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    extraHTTPHeaders: {
      "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const page = await context.newPage();

  try {
    await page.goto(PR_FREE_URL, { waitUntil: "domcontentloaded", timeout: 40000 });
    await sleep(rand(2000, 4000));

    await page.evaluate(() => window.scrollTo(0, 300));
    await sleep(rand(500, 1200));

    // チームネーム
    await humanType(page, 'input[name="your-teamname"]', options.teamname);

    // 担当者名
    await humanType(page, 'input[name="your-name"]', options.name);

    // メールアドレス
    await humanType(page, 'input[name="your-email"]', options.email);

    // URL
    await humanType(page, 'input[name="url-adress"]', options.url);

    // カテゴリ（select）
    await page.selectOption('select[name="category"]', { value: options.category });
    await sleep(rand(500, 1000));

    // 会社名
    await humanType(page, 'input[name="companyname"]', options.companyname);

    // タイトル（subject）
    await humanType(page, 'input[name="your-subject"]', options.title.slice(0, 140));

    // サブタイトル
    if (options.subtitle) {
      await humanType(page, 'input[name="subtitle"]', options.subtitle.slice(0, 140));
    }

    // 本文（textarea）- 長いので少し速め
    await page.click('textarea[name="your-message"]');
    await sleep(rand(400, 800));
    await page.type('textarea[name="your-message"]', options.content, { delay: rand(25, 55) });
    await sleep(rand(800, 1500));

    // 画像アップロード
    if (existsSync(LOGO_PATH)) {
      const fileInput = page.locator('input[name="file-img1"]');
      await fileInput.setInputFiles(LOGO_PATH);
      logger.info("pr-free-playwright: logo uploaded");
      await sleep(rand(1000, 2000));
    } else {
      logger.warn("pr-free-playwright: logo not found, skipping upload");
    }

    // ページ下部にスクロール
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(rand(1000, 2000));

    // 規約同意・確認ボタンがあるか確認（wpcf7c 2ステップフォーム）
    const confirmBtn = page.locator('input.wpcf7c-btn-confirm');
    const isConfirmVisible = await confirmBtn.isVisible().catch(() => false);

    if (isConfirmVisible) {
      logger.info("pr-free-playwright: clicking confirm button (step 1)");
      await confirmBtn.click();
      await sleep(rand(2000, 3500));

      // step2: 送信ボタンを待って押す
      const submitBtn = page.locator('input.wpcf7-submit, input[type="submit"][value="リリースを送信"]').first();
      await submitBtn.waitFor({ state: "visible", timeout: 10000 });
      await sleep(rand(1000, 2000));
      await submitBtn.click();
    } else {
      // シングルステップ：直接送信
      logger.info("pr-free-playwright: clicking submit button directly");
      const submitBtn = page.locator('input.wpcf7-submit').first();
      await submitBtn.click();
    }

    logger.info("pr-free-playwright: submitted, waiting for response...");

    // レスポンスを待つ
    try {
      await page.waitForSelector(
        ".wpcf7-mail-sent-ok, .wpcf7-response-output, .sent",
        { timeout: 20000 },
      );
    } catch {
      // タイムアウト後もURLで確認
    }

    const responseEl = await page.$(".wpcf7-response-output");
    const responseText = responseEl
      ? ((await responseEl.textContent()) ?? "").trim()
      : "";
    const currentUrl = page.url();

    const isSuccess =
      responseText.includes("ありがとう") ||
      responseText.includes("送信") ||
      responseText.includes("受け付け") ||
      currentUrl.includes("thanks") ||
      currentUrl.includes("complete") ||
      (await page.$(".wpcf7-mail-sent-ok")) !== null;

    logger.info(
      { isSuccess, responseText: responseText.slice(0, 100), currentUrl },
      "pr-free-playwright: result",
    );

    return {
      success: isSuccess,
      message: responseText || (isSuccess ? "投稿完了" : "送信失敗：レスポンス不明"),
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, "pr-free-playwright: error");
    return { success: false, message: err?.message || "Playwright エラー" };
  } finally {
    await browser.close();
  }
}
