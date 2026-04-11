import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, businessesTable } from "@workspace/db";
import {
  xAccountsTable,
  xAutomationRulesTable,
  xAutomationLogsTable,
} from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { TwitterApi } from "twitter-api-v2";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ACTION_TYPES = ["like", "retweet", "reply", "follow"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

async function ownsBusiness(userId: string, businessId: number) {
  const [b] = await db
    .select()
    .from(businessesTable)
    .where(
      and(
        eq(businessesTable.id, businessId),
        eq(businessesTable.userId, userId)
      )
    );
  return b;
}

function buildClient(account: typeof xAccountsTable.$inferSelect) {
  return new TwitterApi({
    appKey: account.apiKey!,
    appSecret: account.apiSecret!,
    accessToken: account.accessToken!,
    accessSecret: account.accessTokenSecret!,
  });
}

// ── アカウント取得 ─────────────────────────────────────────
router.get("/x/account", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.query.businessId);
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [account] = await db
    .select()
    .from(xAccountsTable)
    .where(eq(xAccountsTable.businessId, businessId));

  if (!account) {
    res.json(null);
    return;
  }
  res.json({
    ...account,
    apiKey: account.apiKey ? "***" : null,
    apiSecret: account.apiSecret ? "***" : null,
    accessToken: account.accessToken ? "***" : null,
    accessTokenSecret: account.accessTokenSecret ? "***" : null,
    bearerToken: account.bearerToken ? "***" : null,
  });
});

// ── アカウント保存 / 接続テスト ────────────────────────────
router.post("/x/account", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, username, apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken } = req.body;
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, Number(businessId)))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // 接続テスト
  let isConnected = false;
  let verifiedUsername = username || null;
  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });
    const me = await client.v2.me();
    isConnected = true;
    verifiedUsername = me.data.username;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "X API connection test failed");
    res.status(400).json({ error: "X APIへの接続に失敗しました。認証情報を確認してください。" });
    return;
  }

  const [existing] = await db
    .select()
    .from(xAccountsTable)
    .where(eq(xAccountsTable.businessId, Number(businessId)));

  if (existing) {
    await db
      .update(xAccountsTable)
      .set({ username: verifiedUsername, apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken: bearerToken || null, isConnected })
      .where(eq(xAccountsTable.id, existing.id));
  } else {
    await db.insert(xAccountsTable).values({
      businessId: Number(businessId),
      username: verifiedUsername,
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
      bearerToken: bearerToken || null,
      isConnected,
    });
  }

  res.json({ success: true, username: verifiedUsername });
});

// ── アカウント切断 ────────────────────────────────────────
router.delete("/x/account", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.query.businessId);
  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .update(xAccountsTable)
    .set({ isConnected: false })
    .where(eq(xAccountsTable.businessId, businessId));
  res.json({ success: true });
});

// ── ルール一覧取得 ────────────────────────────────────────
router.get("/x/rules", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.query.businessId);
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let rules = await db
    .select()
    .from(xAutomationRulesTable)
    .where(eq(xAutomationRulesTable.businessId, businessId));

  // アクションタイプごとにデフォルト行を補完
  for (const actionType of ACTION_TYPES) {
    if (!rules.find(r => r.actionType === actionType)) {
      const [inserted] = await db
        .insert(xAutomationRulesTable)
        .values({ businessId, actionType, enabled: false, keywords: "", dailyLimit: 30, intervalSeconds: 120 })
        .returning();
      rules.push(inserted);
    }
  }

  res.json(rules);
});

// ── ルール更新 ─────────────────────────────────────────────
router.put("/x/rules/:actionType", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, enabled, keywords, dailyLimit, intervalSeconds, replyTemplate } = req.body;
  const actionType = req.params.actionType;

  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, Number(businessId)))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [existing] = await db
    .select()
    .from(xAutomationRulesTable)
    .where(
      and(
        eq(xAutomationRulesTable.businessId, Number(businessId)),
        eq(xAutomationRulesTable.actionType, actionType)
      )
    );

  if (existing) {
    await db
      .update(xAutomationRulesTable)
      .set({ enabled, keywords, dailyLimit: Number(dailyLimit), intervalSeconds: Number(intervalSeconds), replyTemplate: replyTemplate || null })
      .where(eq(xAutomationRulesTable.id, existing.id));
  } else {
    await db.insert(xAutomationRulesTable).values({
      businessId: Number(businessId),
      actionType,
      enabled,
      keywords: keywords || "",
      dailyLimit: Number(dailyLimit) || 30,
      intervalSeconds: Number(intervalSeconds) || 120,
      replyTemplate: replyTemplate || null,
    });
  }

  res.json({ success: true });
});

