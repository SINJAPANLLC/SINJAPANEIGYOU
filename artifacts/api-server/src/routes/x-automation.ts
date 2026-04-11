import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  xAccountsTable,
  xAutomationRulesTable,
  xAutomationLogsTable,
} from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { TwitterApi } from "twitter-api-v2";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ACTION_TYPES = ["like", "retweet", "reply", "follow", "followback", "post", "dm"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

async function ownsAccount(userId: string, accountId: number) {
  const [a] = await db
    .select()
    .from(xAccountsTable)
    .where(and(eq(xAccountsTable.id, accountId), eq(xAccountsTable.userId, userId)));
  return a;
}

function buildClient(account: typeof xAccountsTable.$inferSelect) {
  return new TwitterApi({
    appKey: account.apiKey!,
    appSecret: account.apiSecret!,
    accessToken: account.accessToken!,
    accessSecret: account.accessTokenSecret!,
  });
}

// ── アカウント一覧 ────────────────────────────────────────
router.get("/x/accounts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accounts = await db
    .select()
    .from(xAccountsTable)
    .where(eq(xAccountsTable.userId, userId))
    .orderBy(xAccountsTable.createdAt);

  res.json(accounts.map(a => ({
    ...a,
    apiKey: a.apiKey ? "***" : null,
    apiSecret: a.apiSecret ? "***" : null,
    accessToken: a.accessToken ? "***" : null,
    accessTokenSecret: a.accessTokenSecret ? "***" : null,
    bearerToken: a.bearerToken ? "***" : null,
  })));
});

// ── アカウント追加・接続テスト ─────────────────────────────
router.post("/x/accounts", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { label, apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken } = req.body;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    res.status(400).json({ error: "認証情報を全て入力してください" }); return;
  }

  let verifiedUsername = label || null;
  try {
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret: accessTokenSecret });
    const me = await client.v2.me();
    verifiedUsername = me.data.username;
  } catch (err: any) {
    res.status(400).json({ error: "X APIへの接続に失敗しました。認証情報を確認してください。" }); return;
  }

  const [inserted] = await db.insert(xAccountsTable).values({
    userId,
    label: label || verifiedUsername || "アカウント",
    username: verifiedUsername,
    apiKey, apiSecret, accessToken, accessTokenSecret,
    bearerToken: bearerToken || null,
    isConnected: true,
  }).returning();

  res.json({ success: true, account: { ...inserted, apiKey: "***", apiSecret: "***", accessToken: "***", accessTokenSecret: "***" } });
});

// ── アカウント更新（認証情報変更） ─────────────────────────
router.put("/x/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const { label, apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken } = req.body;

  let verifiedUsername: string | null = null;
  try {
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret: accessTokenSecret });
    const me = await client.v2.me();
    verifiedUsername = me.data.username;
  } catch {
    res.status(400).json({ error: "X APIへの接続に失敗しました。認証情報を確認してください。" }); return;
  }

  await db.update(xAccountsTable)
    .set({ label: label || verifiedUsername || "アカウント", username: verifiedUsername, apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken: bearerToken || null, isConnected: true })
    .where(eq(xAccountsTable.id, accountId));

  res.json({ success: true, username: verifiedUsername });
});

// ── アカウント削除 ────────────────────────────────────────
router.delete("/x/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(xAccountsTable).where(eq(xAccountsTable.id, accountId));
  res.json({ success: true });
});

// ── ペルソナ保存 ──────────────────────────────────────────
router.put("/x/accounts/:id/persona", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(xAccountsTable).set({ persona: JSON.stringify(req.body.persona) }).where(eq(xAccountsTable.id, accountId));
  res.json({ success: true });
});

