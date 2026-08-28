type UnlinkedGroupReportForNotification = {
  groupId: string;
  groupName?: string | null;
  reportType: string;
  urgency: string;
  content: string;
  createdAt: Date | string;
};

const reportTypeLabels: Record<string, string> = {
  incident: "事故・トラブル",
  attendance: "稼働・配車確認",
  shift_end: "稼働終了報告",
  milestone: "稼働進捗",
  question: "質問・相談",
};

const urgencyLabels: Record<string, string> = {
  urgent: "緊急",
  high: "要確認",
  normal: "通常",
};

export function sinJapanReportTypeLabel(reportType: string) {
  return reportTypeLabels[reportType] || "業務連絡";
}

export function sinJapanUrgencyLabel(urgency: string) {
  return urgencyLabels[urgency] || "通常";
}

export function isSinJapanImmediateUrgency(urgency: string) {
  return urgency === "urgent" || urgency === "high";
}

export function sinJapanUnlinkedGroupLabel(groupId: string, groupName?: string | null) {
  const safeName = groupName?.replace(/\s+/g, " ").trim();
  if (safeName) return safeName.slice(0, 80);
  const shortId = groupId.slice(-6).toUpperCase() || "不明";
  return `未紐付けグループ（識別番号：${shortId}）`;
}

function formatJapanTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildSinJapanUnlinkedImmediateNotification(report: UnlinkedGroupReportForNotification) {
  return [
    "【要確認｜SIN JAPAN 未紐付けグループ】",
    `グループ：${sinJapanUnlinkedGroupLabel(report.groupId, report.groupName)}`,
    `分類：${sinJapanReportTypeLabel(report.reportType)}`,
    `緊急度：${sinJapanUrgencyLabel(report.urgency)}`,
    `内容：${report.content}`,
    "",
    "このグループはドライバーと未紐付けです。",
    "確認後、管理画面で発行した6桁コードをグループへ送信して紐付けてください。",
  ].join("\n");
}

export function buildSinJapanUnlinkedDigest(reports: UnlinkedGroupReportForNotification[]) {
  const ordered = [...reports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const grouped = new Map<string, UnlinkedGroupReportForNotification[]>();
  for (const report of ordered) {
    const key = `${report.groupId}\u0000${report.groupName || ""}`;
    const current = grouped.get(key) || [];
    current.push(report);
    grouped.set(key, current);
  }

  const lines = [
    "【SIN JAPAN｜未紐付けグループまとめ】",
    `通常の業務連絡をまとめてお知らせします（${reports.length}件）。`,
  ];
  for (const groupReports of grouped.values()) {
    const first = groupReports[0];
    lines.push(
      "",
      `■ ${sinJapanUnlinkedGroupLabel(first.groupId, first.groupName)}`,
      ...groupReports.map((report) =>
        `・${formatJapanTime(report.createdAt)}｜${sinJapanReportTypeLabel(report.reportType)}｜${report.content.slice(0, 180)}`,
      ),
    );
  }
  lines.push("", "必要なグループは、管理画面で発行した6桁コードを送信して紐付けてください。");
  return lines.join("\n");
}