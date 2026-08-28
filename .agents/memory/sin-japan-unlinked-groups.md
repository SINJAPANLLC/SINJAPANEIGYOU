---
name: SIN JAPAN unlinked groups
description: Safety and ownership rules for handling messages from LINE groups not yet linked to a driver.
---

Treat ordinary messages from unlinked SIN JAPAN groups as admin-owned operational reports, not driver records. Classify and preserve them, notify only the single designated administrator, and never reply in the group. Urgent or high-priority messages are immediate; normal operations messages are delivered as a five-minute digest.

**Why:** An unlinked group has no trustworthy driver or owner relationship. Dropping its messages loses operational information, while broadcasting them or guessing a driver risks cross-user disclosure. Per-message alerts for routine operations create unnecessary noise.

**How to apply:** Keep unlinked reports separate from driver reports until a valid one-time link code establishes identity. Show the LINE group name when available, otherwise a short Japanese identifier. Redact credential-like content rather than storing or forwarding it. Send once; if LINE delivery is uncertain, surface that state instead of retrying automatically.