// ── ルール一覧 ────────────────────────────────────────────
router.get("/x/accounts/:id/rules", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }

  let rules = await db.select().from(xAutomationRulesTable).where(eq(xAutomationRulesTable.xAccountId, accountId));
  for (const actionType of ACTION_TYPES) {
    if (!rules.find(r => r.actionType === actionType)) {
      const [inserted] = await db.insert(xAutomationRulesTable)
        .values({ xAccountId: accountId, actionType, enabled: false, keywords: "", dailyLimit: 30, intervalSeconds: 120 })
        .returning();
      rules.push(inserted);
    }
  }
  res.json(rules);
});

// ── ルール更新 ─────────────────────────────────────────────
router.put("/x/accounts/:id/rules/:actionType", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  const { actionType } = req.params;
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const { enabled, keywords, dailyLimit, intervalSeconds, replyTemplate, scheduleTimes } = req.body;
  const [existing] = await db.select().from(xAutomationRulesTable)
    .where(and(eq(xAutomationRulesTable.xAccountId, accountId), eq(xAutomationRulesTable.actionType, actionType)));

  if (existing) {
    await db.update(xAutomationRulesTable)
      .set({ enabled, keywords, dailyLimit: Number(dailyLimit), intervalSeconds: Number(intervalSeconds), replyTemplate: replyTemplate || null, scheduleTimes: scheduleTimes || "" })
      .where(eq(xAutomationRulesTable.id, existing.id));
  } else {
    await db.insert(xAutomationRulesTable).values({ xAccountId: accountId, actionType, enabled, keywords: keywords || "", dailyLimit: Number(dailyLimit) || 30, intervalSeconds: Number(intervalSeconds) || 120, replyTemplate: replyTemplate || null, scheduleTimes: scheduleTimes || "" });
  }
  res.json({ success: true });
});

// ── ログ一覧 ──────────────────────────────────────────────
router.get("/x/accounts/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  if (!(await ownsAccount(userId, accountId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const logs = await db.select().from(xAutomationLogsTable)
    .where(eq(xAutomationLogsTable.xAccountId, accountId))
    .orderBy(desc(xAutomationLogsTable.createdAt))
    .limit(100);
  res.json(logs);
});

