import nodemailer from "nodemailer";
import { logger } from "./logger";

export function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendEmail(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter();
    await transporter.sendMail(opts);
    return { success: true };
  } catch (err: any) {
    logger.error({ err }, "Failed to send email");
    return { success: false, error: err?.message || "Unknown error" };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
