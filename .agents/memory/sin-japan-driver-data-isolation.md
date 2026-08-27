---
name: Driver data isolation
description: Security boundary for SIN JAPAN driver conversations and Airtable lookups.
---

Driver free text and manually entered identifiers must never be trusted as authorization scopes. Block possible credentials before every persistence, AI, notification, or reporting path. Return individual operational data only when an exact Airtable lookup key is matched against a configured lookup field, an explicit field allowlist, and a tenant boundary are all configured; otherwise provide company-common guidance only.

**Why:** A driver may accidentally send passwords or one-time codes, and loose text matching can reveal another driver's operational or personal information.

**How to apply:** Preserve this fail-closed behavior whenever adding a new LINE ingress, AI prompt, report export, or Airtable field. Use the registered lookup key only as an exact match; never reintroduce partial-name matching for individual records. Treat common company materials separately from driver-specific records.

稼働報告用グループでは、受信内容を記録し、事故・欠勤などの緊急内容だけを管理者へ通知する。グループ内への案内、AI回答、認証失敗通知を含む返信は行わない。

**Why:** 稼働中の業務グループを会話ボットで妨げず、管理者が必要な状況だけを把握できるようにするため。

**How to apply:** 稼働用のLINEイベントは、紐付け・重複確認・安全な報告記録・緊急通知までで必ず終了させる。採用・面談用と同じ返信処理や初回案内処理へ合流させない。