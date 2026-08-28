const unsupportedClaims = [
  /導入実績|利用実績|導入社数|顧客数|満足度|No\.?\s*1/i,
  /無料(?!.*(?:場合|相談|お試し))|最安|必ず|絶対|確実|保証/,
  /提携(?:先|済|しています)|パートナー(?:企業|提携)/,
  /高単価|高収入|安定収入|平均|最大\d+%|即日|初期費用ゼロ|料金改定/i,
  /(?:登録|導入|利用|提携|顧客|実績|削減|達成)[^。<\n]{0,24}\d+\s*(?:社|件|名|%|時間|倍)/i,
  /全国\s*47|リスクゼロ|高還元|急増|実績豊富|公式エージェンシー|一切(?:費用が)?かかりません/i,
  /\d+\s*(?:社|名|時間)以上|\d+\s*時間以内/i,
];

export function hasUnsupportedEmailClaims(values: string[]) {
  return unsupportedClaims.some((pattern) => pattern.test(values.join("\n")));
}