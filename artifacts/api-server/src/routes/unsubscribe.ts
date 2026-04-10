import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, unsubscribesTable, leadsTable } from "@workspace/db";
import { UnsubscribeLeadParams } from "@workspace/api-zod";

const router: IRouter = Router();

const successHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>配信停止完了 | 合同会社SIN JAPAN</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border: 1px solid #e0e0e0;
      max-width: 480px;
      width: 100%;
      padding: 60px 40px;
      text-align: center;
      animation: fadeInUp 0.6s ease both;
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 28px;
      animation: scaleIn 0.5s 0.3s ease both;
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.6); }
      to   { opacity: 1; transform: scale(1); }
    }
    .icon svg { width: 32px; height: 32px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 14px; letter-spacing: 0.02em; }
    p { font-size: 14px; color: #666; line-height: 1.8; margin-bottom: 10px; }
    .divider { border: none; border-top: 1px solid #e8e8e8; margin: 32px 0; }
    .company { font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>配信停止が完了しました</h1>
    <p>ご連絡ありがとうございます。<br>今後このメールアドレスへの営業メールは<br>送信されません。</p>
    <hr class="divider">
    <p class="company">合同会社SIN JAPAN<br>info@sinjapan.jp</p>
  </div>
</body>
</html>`;

const errorHtml = (msg: string) => `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>エラー | 合同会社SIN JAPAN</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border: 1px solid #e0e0e0;
      max-width: 480px;
      width: 100%;
      padding: 60px 40px;
      text-align: center;
      animation: fadeInUp 0.6s ease both;
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #666;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 28px;
    }
    .icon svg { width: 32px; height: 32px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; }
    h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 14px; }
    p { font-size: 14px; color: #666; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
    <h1>リンクが無効です</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`;

router.get("/unsubscribe/:token", async (req, res): Promise<void> => {
  const params = UnsubscribeLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).send(errorHtml("無効なリンクです。"));
    return;
  }

  const [unsub] = await db
    .select()
    .from(unsubscribesTable)
    .where(eq(unsubscribesTable.token, params.data.token));

  if (!unsub) {
    res.status(404).send(errorHtml("このリンクは既に無効化されているか、存在しません。"));
    return;
  }

  await db.update(leadsTable).set({ status: "unsubscribed" }).where(eq(leadsTable.id, unsub.leadId));

  res.send(successHtml);
});

export default router;
