const unsupportedClaims = [
  /導入実績|利用実績|導入社数|顧客数|満足度|No\.?\s*1/i,
  /無料(?!.*(?:場合|相談|お試し))|最安|必ず|絶対|確実|保証/,
  /提携(?:先|済|しています)|パートナー(?:企業|提携)/,
  /高単価|高収入|安定収入|平均|最大\d+%|即日|初期費用ゼロ|料金改定/i,
];

export function hasUnsupportedEmailClaims(values: string[]) {
  return unsupportedClaims.some((pattern) => pattern.test(values.join("\n")));
}