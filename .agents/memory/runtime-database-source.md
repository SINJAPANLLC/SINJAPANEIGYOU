---
name: Runtime database source
description: Which database connection must be used when checking operational app data.
---

Check operational records through the same database connection selected by the running app. Do not assume the standard Replit database query surface contains the app's live development records.

**Why:** This workspace can expose both a standard Replit PostgreSQL database and a separately configured Neon database. They contain different business and template records, while the application prioritizes the Neon connection.

**How to apply:** For questions about current businesses, templates, leads, campaigns, or assistant data, compare against the runtime connection selection without displaying credentials. Use the standard database surface only after confirming it resolves to the same database.