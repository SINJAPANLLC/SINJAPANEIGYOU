import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSinJapanUnlinkedDigest,
  buildSinJapanUnlinkedImmediateNotification,
  isSinJapanImmediateUrgency,
  sinJapanReportTypeLabel,
  sinJapanUnlinkedGroupLabel,
  sinJapanUrgencyLabel,
} from "./sin-japan-notification-format";

test("内部の分類・緊急度を日本語表示へ変換する", () => {
  assert.equal(sinJapanReportTypeLabel("question"), "質問・相談");
  assert.equal(sinJapanReportTypeLabel("incident"), "事故・トラブル");
  assert.equal(sinJapanUrgencyLabel("normal"), "通常");
  assert.equal(sinJapanUrgencyLabel("urgent"), "緊急");
  assert.equal(isSinJapanImmediateUrgency("urgent"), true);
  assert.equal(isSinJapanImmediateUrgency("high"), true);
  assert.equal(isSinJapanImmediateUrgency("normal"), false);
});

test("グループ名を優先し、取得できない場合は短い識別番号を表示する", () => {
  assert.equal(sinJapanUnlinkedGroupLabel("C123456789", " 東京第1便 "), "東京第1便");
  assert.equal(
    sinJapanUnlinkedGroupLabel("C123456789", null),
    "未紐付けグループ（識別番号：456789）",
  );
});

test("即時通知に長いGroup IDや英語の内部値を表示しない", () => {
  const message = buildSinJapanUnlinkedImmediateNotification({
    groupId: "C123456789",
    groupName: null,
    reportType: "incident",
    urgency: "urgent",
    content: "車両が故障しました",
    createdAt: "2026-08-28T09:00:00.000Z",
  });
  assert.match(message, /識別番号：456789/);
  assert.match(message, /分類：事故・トラブル/);
  assert.match(message, /緊急度：緊急/);
  assert.doesNotMatch(message, /C123456789|incident|urgent/);
});

test("通常通知をグループ単位の日本語一覧へまとめる", () => {
  const message = buildSinJapanUnlinkedDigest([
    {
      groupId: "C123456789",
      groupName: "東京第1便",
      reportType: "question",
      urgency: "normal",
      content: "確認をお願いします",
      createdAt: "2026-08-28T09:00:00.000Z",
    },
    {
      groupId: "C123456789",
      groupName: "東京第1便",
      reportType: "milestone",
      urgency: "normal",
      content: "集荷に到着しました",
      createdAt: "2026-08-28T09:01:00.000Z",
    },
  ]);
  assert.match(message, /通常の業務連絡をまとめてお知らせします（2件）/);
  assert.match(message, /■ 東京第1便/);
  assert.match(message, /質問・相談/);
  assert.match(message, /稼働進捗/);
});