// ── ログ一覧 ──────────────────────────────────────────────
router.get("/x/logs", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const businessId = Number(req.query.businessId);
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, businessId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const logs = await db
    .select()
    .from(xAutomationLogsTable)
    .where(eq(xAutomationLogsTable.businessId, businessId))
    .orderBy(desc(xAutomationLogsTable.createdAt))
    .limit(100);
  res.json(logs);
});

// ── 手動実行（いいね / RT / フォロー / リプ） ─────────────
router.post("/x/run/:actionType", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId } = req.body;
  const actionType = req.params.actionType as ActionType;

  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }
  if (!(await ownsBusiness(userId, Number(businessId)))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [account] = await db
    .select()
    .from(xAccountsTable)
    .where(
      and(
        eq(xAccountsTable.businessId, Number(businessId)),
        eq(xAccountsTable.isConnected, true)
      )
    );

  if (!account) {
    res.status(400).json({ error: "X アカウントが接続されていません" });
    return;
  }

  const [rule] = await db
    .select()
    .from(xAutomationRulesTable)
    .where(
      and(
        eq(xAutomationRulesTable.businessId, Number(businessId)),
        eq(xAutomationRulesTable.actionType, actionType)
      )
    );

  if (!rule || !rule.keywords.trim()) {
    res.status(400).json({ error: "キーワードが設定されていません" });
    return;
  }

  try {
    const client = buildClient(account);
    const me = await client.v2.me();
    const myId = me.data.id;

    const keyword = rule.keywords.split(",")[0].trim();
    const executed: string[] = [];

    if (actionType === "like") {
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        await client.v2.like(myId, tweet.id);
        await db.insert(xAutomationLogsTable).values({
          businessId: Number(businessId),
          actionType: "like",
          targetTweetId: tweet.id,
          tweetContent: tweet.text,
          status: "success",
        });
        executed.push(tweet.id);
        if (executed.length >= Math.min(5, rule.dailyLimit)) break;
      }
    }

    if (actionType === "retweet") {
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        await client.v2.retweet(myId, tweet.id);
        await db.insert(xAutomationLogsTable).values({
          businessId: Number(businessId),
          actionType: "retweet",
          targetTweetId: tweet.id,
          tweetContent: tweet.text,
          status: "success",
        });
        executed.push(tweet.id);
        if (executed.length >= Math.min(5, rule.dailyLimit)) break;
      }
    }

    if (actionType === "follow") {
      const users = await client.v2.searchUsers(keyword, { max_results: 10 });
      for (const user of users.data ?? []) {
        await client.v2.follow(myId, user.id);
        await db.insert(xAutomationLogsTable).values({
          businessId: Number(businessId),
          actionType: "follow",
          targetUserId: user.id,
          targetUsername: user.username,
          status: "success",
        });
        executed.push(user.id);
        if (executed.length >= Math.min(5, rule.dailyLimit)) break;
      }
    }

    if (actionType === "reply") {
      if (!rule.replyTemplate) {
        res.status(400).json({ error: "リプライテンプレートが設定されていません" });
        return;
      }
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        const replyText = rule.replyTemplate.replace("{{tweet}}", tweet.text.slice(0, 30));
        await client.v2.tweet({ text: replyText, reply: { in_reply_to_tweet_id: tweet.id } });
        await db.insert(xAutomationLogsTable).values({
          businessId: Number(businessId),
          actionType: "reply",
          targetTweetId: tweet.id,
          tweetContent: replyText,
          status: "success",
        });
        executed.push(tweet.id);
        if (executed.length >= Math.min(3, rule.dailyLimit)) break;
      }
    }

    await db
      .update(xAutomationRulesTable)
      .set({ executedToday: (rule.executedToday ?? 0) + executed.length, lastRunAt: new Date() })
      .where(eq(xAutomationRulesTable.id, rule.id));

    res.json({ success: true, executed: executed.length });
  } catch (err: any) {
    logger.error({ err: err?.message, actionType }, "X automation run failed");
    await db.insert(xAutomationLogsTable).values({
      businessId: Number(businessId),
      actionType,
      status: "error",
      errorMessage: err?.message ?? "Unknown error",
    }).catch(() => {});
    res.status(500).json({ error: err?.message ?? "実行に失敗しました" });
  }
});

