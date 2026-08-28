function normalizeBase(value: string) {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("配信停止URLにはHTTPSの公開URLが必要です");
  }
  return url.toString().replace(/\/+$/, "");
}

export function getPublicAppUrl() {
  const configured = process.env.APP_URL?.trim()
    || process.env.REPLIT_DEPLOYMENT_DOMAIN?.trim()
    || process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
    || process.env.REPLIT_DEV_DOMAIN?.trim();
  if (!configured) throw new Error("APP_URLまたは公開ドメインが設定されていません");
  return normalizeBase(configured);
}

export function buildUnsubscribeUrl(token: string) {
  if (!token) throw new Error("配信停止トークンがありません");
  return `${getPublicAppUrl()}/api/unsubscribe/${encodeURIComponent(token)}`;
}