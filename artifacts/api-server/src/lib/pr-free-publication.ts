function normalizeTitle(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[\s　「」『』【】（）()・／/、。,.!！?？:：\-―—–]/g, "")
    .toLowerCase();
}

export function isPrFreePublicTitleMatch(
  publicTitle: string,
  submittedTitle: string,
  serviceName: string,
): boolean {
  const normalizedPublic = normalizeTitle(publicTitle);
  const acceptedTitles = [
    normalizeTitle(submittedTitle),
    normalizeTitle(`${serviceName}／${submittedTitle}`),
  ];
  return acceptedTitles.includes(normalizedPublic);
}