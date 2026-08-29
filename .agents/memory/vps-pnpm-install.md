---
name: VPS pnpm install
description: Production deployment dependency installation behavior on the SIN JAPAN VPS.
---

When a deployment script sources a production `.env`, set `NODE_ENV=development` on the `pnpm install` command so workspace build dependencies are installed.

**Why:** The VPS pnpm version honors the exported `NODE_ENV=production` and skips devDependencies even when `--prod=false` is passed, causing commands such as `tsc` to be unavailable before the build.

**How to apply:** Keep the runtime environment production after installation; override only the dependency-install command, then run the normal library builds, migrations, application builds, and process restart.