// ── ペルソナ保存 ──────────────────────────────────────────
router.put("/x/persona", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, persona } = req.body;
  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }
  if (!(await ownsBusiness(userId, Number(businessId)))) { res.status(403).json({ error: "Forbidden" }); return; }

  await db
    .update(xAccountsTable)
    .set({ persona: JSON.stringify(persona) })
    .where(eq(xAccountsTable.businessId, Number(businessId)));

  res.json({ success: true });
});

// ── AIツイート生成 ─────────────────────────────────────────
router.post("/x/generate", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, type, context } = req.body;
  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }
  if (!(await ownsBusiness(userId, Number(businessId)))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [account] = await db
    .select()
    .from(xAccountsTable)
    .where(eq(xAccountsTable.businessId, Number(businessId)));

  const persona = account?.persona ? JSON.parse(account.persona) : null;

  let systemPrompt = `あなたはX(Twitter)の投稿を生成するアシスタントです。`;
  if (persona) {
    systemPrompt += `
以下のペルソナになりきって投稿文を生成してください。

【名前】${persona.name ?? "未設定"}
【職業・役職】${persona.job ?? "未設定"}
【口調・キャラ】${persona.tone ?? "フランクで親しみやすい"}
【得意分野・テーマ】${persona.topics ?? "ビジネス・日常"}
【自己紹介】${persona.bio ?? "未設定"}
【投稿スタイル】${persona.style ?? "自然な口語体"}

ルール:
- 280文字以内で書く（日本語）
- ハッシュタグは1〜2個まで
- 宣伝っぽくならないよう自然な投稿にする
- 絵文字は適度に使う
- 本文だけを出力し、説明・前置きは一切不要`;
  } else {
    systemPrompt += `日本語で280文字以内の自然なツイートを生成してください。本文だけを出力してください。`;
  }

  const userPrompt = type === "reply" && context
    ? `以下のツイートへの自然なリプライを生成してください:\n"${context}"`
    : `今日のツイートを1本生成してください。${context ? `テーマ: ${context}` : ""}`;

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 200,
    temperature: 0.85,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  res.json({ text });
});

// ── ツイート投稿 ──────────────────────────────────────────
router.post("/x/post", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const { businessId, text, scheduledAt } = req.body;

  if (!businessId) { res.status(400).json({ error: "businessId is required" }); return; }
  if (!text?.trim()) { res.status(400).json({ error: "ツイート本文を入力してください" }); return; }
  if (text.length > 280) { res.status(400).json({ error: "280文字以内で入力してください" }); return; }

  if (!(await ownsBusiness(userId, Number(businessId)))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [account] = await db
    .select()
    .from(xAccountsTable)
    .where(and(eq(xAccountsTable.businessId, Number(businessId)), eq(xAccountsTable.isConnected, true)));

  if (!account) { res.status(400).json({ error: "X アカウントが接続されていません" }); return; }

  try {
    const client = buildClient(account);
    const tweet = await client.v2.tweet({ text: text.trim() });

    await db.insert(xAutomationLogsTable).values({
      businessId: Number(businessId),
      actionType: "post",
      targetTweetId: tweet.data.id,
      tweetContent: text.trim(),
      status: "success",
    });

    logger.info({ tweetId: tweet.data.id }, "X post success");
    res.json({ success: true, tweetId: tweet.data.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "X post failed");
    await db.insert(xAutomationLogsTable).values({
      businessId: Number(businessId),
      actionType: "post",
      tweetContent: text.trim(),
      status: "error",
      errorMessage: err?.message ?? "Unknown error",
    }).catch(() => {});
    res.status(500).json({ error: err?.message ?? "投稿に失敗しました" });
  }
});

export default router;
