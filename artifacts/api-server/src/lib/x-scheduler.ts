import cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { db, xAccountsTable, xAutomationRulesTable, xAutomationLogsTable } from "@workspace/db";
import { TwitterApi } from "twitter-api-v2";
import { logger } from "./logger";

function buildClient(account: typeof xAccountsTable.$inferSelect) {
  return new TwitterApi({
    appKey: account.apiKey!,
    appSecret: account.apiSecret!,
    accessToken: account.accessToken!,
    accessSecret: account.accessTokenSecret!,
  });
}

export async function runXRule(
  account: typeof xAccountsTable.$inferSelect,
  rule: typeof xAutomationRulesTable.$inferSelect,
) {
  const { id: accountId, userId } = account;
  const { actionType, keywords, dailyLimit, replyTemplate } = rule;
  const limit = Math.min(5, dailyLimit);
  const keyword = keywords?.split(",")[0]?.trim() ?? "";
  const executed: string[] = [];

  try {
    const client = buildClient(account);
    const me = await client.v2.me();
    const myId = me.data.id;

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
      if (!replyTemplate) return;
      const tweets = await client.v2.search(keyword, { max_results: 10 });
      for (const tweet of tweets.data.data ?? []) {
        if (executed.length >= Math.min(3, limit)) break;
        const replyText = replyTemplate.replace("{{tweet}}", tweet.text.slice(0, 30));
        await client.v2.tweet({ text: replyText, reply: { in_reply_to_tweet_id: tweet.id } });
        await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "reply", targetTweetId: tweet.id, tweetContent: replyText, status: "success" });
        executed.push(tweet.id);
      }
    } else if (actionType === "post") {
      let tweetText: string;
      if (replyTemplate?.trim()) {
        tweetText = replyTemplate.trim();
      } else {
        const personaRaw = account.persona ? JSON.parse(account.persona) : null;
        let systemPrompt = "あなたはX(Twitter)の投稿を生成するアシスタントです。";
        if (personaRaw) {
          systemPrompt += `\n以下のペルソナになりきって投稿文を生成してください。\n名前: ${personaRaw.name ?? ""}\n職業: ${personaRaw.job ?? ""}\n口調: ${personaRaw.tone ?? ""}\nテーマ: ${personaRaw.topics ?? ""}\nスタイル: ${personaRaw.style ?? ""}\n\n・280文字以内（日本語）・ハッシュタグ1〜2個・本文だけ出力`;
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
      if (!tweetText) return;
      const tweet = await client.v2.tweet({ text: tweetText });
      await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "post", targetTweetId: tweet.data.id, tweetContent: tweetText, status: "success" });
      executed.push(tweet.data.id);
    } else if (actionType === "dm") {
      if (!replyTemplate?.trim()) return;
      const users = await client.v2.searchUsers(keyword, { max_results: 10 });
      for (const user of users.data ?? []) {
        if (executed.length >= Math.min(3, limit)) break;
        if (user.id === myId) continue;
        try {
          await client.v1.sendDm({ recipient_id: user.id, text: replyTemplate.trim() });
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "dm", targetUserId: user.id, targetUsername: user.username, tweetContent: replyTemplate, status: "success" });
          executed.push(user.id);
        } catch (e: any) {
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "dm", targetUserId: user.id, targetUsername: user.username, status: "error", errorMessage: e?.message });
        }
      }
    } else if (actionType === "followback") {
      const followers = await client.v2.followers(myId, { max_results: 100 });
      const following = await client.v2.following(myId, { max_results: 1000 });
      const followingIds = new Set((following.data ?? []).map(u => u.id));
      for (const follower of followers.data ?? []) {
        if (executed.length >= limit) break;
        if (followingIds.has(follower.id)) continue;
        try {
          await client.v2.follow(myId, follower.id);
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "followback", targetUserId: follower.id, targetUsername: follower.username, status: "success" });
          executed.push(follower.id);
        } catch (e: any) {
          await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType: "followback", targetUserId: follower.id, targetUsername: follower.username, status: "error", errorMessage: e?.message });
        }
      }
    }

    if (executed.length > 0) {
      await db.update(xAutomationRulesTable)
        .set({ executedToday: (rule.executedToday ?? 0) + executed.length, lastRunAt: new Date() })
        .where(eq(xAutomationRulesTable.id, rule.id));
    }

    logger.info({ accountId, actionType, executed: executed.length }, "x-scheduler: rule executed");
  } catch (err: any) {
    logger.error({ accountId, actionType, err: err?.message }, "x-scheduler: rule failed");
    await db.insert(xAutomationLogsTable).values({ xAccountId: accountId, actionType, status: "error", errorMessage: err?.message }).catch(() => {});
  }
}

export function startXScheduler() {
  // 毎時00分に実行
  cron.schedule("0 * * * *", async () => {
    const nowHour = new Date().getHours(); // JST想定
    logger.info({ nowHour }, "x-scheduler: hourly check");

    try {
      // 有効なルールを全取得
      const rules = await db.select().from(xAutomationRulesTable)
        .where(eq(xAutomationRulesTable.enabled, true));

      for (const rule of rules) {
        if (!rule.scheduleTimes?.trim()) continue;
        const hours = rule.scheduleTimes.split(",").map(h => parseInt(h.trim(), 10));
        if (!hours.includes(nowHour)) continue;

        const [account] = await db.select().from(xAccountsTable)
          .where(and(eq(xAccountsTable.id, rule.xAccountId), eq(xAccountsTable.isConnected, true)));
        if (!account) continue;

        // 日次リセット（JST 0時）
        if (nowHour === 0) {
          await db.update(xAutomationRulesTable)
            .set({ executedToday: 0, resetAt: new Date() })
            .where(eq(xAutomationRulesTable.id, rule.id));
          rule.executedToday = 0;
        }

        if ((rule.executedToday ?? 0) >= rule.dailyLimit) {
          logger.info({ ruleId: rule.id, actionType: rule.actionType }, "x-scheduler: daily limit reached");
          continue;
        }

        await runXRule(account, rule);
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, "x-scheduler: hourly check failed");
    }
  });

  logger.info("x-scheduler: started (runs every hour)");
}
