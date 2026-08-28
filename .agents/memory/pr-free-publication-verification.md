---
name: PR-FREE publication verification
description: External acceptance and publication semantics for the PR-FREE automation.
---

Treat a successful PR-FREE form response as submission acceptance, never as editorial approval or publication. Mark an article published only after its exact normalized title appears in PR-FREE's public WordPress search results.

**Why:** PR-FREE confirms receipt before editorial review, so a successful browser submission can remain unpublished or be rejected without a review-status API.

**How to apply:** Keep submitted and published states separate, retain the receipt or failure message, verify conservatively against the public page URL, and avoid automatically retrying accepted submissions.