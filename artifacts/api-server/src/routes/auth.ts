import { Router } from "express";
import { clerkClient } from "@clerk/express";
import crypto from "crypto";

const router = Router();

const ADMIN_EMAIL = "info@sinjapan.jp";
const ADMIN_USER_ID = "user_3C7asrFOwjN1TLVFhcGMuRgRGUs";
// Hash of "Kazuya8008" with salt
const ADMIN_PASS_HASH = "6e98add63b147287b9572f482cbfb60284bc32c9131adeb48ef3dad922c5f5d7";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "sinjapan-salt-2024").digest("hex");
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "メールアドレスとパスワードを入力してください。" });
    return;
  }

  if (email.toLowerCase() !== ADMIN_EMAIL) {
    // Simulate timing attack prevention
    hashPassword(password);
    res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません。" });
    return;
  }

  const inputHash = hashPassword(password);
  if (inputHash !== ADMIN_PASS_HASH) {
    res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません。" });
    return;
  }

  try {
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: ADMIN_USER_ID,
      expiresInSeconds: 60,
    });
    res.json({ token: signInToken.token });
  } catch (err) {
    res.status(500).json({ error: "認証トークンの発行に失敗しました。" });
  }
});

export default router;
