import { Router } from "express";
import crypto from "crypto";
import { createSessionCookie, verifySessionCookie, COOKIE_NAME, ADMIN_USER_ID } from "../lib/auth";

const router = Router();

const ADMIN_EMAIL = "info@sinjapan.jp";
const ADMIN_PASS_HASH = "6e98add63b147287b9572f482cbfb60284bc32c9131adeb48ef3dad922c5f5d7";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "sinjapan-salt-2024").digest("hex");
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "メールアドレスとパスワードを入力してください。" });
    return;
  }

  if (email.toLowerCase() !== ADMIN_EMAIL) {
    hashPassword(password);
    res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません。" });
    return;
  }

  if (hashPassword(password) !== ADMIN_PASS_HASH) {
    res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません。" });
    return;
  }

  const sessionValue = createSessionCookie();
  res.cookie(COOKIE_NAME, sessionValue, COOKIE_OPTS);
  res.json({ ok: true, userId: ADMIN_USER_ID });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", (req, res) => {
  const cookie = req.cookies?.[COOKIE_NAME] as string | undefined;
  const userId = verifySessionCookie(cookie);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ userId, email: ADMIN_EMAIL });
});

export default router;
