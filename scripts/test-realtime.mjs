/**
 * OpenAI Realtime API テスト（テキスト入力 → 音声+文字起こし出力）
 * Usage: node scripts/test-realtime.mjs
 */

import WebSocket from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY が設定されていません");
  process.exit(1);
}

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

const TEST_MESSAGES = [
  "こんにちは。御社のシステム担当の方はいらっしゃいますか？",
  "弊社は営業効率化のSaaSを提供しております。少しだけお時間いただけますか？",
];

let messageIndex = 0;
let responseStartAt = null;
const latencies = [];
let currentTranscript = "";

const ws = new WebSocket(REALTIME_URL, {
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
});

ws.on("open", () => {
  console.log("✅ OpenAI Realtime API 接続成功\n");

  // セッション設定（GAのAPIで受け入れるパラメータのみ）
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        instructions:
          "あなたは日本語を話す受付担当です。営業電話に対して自然に応答してください。簡潔に2〜3文で返してください。",
      },
    })
  );

  setTimeout(() => sendMessage(TEST_MESSAGES[0]), 500);
});

function sendMessage(text) {
  console.log(`\n🧑 ユーザー: "${text}"`);
  responseStartAt = Date.now();
  currentTranscript = "";

  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    })
  );

  ws.send(JSON.stringify({ type: "response.create" }));
}

ws.on("message", (data) => {
  const event = JSON.parse(data.toString());

  switch (event.type) {
    // 音声のトランスクリプトデルタ（GA API）
    case "response.output_audio_transcript.delta":
      if (responseStartAt !== null) {
        const latency = Date.now() - responseStartAt;
        latencies.push(latency);
        process.stdout.write(`\n🤖 AI (ラグ: ${latency}ms): `);
        responseStartAt = null;
      }
      process.stdout.write(event.delta);
      currentTranscript += event.delta;
      break;

    // 音声のトランスクリプト完了
    case "response.output_audio_transcript.done":
      console.log("\n");
      currentTranscript = "";
      messageIndex++;

      if (messageIndex < TEST_MESSAGES.length) {
        setTimeout(() => sendMessage(TEST_MESSAGES[messageIndex]), 800);
      } else {
        setTimeout(() => {
          const avg =
            latencies.length > 0
              ? Math.round(
                  latencies.reduce((a, b) => a + b, 0) / latencies.length
                )
              : "N/A";
          console.log("─".repeat(50));
          console.log(`📊 結果サマリー`);
          console.log(`  レスポンス数: ${latencies.length}`);
          console.log(`  ラグ一覧 (ms): ${latencies.join(", ")}`);
          console.log(`  平均ラグ: ${avg}ms`);
          if (typeof avg === "number") {
            if (avg < 500) console.log(`  評価: ✅ 良好（500ms未満）`);
            else if (avg < 1000) console.log(`  評価: ⚠️  普通（500〜1000ms）`);
            else console.log(`  評価: ❌ 遅い（1000ms超）`);
          }
          ws.close();
        }, 300);
      }
      break;

    case "error":
      console.error("\n❌ エラー:", JSON.stringify(event.error, null, 2));
      ws.close();
      break;

    // 無視するイベント
    case "session.created":
    case "session.updated":
    case "response.created":
    case "response.output_item.added":
    case "response.output_item.done":
    case "conversation.item.added":
    case "conversation.item.done":
    case "conversation.item.created":
    case "response.content_part.added":
    case "response.content_part.done":
    case "response.output_audio.delta":
    case "response.output_audio.done":
    case "response.done":
    case "rate_limits.updated":
      break;

    default:
      // 未知のイベントは表示
      console.log(`  [unknown event] ${event.type}`);
  }
});

ws.on("error", (err) => {
  console.error("❌ WebSocket エラー:", err.message);
});

ws.on("close", () => {
  console.log("接続クローズ");
});
