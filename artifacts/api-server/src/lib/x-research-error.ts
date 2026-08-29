export type XResearchFailure = {
  message: string;
  terminal: boolean;
  code?: number;
  detail?: string;
};

type XApiErrorShape = {
  code?: number;
  message?: string;
  data?: {
    detail?: string;
    title?: string;
    errors?: Array<{ detail?: string; title?: string; message?: string }>;
  };
  errors?: Array<{ detail?: string; title?: string; message?: string }>;
};

function errorDetail(error: XApiErrorShape) {
  const nested = error.data?.errors?.[0] || error.errors?.[0];
  return [
    error.data?.detail,
    error.data?.title,
    nested?.detail,
    nested?.title,
    nested?.message,
    error.message,
  ].find((value) => typeof value === "string" && value.trim())?.trim();
}

export function describeXResearchError(error: unknown): XResearchFailure {
  const apiError = error as XApiErrorShape;
  const code = apiError?.code;
  const detail = errorDetail(apiError);
  const normalized = detail?.toLowerCase() || "";
  const explicitlyDepleted = [
    "credits depleted",
    "credit depleted",
    "insufficient credits",
    "insufficient credit",
    "credit balance",
  ].some((phrase) => normalized.includes(phrase));

  if (explicitlyDepleted) {
    return { message: "X APIクレジット残高不足", terminal: true, code, detail };
  }
  if (code === 402) {
    return {
      message: "X APIの請求またはProject利用設定エラー",
      terminal: true,
      code,
      detail,
    };
  }
  if (code === 401) {
    return { message: "X APIの認証に失敗しました", terminal: true, code, detail };
  }
  if (code === 403) {
    return { message: "X APIに投稿検索の権限がありません", terminal: true, code, detail };
  }
  if (code === 429) {
    return { message: "X APIの利用上限に達しました", terminal: true, code, detail };
  }
  return {
    message: detail || "X検索に失敗しました",
    terminal: false,
    code,
    detail,
  };
}