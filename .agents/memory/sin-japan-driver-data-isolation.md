---
name: Driver data isolation
description: Security boundary for SIN JAPAN driver conversations and Airtable lookups.
---

Driver free text and manually entered identifiers must never be trusted as authorization scopes. Block possible credentials before every persistence, AI, notification, or reporting path. Return individual operational data only when an exact Airtable lookup key is matched against a configured lookup field, an explicit field allowlist, and a tenant boundary are all configured; otherwise provide company-common guidance only.

**Why:** A driver may accidentally send passwords or one-time codes, and loose text matching can reveal another driver's operational or personal information.

**How to apply:** Preserve this fail-closed behavior whenever adding a new LINE ingress, AI prompt, report export, or Airtable field. Use the registered lookup key only as an exact match; never reintroduce partial-name matching for individual records. Treat common company materials separately from driver-specific records.