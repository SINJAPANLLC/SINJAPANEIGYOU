import crypto from "crypto";
import { type Request, type Response, type NextFunction } from "express";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const COOKIE_NAME = "session";
const ADMIN_USER_ID = "user_3C7asrFOwjN1TLVFhcGMuRgRGUs";

function sign(value: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

export function createSessionCookie(): string {
  const payload = `${ADMIN_USER_ID}.${Date.now()}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop()!;
  const payload = parts.join(".");
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const userId = parts[0];
  return userId ?? null;
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const cookie = req.cookies?.[COOKIE_NAME] as string | undefined;
  const userId = verifySessionCookie(cookie);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
};

export function getUserId(req: Request): string {
  return (req as any).userId as string;
}

export { COOKIE_NAME, ADMIN_USER_ID };