// ── AIペルソナ生成 ────────────────────────────────────────
router.post("/x/accounts/:id/generate-persona", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  const account = await ownsAccount(userId, accountId);
  if (!account) { res.status(403).json({ error: "Forbidden" }); return; }

  const { description } = req.body;
  if (!description?.trim()) { res.status(400).json({ error: "説明を入力してください" }); return; }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `あなたはX(Twitter)のペルソナ設定を行うアシスタントです。
ユーザーの説明をもとに、以下のJSON形式でペルソナを生成してください。
出力はJSONのみ（前置き・説明不要）。

{
  "name": "名前・ハンドル名",
  "job": "職業・役職",
  "tone": "口調・キャラクター（具体的に）",
  "topics": "メイン投稿テーマ（カンマ区切り）",
  "bio": "自己紹介文（100文字前後）",
  "style": "投稿スタイル（具体的に）"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `以下の人物・アカウントのペルソナを生成してください:\n${description}` },
    ],
    max_tokens: 500,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  try {
    const persona = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    res.json({ persona });
  } catch {
    res.status(500).json({ error: "ペルソナの生成に失敗しました" });
  }
});

// ── AI生成 ────────────────────────────────────────────────
router.post("/x/accounts/:id/generate", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  const account = await ownsAccount(userId, accountId);
  if (!account) { res.status(403).json({ error: "Forbidden" }); return; }

  const { type, context } = req.body;
  const persona = account.persona ? JSON.parse(account.persona) : null;

  let systemPrompt = `あなたはX(Twitter)の投稿を生成するアシスタントです。`;
  if (persona) {
    systemPrompt += `\n以下のペルソナになりきって投稿文を生成してください。\n\n【名前】${persona.name ?? ""}\n【職業・役職】${persona.job ?? ""}\n【口調・キャラ】${persona.tone ?? "フランク"}\n【得意分野・テーマ】${persona.topics ?? ""}\n【自己紹介】${persona.bio ?? ""}\n【投稿スタイル】${persona.style ?? ""}\n\nルール:\n- 280文字以内（日本語）\n- ハッシュタグは1〜2個まで\n- 宣伝っぽくしない\n- 本文だけ出力、前置き不要`;
  } else {
    systemPrompt += `日本語で280文字以内の自然なツイートを生成。本文だけ出力。`;
  }

  const userPrompt = type === "reply" && context
    ? `以下のツイートへの自然なリプライを生成:\n"${context}"`
    : `今日のツイートを1本生成。${context ? `テーマ: ${context}` : ""}`;

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    max_tokens: 200, temperature: 0.85,
  });

  res.json({ text: completion.choices[0]?.message?.content?.trim() ?? "" });
});

// ── ツイート投稿 ──────────────────────────────────────────
router.post("/x/accounts/:id/post", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  const account = await ownsAccount(userId, accountId);
  if (!account) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!account.isConnected) { res.status(400).json({ error: "X アカウントが接続されていません" }); return; }

  const { text } = req.body;
  if (!text?.trim()) { res.status(400).json({ error: "本文を入力してください" }); return; }
  if (text.length > 280) { res.status(400).json({ error: "280文字以内で入力してください" }); return; }

  try {
    const client = buildClient(account);
    const tweet = await client.v2.tweet({ text: text.trim() });
    await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "post", targetTweetId: tweet.data.id, tweetContent: text.trim(), status: "success" });
    res.json({ success: true, tweetId: tweet.data.id });
  } catch (err: any) {
    await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "post", tweetContent: text.trim(), status: "error", errorMessage: err?.message }).catch(() => {});
    res.status(500).json({ error: err?.message ?? "投稿に失敗しました" });
  }
});

// ── 自動化実行 ────────────────────────────────────────────
router.post("/x/accounts/:id/run/:actionType", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const accountId = Number(req.params.id);
  const actionType = req.params.actionType as ActionType;
  const account = await ownsAccount(userId, accountId);
  if (!account) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!account.isConnected) { res.status(400).json({ error: "X アカウントが接続されていません" }); return; }

  const [rule] = await db.select().from(xAutomationRulesTable)
    .where(and(eq(xAutomationRulesTable.xAccountId, accountId), eq(xAutomationRulesTable.actionType, actionType)));

  // post・followback は keywords 任意
  if (actionType !== "post" && actionType !== "followback" && !rule?.keywords?.trim()) {
    res.status(400).json({ error: "キーワードが設定されていません" }); return;
  }

  try {
    const client = buildClient(account);
    const me = await client.v2.me();
    const myId = me.data.id;
    const keyword = rule.keywords?.split(",")[0]?.trim() ?? "";
    const executed: string[] = [];
    const limit = Math.min(5, rule.dailyLimit);

    if (actionType === "like") {
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        if (executed.length >= limit) break;
        await client.v2.like(myId, tweet.id);
        await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "like", targetTweetId: tweet.id, tweetContent: tweet.text, status: "success" });
        executed.push(tweet.id);
      }
    } else if (actionType === "retweet") {
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        if (executed.length >= limit) break;
        await client.v2.retweet(myId, tweet.id);
        await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "retweet", targetTweetId: tweet.id, tweetContent: tweet.text, status: "success" });
        executed.push(tweet.id);
      }
    } else if (actionType === "follow") {
      const users = await client.v2.searchUsers(keyword, { max_results: 10 });
      for (const user of users.data ?? []) {
        if (executed.length >= limit) break;
        await client.v2.follow(myId, user.id);
        await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "follow", targetUserId: user.id, targetUsername: user.username, status: "success" });
        executed.push(user.id);
      }
    } else if (actionType === "reply") {
      if (!rule.replyTemplate) { res.status(400).json({ error: "リプライテンプレートが設定されていません" }); return; }
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        if (executed.length >= Math.min(3, limit)) break;
        const replyText = rule.replyTemplate.replace("{{tweet}}", tweet.text.slice(0, 30));
        await client.v2.tweet({ text: replyText, reply: { in_reply_to_tweet_id: tweet.id } });
        await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "reply", targetTweetId: tweet.id, tweetContent: replyText, status: "success" });
        executed.push(tweet.id);
      }
    } else if (actionType === "post") {
      // テンプレートあり → そのまま投稿、なし → AIで生成
      let tweetText: string;
      if (rule.replyTemplate?.trim()) {
        tweetText = rule.replyTemplate.trim();
      } else {
        const account2 = await ownsAccount(userId, accountId);
        const persona = account2?.persona ? JSON.parse(account2.persona) : null;
        let systemPrompt = "あなたはX(Twitter)の投稿を生成するアシスタントです。";
        if (persona) {
          systemPrompt += `\n以下のペルソナになりきって投稿文を生成してください。\n名前: ${persona.name ?? ""}\n職業: ${persona.job ?? ""}\n口調: ${persona.tone ?? ""}\nテーマ: ${persona.topics ?? ""}\nスタイル: ${persona.style ?? ""}\n\n・280文字以内（日本語）・ハッシュタグ1〜2個・本文だけ出力`;
        } else {
          systemPrompt += "日本語で280文字以内のツイートを1本生成。本文だけ出力。";
        }
        const userPrompt = keyword ? `テーマ「${keyword}」でツイートを1本生成` : "今日のツイートを1本生成";
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          max_tokens: 200, temperature: 0.85,
        });
        tweetText = completion.choices[0]?.message?.content?.trim() ?? "";
      }
      if (!tweetText) { res.status(500).json({ error: "投稿文の生成に失敗しました" }); return; }
      const tweet = await client.v2.tweet({ text: tweetText });
      await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "post", targetTweetId: tweet.data.id, tweetContent: tweetText, status: "success" });
      executed.push(tweet.data.id);
    } else if (actionType === "dm") {
      if (!rule.replyTemplate?.trim()) { res.status(400).json({ error: "DM本文テンプレートが設定されていません" }); return; }
      const users = await client.v2.searchUsers(keyword, { max_results: 10 });
      for (const user of users.data ?? []) {
        if (executed.length >= Math.min(3, limit)) break;
        if (user.id === myId) continue;
        try {
          await client.v1.sendDm({ recipient_id: user.id, text: rule.replyTemplate!.trim() });
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "dm", targetUserId: user.id, targetUsername: user.username, tweetContent: rule.replyTemplate, status: "success" });
          executed.push(user.id);
        } catch (dmErr: any) {
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "dm", targetUserId: user.id, targetUsername: user.username, status: "error", errorMessage: dmErr?.message });
        }
      }
    } else if (actionType === "followback") {
      // フォロワー取得
      const followers = await client.v2.followers(myId, { max_results: 100 });
      // 自分がフォローしている人を取得
      const following = await client.v2.following(myId, { max_results: 1000 });
      const followingIds = new Set((following.data ?? []).map(u => u.id));

      for (const follower of followers.data ?? []) {
        if (executed.length >= limit) break;
        if (followingIds.has(follower.id)) continue; // すでにフォロー済み
        try {
          await client.v2.follow(myId, follower.id);
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "followback", targetUserId: follower.id, targetUsername: follower.username, status: "success" });
          executed.push(follower.id);
        } catch (fbErr: any) {
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "followback", targetUserId: follower.id, targetUsername: follower.username, status: "error", errorMessage: fbErr?.message });
        }
      }
    }

    await db.update(xAutomationRulesTable)
      .set({ executedToday: (rule.executedToday ?? 0) + executed.length, lastRunAt: new Date() })
      .where(eq(xAutomationRulesTable.id, rule.id));

    res.json({ success: true, executed: executed.length });
  } catch (err: any) {
    logger.error({ err: err?.message, actionType }, "X automation run failed");
    await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType, status: "error", errorMessage: err?.message }).catch(() => {});
    res.status(500).json({ error: err?.message ?? "実行に失敗しました" });
  }
});

export default router;
