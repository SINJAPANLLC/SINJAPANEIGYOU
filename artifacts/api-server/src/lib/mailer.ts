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
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  });
}

export async function sendEmail(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(opts);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    logger.error({ err }, "Failed to send email");
    return { success: false, error: err?.message || "Unknown error" };
  }
}

/** Performs SMTP authentication without exposing host credentials. */
export async function verifySmtpConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await createTransporter().verify();
    return { success: true };
  } catch (err: any) {
    logger.error({ err }, "SMTP verification failed");
    return { success: false, error: err?.message || "SMTP verification failed" };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
