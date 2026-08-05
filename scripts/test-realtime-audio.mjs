/**
 * OpenAI Realtime API 音声テスト
 * AIの返答を WAV ファイルとして保存する
 */

import WebSocket from "ws";
import fs from "fs";
import path from "path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY が設定されていません");
  process.exit(1);
}

const REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
const OUTPUT_DIR = "/home/runner/workspace/scripts/audio-out";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const TEST_MESSAGE = "こんにちは！弊社は営業効率化のSaaSを提供しております。少しだけお時間いただけますか？";

const ws = new WebSocket(REALTIME_URL, {
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
});

const audioChunks = [];
let responseStartAt = null;

ws.on("open", () => {
  console.log("✅ 接続成功");
  console.log(`🧑 送信: "${TEST_MESSAGE}"\n`);

  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      instructions: "あなたは日本語を話す受付担当です。営業電話に対して自然に、簡潔に2文程度で返してください。",
    },
  }));

  setTimeout(() => {
    responseStartAt = Date.now();
    ws.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: TEST_MESSAGE }],
      },
    }));
    ws.send(JSON.stringify({ type: "response.create" }));
  }, 400);
});

ws.on("message", (data) => {
  const event = JSON.parse(data.toString());

  switch (event.type) {
    case "response.output_audio.delta":
      audioChunks.push(Buffer.from(event.delta, "base64"));
      break;

    case "response.output_audio_transcript.delta":
      if (responseStartAt !== null) {
        const latency = Date.now() - responseStartAt;
        process.stdout.write(`🤖 AI (ラグ: ${latency}ms): `);
        responseStartAt = null;
      }
      process.stdout.write(event.delta);
      break;

    case "response.output_audio.done":
      console.log("\n");

      // PCM16 24kHz mono → WAV に変換して保存
      const pcmBuffer = Buffer.concat(audioChunks);
      const wavBuffer = pcm16ToWav(pcmBuffer, 24000, 1);
      const outPath = path.join(OUTPUT_DIR, "ai-response.wav");
      fs.writeFileSync(outPath, wavBuffer);
      console.log(`💾 音声ファイル保存: ${outPath}`);
      console.log(`   サイズ: ${(wavBuffer.length / 1024).toFixed(1)} KB`);
      console.log(`   時間: 約 ${(pcmBuffer.length / (24000 * 2)).toFixed(1)} 秒`);

      ws.close();
      break;

    case "error":
      console.error("❌ エラー:", JSON.stringify(event.error, null, 2));
      ws.close();
      break;
  }
});

ws.on("error", (err) => console.error("❌ WS エラー:", err.message));
ws.on("close", () => console.log("\n接続クローズ"));

// PCM16 → WAV ヘッダー付きバッファを生成
function pcm16ToWav(pcmData, sampleRate, channels) {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);           // subchunk1 size
  buf.writeUInt16LE(1, 20);            // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);           // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  pcmData.copy(buf, 44);

  return buf;
}
