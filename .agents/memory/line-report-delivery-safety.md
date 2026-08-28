---
name: LINE report delivery safety
description: Reliability rules for scheduled LINE reports when generation overlaps or delivery results are uncertain.
---

Use a unique fencing token for every report-generation lease, and allow only the current token owner to publish generated content or research sources. Treat network errors and partial multi-message delivery as delivery-unknown rather than retryable failure.

**Why:** A database uniqueness constraint prevents duplicate report rows but does not prevent an expired worker from overwriting a newer result or a retry from duplicating content already accepted by LINE.

**How to apply:** For any scheduled LINE report, reserve generation and sending with conditional database updates. Retry only failures that prove LINE rejected a single message; otherwise stop and surface a confirmation-required state.