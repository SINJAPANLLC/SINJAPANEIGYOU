import { getAuth } from "@clerk/express";
import { type Request, type Response, type NextFunction } from "express";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const auth = getAuth(req);
  const userId = auth?.userId;
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
