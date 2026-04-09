import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, unsubscribesTable, leadsTable } from "@workspace/db";
import { UnsubscribeLeadParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/unsubscribe/:token", async (req, res): Promise<void> => {
  const params = UnsubscribeLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [unsub] = await db
    .select()
    .from(unsubscribesTable)
    .where(eq(unsubscribesTable.token, params.data.token));

  if (!unsub) {
    res.json({ success: false, message: "無効なトークンです" });
    return;
  }

  await db.update(leadsTable).set({ status: "unsubscribed" }).where(eq(leadsTable.id, unsub.leadId));

  res.json({ success: true, message: "配信停止が完了しました。今後このアドレスにメールは送信されません。" });
});

export default router;
