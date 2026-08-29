---
name: SIN JAPAN unlinked groups
description: Safety and ownership rules for handling messages from LINE groups not yet linked to a driver.
---

Treat ordinary messages from unlinked SIN JAPAN groups as admin-owned operational reports, not driver records. Classify and preserve them, notify only the single designated administrator, and never reply in the group. Urgent or high-priority messages are immediate; normal operations messages wait for the scheduled driver summary at 9:00, 12:00, or 17:00 JST.

**Why:** An unlinked group has no trustworthy driver or owner relationship. Dropping its messages loses operational information, while broadcasting them or guessing a driver risks cross-user disclosure. Even five-minute routine digests create unnecessary notification noise.

**How to apply:** Keep unlinked reports separate until a valid one-time link code establishes identity. Show the group name or a short Japanese identifier. Include pending normal reports once in the next driver summary. Redact credential-like content. If LINE delivery is uncertain, surface that state instead of retrying automatically.