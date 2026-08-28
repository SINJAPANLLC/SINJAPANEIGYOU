/** Validates and finds the next occurrence for conventional five-field cron. */
export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const limits = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return fields.every((field, index) => field.split(",").every(part => {
    const [base, step] = part.split("/");
    if (step && (!/^\d+$/.test(step) || Number(step) < 1)) return false;
    return base === "*" || base.split("-").every(v => /^\d+$/.test(v) && Number(v) >= limits[index][0] && Number(v) <= limits[index][1]);
  }));
}
function matches(field: string, value: number): boolean {
  return field.split(",").some(part => {
    const [base, rawStep] = part.split("/"); const step = Number(rawStep || 1);
    let start = 0, end = 99;
    if (base !== "*") { const r = base.split("-").map(Number); start = r[0]; end = r[1] ?? r[0]; }
    return value >= start && value <= end && (value - start) % step === 0;
  });
}
export function nextCronRun(expression: string, after = new Date()): Date | null {
  if (!isValidCronExpression(expression)) return null;
  const f = expression.trim().split(/\s+/);
  const date = new Date(after); date.setSeconds(0, 0); date.setMinutes(date.getMinutes() + 1);
  for (let i = 0; i < 527040; i++, date.setMinutes(date.getMinutes() + 1)) {
    if (matches(f[0], date.getMinutes()) && matches(f[1], date.getHours()) &&
      matches(f[2], date.getDate()) && matches(f[3], date.getMonth() + 1) && matches(f[4], date.getDay())) return new Date(date);
  }
  return null;
}